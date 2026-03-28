"""Review provider abstraction for GitHub and GitLab MR/PR operations.

Defines the ReviewProvider ABC and factory function for creating
provider instances based on source type.
"""

from abc import ABC, abstractmethod

import httpx


class ReviewProvider(ABC):
    """Abstract base class for MR/PR review operations."""

    @abstractmethod
    async def get_mr_metadata(self, mr_id: str) -> dict:
        """Fetch MR/PR title, author, status, reviewers, pipeline, diff_refs."""
        ...

    @abstractmethod
    async def get_mr_diff(self, mr_id: str) -> dict:
        """Fetch changed files with per-file diffs."""
        ...

    @abstractmethod
    async def get_mr_comments(self, mr_id: str) -> list[dict]:
        """Fetch existing comments as threads."""
        ...

    @abstractmethod
    async def post_review(
        self, mr_id: str, comments: list[dict], event: str, body: str
    ) -> dict:
        """Post review with comments + event."""
        ...

    @abstractmethod
    async def reply_to_comment(
        self, mr_id: str, thread_id: str, body: str
    ) -> dict:
        """Reply to existing thread."""
        ...

    @abstractmethod
    async def approve(self, mr_id: str) -> dict:
        """Approve the MR/PR."""
        ...

    @abstractmethod
    async def request_changes(self, mr_id: str, body: str) -> dict:
        """Request changes (GitLab: post comment + unapprove)."""
        ...


class GitHubReviewProvider(ReviewProvider):
    """GitHub pull request review provider."""

    BASE_URL = "https://api.github.com"

    def __init__(self, token: str, owner: str, repo: str) -> None:
        self.token = token
        self.owner = owner
        self.repo = repo
        self._headers = {
            "Authorization": f"Bearer {token}",
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
        }

    async def get_mr_metadata(self, mr_id: str) -> dict:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.get(
                f"{self.BASE_URL}/repos/{self.owner}/{self.repo}/pulls/{mr_id}",
                headers=self._headers,
            )
            resp.raise_for_status()
            data = resp.json()
            return {
                "mr_id": str(data["number"]),
                "title": data["title"],
                "description": data.get("body"),
                "author": data["user"]["login"],
                "status": data["state"],
                "source_branch": data["head"]["ref"],
                "target_branch": data["base"]["ref"],
                "reviewers": [r["login"] for r in data.get("requested_reviewers", [])],
                "pipeline_status": None,
                "url": data["html_url"],
                "provider": "github",
            }

    async def get_mr_diff(self, mr_id: str) -> dict:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.get(
                f"{self.BASE_URL}/repos/{self.owner}/{self.repo}/pulls/{mr_id}/files",
                headers=self._headers,
            )
            resp.raise_for_status()
            files = resp.json()
            return {
                "files": [
                    {
                        "filename": f["filename"],
                        "status": f["status"],
                        "patch": f.get("patch", ""),
                    }
                    for f in files
                ]
            }

    async def get_mr_comments(self, mr_id: str) -> list[dict]:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.get(
                f"{self.BASE_URL}/repos/{self.owner}/{self.repo}/pulls/{mr_id}/comments",
                headers=self._headers,
            )
            resp.raise_for_status()
            comments = resp.json()

        # Group comments into threads by in_reply_to_id
        threads: dict[str, dict] = {}
        for c in comments:
            reply_to = c.get("in_reply_to_id")
            note = {
                "id": str(c["id"]),
                "author": c["user"]["login"],
                "body": c["body"],
                "created_at": c["created_at"],
                "updated_at": c.get("updated_at"),
            }
            if reply_to and str(reply_to) in threads:
                threads[str(reply_to)]["comments"].append(note)
            else:
                thread_id = str(c["id"])
                threads[thread_id] = {
                    "id": thread_id,
                    "file_path": c.get("path"),
                    "line": c.get("line") or c.get("original_line"),
                    "side": "RIGHT" if c.get("side", "RIGHT") == "RIGHT" else "LEFT",
                    "resolved": False,
                    "comments": [note],
                }
        return list(threads.values())

    async def post_review(
        self, mr_id: str, comments: list[dict], event: str, body: str
    ) -> dict:
        review_comments = [
            {
                "path": c["file_path"],
                "line": c["line"],
                "side": c.get("side", "RIGHT"),
                "body": c["body"],
            }
            for c in comments
        ]
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(
                f"{self.BASE_URL}/repos/{self.owner}/{self.repo}/pulls/{mr_id}/reviews",
                headers=self._headers,
                json={
                    "body": body,
                    "event": event,
                    "comments": review_comments,
                },
            )
            resp.raise_for_status()
            return resp.json()

    async def reply_to_comment(
        self, mr_id: str, thread_id: str, body: str
    ) -> dict:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(
                f"{self.BASE_URL}/repos/{self.owner}/{self.repo}/pulls/{mr_id}/comments/{thread_id}/replies",
                headers=self._headers,
                json={"body": body},
            )
            resp.raise_for_status()
            return resp.json()

    async def approve(self, mr_id: str) -> dict:
        return await self.post_review(mr_id, [], "APPROVE", "")

    async def request_changes(self, mr_id: str, body: str) -> dict:
        return await self.post_review(mr_id, [], "REQUEST_CHANGES", body)


