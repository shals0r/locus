"""Jira polling adapter.

Polls Jira issues assigned to or watched by the current user via
JQL queries. Classifies tier based on Jira priority and includes
issue description + latest comment for @mention detection.
"""

from __future__ import annotations

import base64
import logging

import httpx

from app.integrations.base_adapter import BasePollingAdapter
from app.models.integration_source import IntegrationSource

logger = logging.getLogger(__name__)

# Map Jira priority names to feed tiers
_PRIORITY_TIER_MAP = {
    "highest": "now",
    "high": "respond",
    "medium": "prep",
    "low": "follow_up",
    "lowest": "follow_up",
}


class JiraAdapter(BasePollingAdapter):
    """Polls Jira for issues assigned to or watched by the user."""

    async def poll(self, source: IntegrationSource) -> list[dict]:
        """Poll Jira for issues.

        Config expects:
            base_url: Jira instance URL (e.g., "https://yourorg.atlassian.net")
            email: Jira account email
            api_token: Jira API token
            jira_username: display name or account ID for mention detection

        Returns list of dicts with IngestPayload fields plus description
        and comment body for mention scanning.
        """
        config = source.config or {}
        base_url = config.get("base_url", "").rstrip("/")
        email = config.get("email")
        api_token = config.get("api_token")

        if not base_url or not email or not api_token:
            logger.warning(
                "Jira adapter missing base_url, email, or api_token config"
            )
            return []

        # HTTP Basic auth: email:api_token
        auth_str = base64.b64encode(
            f"{email}:{api_token}".encode()
        ).decode()

        jql = (
            "assignee = currentUser() OR watcher = currentUser() "
            "ORDER BY updated DESC"
        )

        items: list[dict] = []

        try:
            async with httpx.AsyncClient(
                timeout=30.0,
                headers={
                    "Authorization": f"Basic {auth_str}",
                    "Accept": "application/json",
                },
            ) as client:
                response = await client.get(
                    f"{base_url}/rest/api/3/search",
                    params={
                        "jql": jql,
                        "maxResults": 50,
                        "fields": "summary,priority,status,description,comment",
                    },
                )
                response.raise_for_status()
                data = response.json()

                for issue in data.get("issues", []):
                    item = self._parse_issue(issue)
                    items.append(item)

        except Exception as exc:
            logger.warning("Jira: failed to poll issues: %s", exc)
            return []

        return items

    def _parse_issue(self, issue: dict) -> dict:
        """Parse a Jira issue into an IngestPayload dict."""
        key = issue["key"]
        fields = issue.get("fields", {})

        summary = fields.get("summary", "")
        priority_name = (
            fields.get("priority", {}).get("name", "Medium").lower()
        )
        tier_hint = _PRIORITY_TIER_MAP.get(priority_name, "prep")

        # Extract description text (Jira uses ADF format, get raw text)
        description = self._extract_adf_text(
            fields.get("description")
        )

        # Extract latest comment body for mention detection
        comments = fields.get("comment", {}).get("comments", [])
        latest_comment = ""
        if comments:
            latest_comment = self._extract_adf_text(
                comments[-1].get("body")
            )

        # Build body for mention detection (description + latest comment)
        body_parts = []
        if description:
            body_parts.append(description)
        if latest_comment:
            body_parts.append(latest_comment)

        status_name = fields.get("status", {}).get("name", "")
        snippet = f"[{status_name}] {description[:80]}" if description else f"[{status_name}]"

        return {
            "source_type": "jira",
            "external_id": f"issue:{key}",
            "title": f"{key}: {summary}",
            "snippet": snippet[:100],
            "url": issue.get("self", "").replace(
                "/rest/api/3/issue/", "/browse/"
            ).split("?")[0],
            "tier_hint": tier_hint,
            "source_icon": "jira",
            "metadata": {
                "key": key,
                "priority": priority_name,
                "status": status_name,
            },
            # Body for mention detection
            "body": " ".join(body_parts) if body_parts else "",
        }

    def _extract_adf_text(self, adf: dict | None) -> str:
        """Extract plain text from Jira's Atlassian Document Format (ADF).

        ADF is a nested JSON structure. This extracts text nodes recursively
        for a best-effort plain text representation.
        """
        if not adf or not isinstance(adf, dict):
            return ""

        parts: list[str] = []
        self._walk_adf(adf, parts)
        return " ".join(parts)

    def _walk_adf(self, node: dict, parts: list[str]) -> None:
        """Recursively walk ADF nodes extracting text."""
        if node.get("type") == "text":
            text = node.get("text", "")
            if text:
                parts.append(text)

        # Also handle mention nodes
        if node.get("type") == "mention":
            attrs = node.get("attrs", {})
            text = attrs.get("text", "")
            if text:
                parts.append(text)

        for child in node.get("content", []):
            if isinstance(child, dict):
                self._walk_adf(child, parts)
