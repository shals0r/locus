"""GitLab polling adapter.

Polls merge requests assigned to or requesting review from the user
using the GitLab REST API. Includes MR description for @mention
detection by the base adapter.
"""

from __future__ import annotations

import logging

import httpx

from app.integrations.base_adapter import BasePollingAdapter
from app.models.integration_source import IntegrationSource

logger = logging.getLogger(__name__)


class GitLabAdapter(BasePollingAdapter):
    """Polls GitLab for merge requests assigned or review-requested."""

    async def poll(self, source: IntegrationSource) -> list[dict]:
        """Poll GitLab for MRs.

        Config expects:
            token: GitLab personal access token
            base_url: GitLab instance URL (default "https://gitlab.com")
            project_ids: optional list of project IDs to filter
            gitlab_username: for mention detection by base class

        Returns list of dicts with IngestPayload fields plus
        description for mention scanning.
        """
        config = source.config or {}
        token = config.get("token")
        base_url = config.get("base_url", "https://gitlab.com").rstrip("/")

        if not token:
            logger.warning("GitLab adapter missing token config")
            return []

        items: list[dict] = []

        async with httpx.AsyncClient(
            timeout=30.0,
            headers={
                "PRIVATE-TOKEN": token,
            },
        ) as client:
            # Poll MRs assigned to the user
            try:
                assigned_items = await self._poll_mrs(
                    client, base_url, scope="assigned_to_me"
                )
                for item in assigned_items:
                    if item.get("tier_hint") is None:
                        item["tier_hint"] = "prep"
                items.extend(assigned_items)
            except Exception as exc:
                logger.warning("GitLab: failed to poll assigned MRs: %s", exc)

            # Poll MRs where review is requested
            try:
                review_items = await self._poll_mrs(
                    client, base_url, scope="assigned_to_me",
                    reviewer="true",
                )
                for item in review_items:
                    item["tier_hint"] = "review"
                items.extend(review_items)
            except Exception as exc:
                logger.warning(
                    "GitLab: failed to poll review-requested MRs: %s", exc
                )

        # Deduplicate by external_id (MR may appear in both queries)
        seen = set()
        unique_items = []
        for item in items:
            eid = item["external_id"]
            if eid not in seen:
                seen.add(eid)
                unique_items.append(item)

        return unique_items

    async def _poll_mrs(
        self,
        client: httpx.AsyncClient,
        base_url: str,
        scope: str = "assigned_to_me",
        reviewer: str | None = None,
    ) -> list[dict]:
        """Poll GitLab merge requests with given scope."""
        params: dict = {
            "scope": scope,
            "state": "opened",
            "per_page": 50,
        }
        if reviewer:
            params["reviewer_username"] = "true"

        response = await client.get(
            f"{base_url}/api/v4/merge_requests",
            params=params,
        )
        response.raise_for_status()
        mrs = response.json()

        items = []
        for mr in mrs:
            iid = mr["iid"]
            project_id = mr["project_id"]
            description = mr.get("description") or ""

            items.append({
                "source_type": "gitlab",
                "external_id": f"mr:{project_id}:{iid}",
                "title": f"MR !{iid}: {mr['title']}",
                "snippet": description[:100] if description else None,
                "url": mr.get("web_url"),
                "tier_hint": None,  # Set by caller
                "source_icon": "gitlab",
                "metadata": {
                    "project_id": project_id,
                    "iid": iid,
                    "state": mr.get("state"),
                    "author": mr.get("author", {}).get("username"),
                },
                # Description for mention detection
                "body": description,
            })

        return items
