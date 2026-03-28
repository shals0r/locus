"""Review service abstraction layer for GitHub and GitLab MR/PR operations.

Provides a ReviewProvider ABC that normalizes the fundamental differences
between GitHub (atomic reviews) and GitLab (individual discussion threads).
A factory function routes to the correct implementation based on source_type.
"""

from __future__ import annotations

import abc
from typing import Any


class ReviewProvider(abc.ABC):
    """Abstract base class for code review operations across git providers.

    GitHub and GitLab have fundamentally different review models:
    - GitHub: Atomic reviews (one POST with all comments + event)
    - GitLab: Individual discussion threads, separate approve/unapprove

    This ABC normalizes both behind a consistent async interface.
    """

    @abc.abstractmethod
    async def get_mr_metadata(self, mr_id: str) -> dict[str, Any]:
        """Fetch MR/PR metadata: title, author, status, reviewers, pipeline, diff_refs."""
        ...

    @abc.abstractmethod
    async def get_mr_diff(self, mr_id: str) -> dict[str, Any]:
        """Fetch changed files with per-file diffs (unified diff text per file)."""
        ...

    @abc.abstractmethod
    async def get_mr_comments(self, mr_id: str) -> list[dict[str, Any]]:
        """Fetch existing comments grouped as threads."""
        ...

    @abc.abstractmethod
    async def post_review(
        self,
        mr_id: str,
        comments: list[dict[str, Any]],
        event: str,
        body: str,
    ) -> dict[str, Any]:
        """Post a review with comments and event (APPROVE/REQUEST_CHANGES/COMMENT)."""
        ...

    @abc.abstractmethod
    async def reply_to_comment(
        self, mr_id: str, thread_id: str, body: str
    ) -> dict[str, Any]:
        """Reply to an existing comment thread."""
        ...

    @abc.abstractmethod
    async def approve(self, mr_id: str) -> dict[str, Any]:
        """Approve the MR/PR."""
        ...

    @abc.abstractmethod
    async def request_changes(self, mr_id: str, body: str) -> dict[str, Any]:
        """Request changes on the MR/PR."""
        ...


def get_review_provider(
    source_type: str,
    credential_data: dict[str, Any],
    project_info: dict[str, Any],
) -> ReviewProvider:
    """Factory function to create the correct ReviewProvider.

    Args:
        source_type: "github" or "gitlab"
        credential_data: Decrypted token data ({"token": "..."})
        project_info: Provider-specific info:
            - GitHub: {"owner": str, "repo": str}
            - GitLab: {"project_id": str, "gitlab_url": str (optional)}

    Returns:
        ReviewProvider implementation for the given source type.

    Raises:
        ValueError: If source_type is not supported.
    """
    token = credential_data.get("token", "")

    if source_type == "github":
        from app.services.github_review import GitHubReviewProvider

        return GitHubReviewProvider(
            token=token,
            owner=project_info["owner"],
            repo=project_info["repo"],
        )
    elif source_type == "gitlab":
        from app.services.gitlab_review import GitLabReviewProvider

        return GitLabReviewProvider(
            token=token,
            project_id=project_info["project_id"],
            gitlab_url=project_info.get("gitlab_url", "https://gitlab.com"),
        )
    else:
        raise ValueError(
            f"Unsupported review source type: {source_type!r}. "
            "Expected 'github' or 'gitlab'."
        )
