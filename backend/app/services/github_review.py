"""GitHub review provider implementation.

Uses the GitHub REST API to fetch PR metadata, diffs, comments, and post
reviews. GitHub supports atomic reviews -- a single POST creates all
comments and the review event (APPROVE/REQUEST_CHANGES/COMMENT) together.
"""

from __future__ import annotations

import logging
from collections import defaultdict
from typing import Any

import httpx

from app.services.review_service import ReviewProvider

logger = logging.getLogger(__name__)

GITHUB_API_BASE = "https://api.github.com"


class GitHubReviewProvider(ReviewProvider):
    """GitHub-specific review implementation using the REST API.

    GitHub reviews are atomic: one POST /repos/{owner}/{repo}/pulls/{number}/reviews
    creates all inline comments and sets the review event in a single request.
    """

    def __init__(self, token: str, owner: str, repo: str) -> None:
        self._token = token
        self._owner = owner
        self._repo = repo
        self._base = f"{GITHUB_API_BASE}/repos/{owner}/{repo}"

    def _headers(self) -> dict[str, str]:
        return {
            "Authorization": f"Bearer {self._token}",
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
        }

    async def get_mr_metadata(self, mr_id: str) -> dict[str, Any]:
        """Fetch PR metadata: title, author, status, reviewers, head/base refs."""
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.get(
                f"{self._base}/pulls/{mr_id}",
                headers=self._headers(),
            )
            resp.raise_for_status()
            data = resp.json()

        return {
            "id": data["number"],
            "title": data["title"],
            "author": data["user"]["login"],
            "state": data["state"],
            "reviewers": [r["login"] for r in data.get("requested_reviewers", [])],
            "head_ref": data["head"]["ref"],
            "base_ref": data["base"]["ref"],
            "head_sha": data["head"]["sha"],
            "base_sha": data["base"]["sha"],
            "html_url": data["html_url"],
            "draft": data.get("draft", False),
            "mergeable": data.get("mergeable"),
            "created_at": data["created_at"],
            "updated_at": data["updated_at"],
        }

    async def get_mr_diff(self, mr_id: str) -> dict[str, Any]:
        """Fetch changed files with per-file diffs.

        Uses GET /repos/{owner}/{repo}/pulls/{number}/files which returns
        a list of files with their patches (unified diff per file).
        """
        files: list[dict[str, Any]] = []
        page = 1

        async with httpx.AsyncClient(timeout=30.0) as client:
            while True:
                resp = await client.get(
                    f"{self._base}/pulls/{mr_id}/files",
                    headers=self._headers(),
                    params={"per_page": 100, "page": page},
                )
                resp.raise_for_status()
                page_data = resp.json()
                if not page_data:
                    break

                for f in page_data:
                    files.append({
                        "filename": f["filename"],
                        "status": f["status"],
                        "additions": f["additions"],
                        "deletions": f["deletions"],
                        "changes": f["changes"],
                        "patch": f.get("patch", ""),
                        "previous_filename": f.get("previous_filename"),
                    })

                if len(page_data) < 100:
                    break
                page += 1

        return {
            "files": files,
            "total_files": len(files),
        }

    async def get_mr_comments(self, mr_id: str) -> list[dict[str, Any]]:
        """Fetch existing review comments grouped as threads.

        GitHub review comments are flat but use in_reply_to_id to form threads.
        Groups comments by their root comment to produce thread structure.
        """
        raw_comments: list[dict[str, Any]] = []
        page = 1

        async with httpx.AsyncClient(timeout=30.0) as client:
            while True:
                resp = await client.get(
                    f"{self._base}/pulls/{mr_id}/comments",
                    headers=self._headers(),
                    params={"per_page": 100, "page": page},
                )
                resp.raise_for_status()
                page_data = resp.json()
                if not page_data:
                    break
                raw_comments.extend(page_data)
                if len(page_data) < 100:
                    break
                page += 1

        # Group into threads by in_reply_to_id
        threads: dict[int, list[dict[str, Any]]] = defaultdict(list)
        for comment in raw_comments:
            root_id = comment.get("in_reply_to_id") or comment["id"]
            threads[root_id].append({
                "id": comment["id"],
                "author": comment["user"]["login"],
                "body": comment["body"],
                "path": comment.get("path"),
                "line": comment.get("line"),
                "side": comment.get("side"),
                "created_at": comment["created_at"],
                "updated_at": comment["updated_at"],
            })

        return [
            {
                "thread_id": str(thread_id),
                "comments": sorted(comments, key=lambda c: c["created_at"]),
            }
            for thread_id, comments in threads.items()
        ]

    async def post_review(
        self,
        mr_id: str,
        comments: list[dict[str, Any]],
        event: str,
        body: str,
    ) -> dict[str, Any]:
        """Post an atomic review with comments and event.

        GitHub's review API accepts all comments in a single POST along with
        the review event (APPROVE, REQUEST_CHANGES, COMMENT).

        Comment format: {"path": str, "line": int, "side": str, "body": str}
        Uses the newer line+side API (not deprecated position field).
        """
        review_comments = []
        for c in comments:
            comment_data: dict[str, Any] = {
                "path": c["path"],
                "body": c["body"],
            }
            if "line" in c and c["line"] is not None:
                comment_data["line"] = c["line"]
                comment_data["side"] = c.get("side", "RIGHT")
            review_comments.append(comment_data)

        payload: dict[str, Any] = {
            "event": event.upper(),
            "body": body,
        }
        if review_comments:
            payload["comments"] = review_comments

        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(
                f"{self._base}/pulls/{mr_id}/reviews",
                headers=self._headers(),
                json=payload,
            )
            resp.raise_for_status()
            data = resp.json()

        return {
            "review_id": data["id"],
            "state": data["state"],
            "html_url": data.get("html_url", ""),
        }

    async def reply_to_comment(
        self, mr_id: str, thread_id: str, body: str
    ) -> dict[str, Any]:
        """Reply to an existing review comment thread.

        Uses POST /repos/{owner}/{repo}/pulls/{number}/comments/{comment_id}/replies
        """
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(
                f"{self._base}/pulls/{mr_id}/comments/{thread_id}/replies",
                headers=self._headers(),
                json={"body": body},
            )
            resp.raise_for_status()
            data = resp.json()

        return {
            "id": data["id"],
            "body": data["body"],
            "author": data["user"]["login"],
            "created_at": data["created_at"],
        }

    async def approve(self, mr_id: str) -> dict[str, Any]:
        """Approve the PR (shorthand for post_review with APPROVE event)."""
        return await self.post_review(
            mr_id=mr_id,
            comments=[],
            event="APPROVE",
            body="",
        )

    async def request_changes(self, mr_id: str, body: str) -> dict[str, Any]:
        """Request changes on the PR (shorthand for post_review with REQUEST_CHANGES)."""
        return await self.post_review(
            mr_id=mr_id,
            comments=[],
            event="REQUEST_CHANGES",
            body=body,
        )
