"""GitLab review provider implementation.

Uses the GitLab REST API to fetch MR metadata, diffs, discussions, and post
reviews. GitLab has NO atomic review concept -- each inline comment is a
separate discussion thread. Approval and unapproval are separate API calls.
"""

from __future__ import annotations

import logging
from typing import Any

import httpx

from app.services.review_service import ReviewProvider

logger = logging.getLogger(__name__)


class GitLabReviewProvider(ReviewProvider):
    """GitLab-specific review implementation using the REST API v4.

    Key differences from GitHub:
    - No atomic reviews: each comment creates an individual discussion thread
    - Comments require a `position` object with base_sha, head_sha, start_sha
    - Approval and "request changes" are separate endpoints
    - Discussions are already threaded (notes within discussions)
    """

    def __init__(
        self,
        token: str,
        project_id: str,
        gitlab_url: str = "https://gitlab.com",
    ) -> None:
        self._token = token
        self._project_id = project_id
        self._base = f"{gitlab_url.rstrip('/')}/api/v4/projects/{project_id}"

    def _headers(self) -> dict[str, str]:
        return {
            "PRIVATE-TOKEN": self._token,
            "Content-Type": "application/json",
        }

    async def get_mr_metadata(self, mr_id: str) -> dict[str, Any]:
        """Fetch MR metadata including diff_refs (critical for comment positioning)."""
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.get(
                f"{self._base}/merge_requests/{mr_id}",
                headers=self._headers(),
            )
            resp.raise_for_status()
            data = resp.json()

        diff_refs = data.get("diff_refs") or {}
        pipeline = data.get("pipeline") or {}

        return {
            "id": data["iid"],
            "title": data["title"],
            "author": data.get("author", {}).get("username", ""),
            "state": data["state"],
            "reviewers": [
                r["username"] for r in data.get("reviewers", [])
            ],
            "pipeline_status": pipeline.get("status"),
            "base_sha": diff_refs.get("base_sha", ""),
            "head_sha": diff_refs.get("head_sha", ""),
            "start_sha": diff_refs.get("start_sha", ""),
            "web_url": data.get("web_url", ""),
            "source_branch": data.get("source_branch", ""),
            "target_branch": data.get("target_branch", ""),
            "draft": data.get("draft", False),
            "merge_status": data.get("merge_status"),
            "created_at": data.get("created_at"),
            "updated_at": data.get("updated_at"),
        }

    async def get_mr_diff(self, mr_id: str) -> dict[str, Any]:
        """Fetch changed files with per-file diffs.

        Uses GET /projects/{id}/merge_requests/{iid}/changes which includes
        the changes array with diff content per file.
        """
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.get(
                f"{self._base}/merge_requests/{mr_id}/changes",
                headers=self._headers(),
            )
            resp.raise_for_status()
            data = resp.json()

        files = []
        for change in data.get("changes", []):
            files.append({
                "filename": change.get("new_path", ""),
                "old_filename": change.get("old_path", ""),
                "status": _map_gitlab_status(change),
                "diff": change.get("diff", ""),
                "new_file": change.get("new_file", False),
                "renamed_file": change.get("renamed_file", False),
                "deleted_file": change.get("deleted_file", False),
            })

        return {
            "files": files,
            "total_files": len(files),
        }

    async def get_mr_comments(self, mr_id: str) -> list[dict[str, Any]]:
        """Fetch existing discussions (already threaded in GitLab API).

        GitLab discussions contain notes. Each discussion is a thread.
        """
        discussions: list[dict[str, Any]] = []
        page = 1

        async with httpx.AsyncClient(timeout=30.0) as client:
            while True:
                resp = await client.get(
                    f"{self._base}/merge_requests/{mr_id}/discussions",
                    headers=self._headers(),
                    params={"per_page": 100, "page": page},
                )
                resp.raise_for_status()
                page_data = resp.json()
                if not page_data:
                    break

                for disc in page_data:
                    notes = []
                    for note in disc.get("notes", []):
                        position = note.get("position") or {}
                        notes.append({
                            "id": note["id"],
                            "author": note.get("author", {}).get("username", ""),
                            "body": note.get("body", ""),
                            "path": position.get("new_path"),
                            "line": position.get("new_line"),
                            "old_line": position.get("old_line"),
                            "created_at": note.get("created_at"),
                            "updated_at": note.get("updated_at"),
                            "system": note.get("system", False),
                        })
                    discussions.append({
                        "thread_id": disc["id"],
                        "comments": notes,
                    })

                if len(page_data) < 100:
                    break
                page += 1

        return discussions

    async def post_review(
        self,
        mr_id: str,
        comments: list[dict[str, Any]],
        event: str,
        body: str,
    ) -> dict[str, Any]:
        """Post a review by creating individual discussion threads.

        GitLab has NO atomic review concept. Each comment creates a separate
        discussion thread with a position object. After posting comments,
        the event (APPROVE/REQUEST_CHANGES) is handled via separate calls.

        Comment format: {"path": str, "line": int, "body": str,
                         "base_sha": str, "head_sha": str, "start_sha": str}
        """
        created_discussions: list[dict[str, Any]] = []

        async with httpx.AsyncClient(timeout=30.0) as client:
            # Post individual discussion threads for each comment
            for c in comments:
                position = {
                    "position_type": "text",
                    "base_sha": c.get("base_sha", ""),
                    "head_sha": c.get("head_sha", ""),
                    "start_sha": c.get("start_sha", ""),
                    "new_path": c["path"],
                    "new_line": c.get("line"),
                }
                if c.get("old_line"):
                    position["old_path"] = c.get("old_path", c["path"])
                    position["old_line"] = c["old_line"]

                payload = {
                    "body": c["body"],
                    "position": position,
                }

                try:
                    resp = await client.post(
                        f"{self._base}/merge_requests/{mr_id}/discussions",
                        headers=self._headers(),
                        json=payload,
                    )
                    resp.raise_for_status()
                    data = resp.json()
                    created_discussions.append({
                        "discussion_id": data["id"],
                        "body": c["body"],
                        "path": c["path"],
                    })
                except httpx.HTTPStatusError as exc:
                    logger.warning(
                        "Failed to create discussion for %s:%s: %s",
                        c["path"],
                        c.get("line"),
                        exc,
                    )

            # Post general review body as a note if provided
            if body:
                try:
                    resp = await client.post(
                        f"{self._base}/merge_requests/{mr_id}/notes",
                        headers=self._headers(),
                        json={"body": body},
                    )
                    resp.raise_for_status()
                except httpx.HTTPStatusError as exc:
                    logger.warning("Failed to post review body note: %s", exc)

        # Handle the review event
        event_upper = event.upper()
        if event_upper == "APPROVE":
            await self.approve(mr_id)
        elif event_upper == "REQUEST_CHANGES":
            await self.request_changes(mr_id, body or "Changes requested")

        return {
            "discussions_created": len(created_discussions),
            "discussions": created_discussions,
            "event": event_upper,
        }

    async def reply_to_comment(
        self, mr_id: str, thread_id: str, body: str
    ) -> dict[str, Any]:
        """Reply to an existing discussion thread.

        Uses POST /projects/{id}/merge_requests/{iid}/discussions/{discussion_id}/notes
        """
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(
                f"{self._base}/merge_requests/{mr_id}/discussions/{thread_id}/notes",
                headers=self._headers(),
                json={"body": body},
            )
            resp.raise_for_status()
            data = resp.json()

        return {
            "id": data["id"],
            "body": data.get("body", ""),
            "author": data.get("author", {}).get("username", ""),
            "created_at": data.get("created_at"),
        }

    async def approve(self, mr_id: str) -> dict[str, Any]:
        """Approve the MR via POST /projects/{id}/merge_requests/{iid}/approve."""
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(
                f"{self._base}/merge_requests/{mr_id}/approve",
                headers=self._headers(),
            )
            resp.raise_for_status()
            return resp.json()

    async def request_changes(self, mr_id: str, body: str) -> dict[str, Any]:
        """Request changes on the MR.

        GitLab has no formal "request changes" event. This posts a comment
        noting that changes are requested, then unapproves the MR if it
        was previously approved.
        """
        result: dict[str, Any] = {"body_posted": False, "unapproved": False}

        async with httpx.AsyncClient(timeout=30.0) as client:
            # Post the request-changes comment
            try:
                resp = await client.post(
                    f"{self._base}/merge_requests/{mr_id}/notes",
                    headers=self._headers(),
                    json={"body": body},
                )
                resp.raise_for_status()
                result["body_posted"] = True
            except httpx.HTTPStatusError as exc:
                logger.warning("Failed to post request-changes comment: %s", exc)

            # Unapprove the MR
            try:
                resp = await client.post(
                    f"{self._base}/merge_requests/{mr_id}/unapprove",
                    headers=self._headers(),
                )
                resp.raise_for_status()
                result["unapproved"] = True
            except httpx.HTTPStatusError as exc:
                # 401/404 is expected if not previously approved
                logger.debug("Unapprove failed (may not have been approved): %s", exc)

        return result


def _map_gitlab_status(change: dict[str, Any]) -> str:
    """Map GitLab change flags to a status string matching GitHub conventions."""
    if change.get("new_file"):
        return "added"
    if change.get("deleted_file"):
        return "removed"
    if change.get("renamed_file"):
        return "renamed"
    return "modified"