class GitLabReviewProvider(ReviewProvider):
    """GitLab merge request review provider."""

    def __init__(
        self, token: str, project_id: str, gitlab_url: str = "https://gitlab.com"
    ) -> None:
        self.token = token
        self.project_id = project_id
        self.base_url = f"{gitlab_url.rstrip('/')}/api/v4"
        self._headers = {"PRIVATE-TOKEN": token}

    async def get_mr_metadata(self, mr_id: str) -> dict:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.get(
                f"{self.base_url}/projects/{self.project_id}/merge_requests/{mr_id}",
                headers=self._headers,
            )
            resp.raise_for_status()
            data = resp.json()
            pipeline = data.get("pipeline") or {}
            return {
                "mr_id": str(data["iid"]),
                "title": data["title"],
                "description": data.get("description"),
                "author": data["author"]["username"],
                "status": data["state"],
                "source_branch": data["source_branch"],
                "target_branch": data["target_branch"],
                "reviewers": [r["username"] for r in data.get("reviewers", [])],
                "pipeline_status": pipeline.get("status"),
                "url": data["web_url"],
                "provider": "gitlab",
                "diff_refs": data.get("diff_refs"),
            }

    async def get_mr_diff(self, mr_id: str) -> dict:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.get(
                f"{self.base_url}/projects/{self.project_id}/merge_requests/{mr_id}/changes",
                headers=self._headers,
            )
            resp.raise_for_status()
            data = resp.json()
            return {
                "files": [
                    {
                        "filename": c["new_path"],
                        "status": (
                            "added" if c.get("new_file") else
                            "removed" if c.get("deleted_file") else
                            "renamed" if c.get("renamed_file") else
                            "modified"
                        ),
                        "patch": c.get("diff", ""),
                    }
                    for c in data.get("changes", [])
                ]
            }

    async def get_mr_comments(self, mr_id: str) -> list[dict]:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.get(
                f"{self.base_url}/projects/{self.project_id}/merge_requests/{mr_id}/discussions",
                headers=self._headers,
            )
            resp.raise_for_status()
            discussions = resp.json()

        threads = []
        for disc in discussions:
            notes = disc.get("notes", [])
            if not notes:
                continue
            first = notes[0]
            position = first.get("position") or {}
            threads.append({
                "id": disc["id"],
                "file_path": position.get("new_path"),
                "line": position.get("new_line"),
                "side": "RIGHT",
                "resolved": disc.get("resolved", False),
                "comments": [
                    {
                        "id": str(n["id"]),
                        "author": n["author"]["username"],
                        "body": n["body"],
                        "created_at": n["created_at"],
                        "updated_at": n.get("updated_at"),
                    }
                    for n in notes
                ],
            })
        return threads

    async def post_review(
        self, mr_id: str, comments: list[dict], event: str, body: str
    ) -> dict:
        results = []
        async with httpx.AsyncClient(timeout=30.0) as client:
            # Post each comment as a separate discussion (GitLab has no atomic review)
            for c in comments:
                resp = await client.post(
                    f"{self.base_url}/projects/{self.project_id}/merge_requests/{mr_id}/discussions",
                    headers=self._headers,
                    json={
                        "body": c["body"],
                        "position": {
                            "position_type": "text",
                            "new_path": c["file_path"],
                            "new_line": c["line"],
                        },
                    },
                )
                resp.raise_for_status()
                results.append(resp.json())

            # Handle event
            if event == "APPROVE":
                await client.post(
                    f"{self.base_url}/projects/{self.project_id}/merge_requests/{mr_id}/approve",
                    headers=self._headers,
                )
            elif event == "REQUEST_CHANGES" and body:
                await client.post(
                    f"{self.base_url}/projects/{self.project_id}/merge_requests/{mr_id}/discussions",
                    headers=self._headers,
                    json={"body": body},
                )
        return {"discussions_created": len(results), "event": event}

    async def reply_to_comment(
        self, mr_id: str, thread_id: str, body: str
    ) -> dict:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(
                f"{self.base_url}/projects/{self.project_id}/merge_requests/{mr_id}/discussions/{thread_id}/notes",
                headers=self._headers,
                json={"body": body},
            )
            resp.raise_for_status()
            return resp.json()

    async def approve(self, mr_id: str) -> dict:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(
                f"{self.base_url}/projects/{self.project_id}/merge_requests/{mr_id}/approve",
                headers=self._headers,
            )
            resp.raise_for_status()
            return resp.json()

    async def request_changes(self, mr_id: str, body: str) -> dict:
        async with httpx.AsyncClient(timeout=30.0) as client:
            # GitLab has no formal "request changes" -- post comment + unapprove
            await client.post(
                f"{self.base_url}/projects/{self.project_id}/merge_requests/{mr_id}/discussions",
                headers=self._headers,
                json={"body": body},
            )
            resp = await client.post(
                f"{self.base_url}/projects/{self.project_id}/merge_requests/{mr_id}/unapprove",
                headers=self._headers,
            )
            resp.raise_for_status()
            return resp.json()


def get_review_provider(
    source_type: str, credential_data: dict, project_info: dict
) -> ReviewProvider:
    """Factory function to create the appropriate review provider.

    Args:
        source_type: "github" or "gitlab"
        credential_data: Decrypted credential data (must contain "token")
        project_info: Provider-specific project info
            GitHub: {"owner": str, "repo": str}
            GitLab: {"project_id": str, "gitlab_url"?: str}
    """
    token = credential_data.get("token", "")

    if source_type == "github":
        return GitHubReviewProvider(
            token=token,
            owner=project_info["owner"],
            repo=project_info["repo"],
        )
    elif source_type == "gitlab":
        return GitLabReviewProvider(
            token=token,
            project_id=project_info["project_id"],
            gitlab_url=project_info.get("gitlab_url", "https://gitlab.com"),
        )
    else:
        raise ValueError(f"Unsupported source type for review: {source_type}")
