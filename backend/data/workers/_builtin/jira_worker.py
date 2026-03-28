#!/usr/bin/env python3
"""Standalone Jira polling worker.

Polls Jira issues assigned to or watched by the current user via
JQL queries. Posts results to the Locus ingest API.

Environment variables (injected by supervisor):
    LOCUS_INGEST_URL  -- URL to POST results to
    LOCUS_WORKER_SECRET -- HMAC secret for ingest auth
    POLL_INTERVAL -- seconds between polls
    JIRA_TOKEN -- Jira API token
    JIRA_EMAIL -- Jira account email
    WORKER_BASE_URL -- Jira instance URL (e.g. https://yourorg.atlassian.net)
    WORKER_JQL -- custom JQL query (optional, defaults to assigned/watched)
"""

from __future__ import annotations

import base64
import os
import sys
import time
from datetime import datetime, timezone

import httpx

# Map Jira priority names to feed tiers
_PRIORITY_TIER_MAP = {
    "highest": "now",
    "high": "respond",
    "medium": "prep",
    "low": "follow_up",
    "lowest": "follow_up",
}

# -- Configuration from environment ------------------------------------------

INGEST_URL = os.environ.get("LOCUS_INGEST_URL", "http://localhost:8080/api/feed/ingest")
WORKER_SECRET = os.environ.get("LOCUS_WORKER_SECRET", "")
POLL_INTERVAL = int(os.environ.get("POLL_INTERVAL", "300"))
JIRA_TOKEN = os.environ.get("JIRA_TOKEN", "")
JIRA_EMAIL = os.environ.get("JIRA_EMAIL", "")
BASE_URL = os.environ.get("WORKER_BASE_URL", "").rstrip("/")
WORKER_JQL = os.environ.get(
    "WORKER_JQL",
    "assignee = currentUser() OR watcher = currentUser() ORDER BY updated DESC",
)


def _ts() -> str:
    """Return ISO timestamp for log lines."""
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _extract_adf_text(adf: dict | None) -> str:
    """Extract plain text from Jira's Atlassian Document Format (ADF)."""
    if not adf or not isinstance(adf, dict):
        return ""

    parts: list[str] = []
    _walk_adf(adf, parts)
    return " ".join(parts)


def _walk_adf(node: dict, parts: list[str]) -> None:
    """Recursively walk ADF nodes extracting text."""
    if node.get("type") == "text":
        text = node.get("text", "")
        if text:
            parts.append(text)

    if node.get("type") == "mention":
        attrs = node.get("attrs", {})
        text = attrs.get("text", "")
        if text:
            parts.append(text)

    for child in node.get("content", []):
        if isinstance(child, dict):
            _walk_adf(child, parts)


def _parse_issue(issue: dict) -> dict:
    """Parse a Jira issue into an IngestPayload dict."""
    key = issue["key"]
    fields = issue.get("fields", {})

    summary = fields.get("summary", "")
    priority_name = (
        fields.get("priority", {}).get("name", "Medium").lower()
    )
    tier_hint = _PRIORITY_TIER_MAP.get(priority_name, "prep")

    description = _extract_adf_text(fields.get("description"))

    # Extract latest comment body
    comments = fields.get("comment", {}).get("comments", [])
    latest_comment = ""
    if comments:
        latest_comment = _extract_adf_text(comments[-1].get("body"))

    status_name = fields.get("status", {}).get("name", "")
    snippet = f"[{status_name}] {description[:80]}" if description else f"[{status_name}]"

    # Build URL from self link
    url = issue.get("self", "").replace(
        "/rest/api/3/issue/", "/browse/"
    ).split("?")[0]

    return {
        "source_type": "jira",
        "external_id": f"issue:{key}",
        "title": f"{key}: {summary}",
        "snippet": snippet[:100],
        "url": url,
        "tier_hint": tier_hint,
        "source_icon": "jira",
        "metadata": {
            "key": key,
            "priority": priority_name,
            "status": status_name,
        },
    }


def poll() -> list[dict]:
    """Poll Jira for issues matching JQL query.

    Returns list of dicts matching IngestPayload schema.
    """
    if not BASE_URL or not JIRA_EMAIL or not JIRA_TOKEN:
        print(f"{_ts()} WARN Missing WORKER_BASE_URL, JIRA_EMAIL, or JIRA_TOKEN, skipping poll", flush=True)
        return []

    auth_str = base64.b64encode(f"{JIRA_EMAIL}:{JIRA_TOKEN}".encode()).decode()

    items: list[dict] = []

    try:
        with httpx.Client(
            timeout=30.0,
            headers={
                "Authorization": f"Basic {auth_str}",
                "Accept": "application/json",
            },
        ) as client:
            response = client.get(
                f"{BASE_URL}/rest/api/3/search",
                params={
                    "jql": WORKER_JQL,
                    "maxResults": 50,
                    "fields": "summary,priority,status,description,comment",
                },
            )
            response.raise_for_status()
            data = response.json()

            for issue in data.get("issues", []):
                items.append(_parse_issue(issue))

    except Exception as exc:
        print(f"{_ts()} ERROR Failed to poll Jira: {exc}", flush=True)
        return []

    return items


def _post_items(items: list[dict]) -> None:
    """POST each item to the Locus ingest API."""
    with httpx.Client(timeout=15.0) as client:
        for item in items:
            try:
                response = client.post(
                    INGEST_URL,
                    json=item,
                    headers={"X-Locus-Worker-Secret": WORKER_SECRET},
                )
                response.raise_for_status()
            except Exception as exc:
                print(
                    f"{_ts()} ERROR Failed to ingest {item.get('external_id', '?')}: {exc}",
                    flush=True,
                )


if __name__ == "__main__":
    print(f"{_ts()} INFO Jira worker starting (base_url={BASE_URL}, interval={POLL_INTERVAL}s)", flush=True)

    while True:
        try:
            items = poll()
            print(f"{_ts()} INFO Polled {len(items)} items from Jira", flush=True)
            if items:
                _post_items(items)
                print(f"{_ts()} INFO Posted {len(items)} items to ingest API", flush=True)
        except Exception as exc:
            print(f"{_ts()} ERROR Poll cycle failed: {exc}", flush=True)

        time.sleep(POLL_INTERVAL)
