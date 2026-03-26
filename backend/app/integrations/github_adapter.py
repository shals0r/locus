"""GitHub polling adapter.

Polls open pull requests from configured repositories using the
GitHub REST API. Classifies PRs by review status and includes
PR body text for @mention detection by the base adapter.
"""

from __future__ import annotations

import logging

import httpx

from app.integrations.base_adapter import BasePollingAdapter
from app.models.integration_source import IntegrationSource

logger = logging.getLogger(__name__)

GITHUB_API = "https://api.github.com"


class GitHubAdapter(BasePollingAdapter):
    """Polls GitHub for open pull requests across configured repos."""

    async def poll(self, source: IntegrationSource) -> list[dict]:
        """Poll GitHub for open PRs.

        Config expects:
            token: GitHub personal access token
            repos: list of "owner/repo" strings
            github_username: for mention detection by base class

        Returns list of dicts with IngestPayload fields plus body
        for mention scanning.
        """
        config = source.config or {}
        token = config.get("token")
        repos = config.get("repos", [])

        if not token or not repos:
            logger.warning("GitHub adapter missing token or repos config")
            return []

        items: list[dict] = []

        async with httpx.AsyncClient(
            timeout=30.0,
            headers={
                "Authorization": f"Bearer {token}",
                "Accept": "application/vnd.github.v3+json",
            },
        ) as client:
            for repo in repos:
                try:
                    repo_items = await self._poll_repo(client, repo, config)
                    items.extend(repo_items)
                except Exception as exc:
                    logger.warning(
                        "GitHub: failed to poll %s: %s", repo, exc
                    )

        return items

    async def _poll_repo(
        self,
        client: httpx.AsyncClient,
        repo: str,
        config: dict,
    ) -> list[dict]:
        """Poll a single repo for open PRs."""
        response = await client.get(
            f"{GITHUB_API}/repos/{repo}/pulls",
            params={"state": "open", "per_page": 50},
        )
        response.raise_for_status()
        prs = response.json()

        items = []
        for pr in prs:
            number = pr["number"]
            body = pr.get("body") or ""

            # Classify tier based on PR state
            tier_hint = self._classify_pr_tier(pr, config)

            items.append({
                "source_type": "github",
                "external_id": f"pr:{repo}:{number}",
                "title": f"PR #{number}: {pr['title']}",
                "snippet": body[:100] if body else None,
                "url": pr.get("html_url"),
                "tier_hint": tier_hint,
                "source_icon": "github",
                "metadata": {
                    "repo": repo,
                    "number": number,
                    "state": pr.get("state"),
                    "draft": pr.get("draft", False),
                    "user": pr.get("user", {}).get("login"),
                },
                # Body included for mention detection (not persisted as-is)
                "body": body,
            })

        return items

    def _classify_pr_tier(self, pr: dict, config: dict) -> str:
        """Classify PR tier based on review status.

        - requested_reviewers includes user -> "review"
        - draft PR -> "follow_up"
        - otherwise -> "prep"
        """
        username = config.get("github_username", "")

        # Check if user is a requested reviewer
        requested = pr.get("requested_reviewers", [])
        if username and any(
            r.get("login", "").lower() == username.lower()
            for r in requested
        ):
            return "review"

        # Draft PRs are low priority
        if pr.get("draft", False):
            return "follow_up"

        return "prep"
