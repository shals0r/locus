#!/usr/bin/env python3
"""Standalone GitLab polling worker.

Polls merge requests from configured GitLab instance. Posts results
to the Locus ingest API.

Environment variables (injected by supervisor):
    LOCUS_INGEST_URL  -- URL to POST results to
    LOCUS_WORKER_SECRET -- HMAC secret for ingest auth
    POLL_INTERVAL -- seconds between polls
    GITLAB_TOKEN -- GitLab personal access token
    WORKER_BASE_URL -- GitLab instance URL (default https://gitlab.com)
    WORKER_PROJECT_IDS -- comma-separated project IDs (optional)
"""

from __future__ import annotations

import os
import sys
import time
from datetime import datetime, timezone

import httpx

# -- Configuration from environment ------------------------------------------

INGEST_URL = os.environ.get("LOCUS_INGEST_URL", "http://localhost:8080/api/feed/ingest")
WORKER_SECRET = os.environ.get("LOCUS_WORKER_SECRET", "")
POLL_INTERVAL = int(os.environ.get("POLL_INTERVAL", "300"))
GITLAB_TOKEN = os.environ.get("GITLAB_TOKEN", "")
BASE_URL = os.environ.get("WORKER_BASE_URL", "https://gitlab.com").rstrip("/")
PROJECT_IDS = [p.strip() for p in os.environ.get("WORKER_PROJECT_IDS", "").split(",") if p.strip()]


def _ts() -> str:
    """Return ISO timestamp for log lines."""
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _poll_mrs(client: httpx.Client, scope: str, reviewer: bool = False) -> list[dict]:
    """Poll GitLab merge requests with given scope."""
    params: dict = {
        "scope": scope,
        "state": "opened",
        "per_page": 50,
    }
    if reviewer:
        params["reviewer_username"] = "true"

    response = client.get(
        f"{BASE_URL}/api/v4/merge_requests",
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
        })

    return items


def poll() -> list[dict]:
    """Poll GitLab for open merge requests.

    Returns list of dicts matching IngestPayload schema.
    """
    if not GITLAB_TOKEN:
        print(f"{_ts()} WARN Missing GITLAB_TOKEN, skipping poll", flush=True)
        return []

    items: list[dict] = []

    with httpx.Client(
        timeout=30.0,
        headers={"PRIVATE-TOKEN": GITLAB_TOKEN},
    ) as client:
        # Poll MRs assigned to the user
        try:
            assigned_items = _poll_mrs(client, scope="assigned_to_me")
            for item in assigned_items:
                if item.get("tier_hint") is None:
                    item["tier_hint"] = "prep"
            items.extend(assigned_items)
        except Exception as exc:
            print(f"{_ts()} ERROR Failed to poll assigned MRs: {exc}", flush=True)

        # Poll MRs where review is requested
        try:
            review_items = _poll_mrs(client, scope="assigned_to_me", reviewer=True)
            for item in review_items:
                item["tier_hint"] = "review"
            items.extend(review_items)
        except Exception as exc:
            print(f"{_ts()} ERROR Failed to poll review-requested MRs: {exc}", flush=True)

    # Deduplicate by external_id
    seen: set[str] = set()
    unique_items: list[dict] = []
    for item in items:
        eid = item["external_id"]
        if eid not in seen:
            seen.add(eid)
            unique_items.append(item)

    return unique_items


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
    print(f"{_ts()} INFO GitLab worker starting (base_url={BASE_URL}, interval={POLL_INTERVAL}s)", flush=True)

    while True:
        try:
            items = poll()
            print(f"{_ts()} INFO Polled {len(items)} items from GitLab", flush=True)
            if items:
                _post_items(items)
                print(f"{_ts()} INFO Posted {len(items)} items to ingest API", flush=True)
        except Exception as exc:
            print(f"{_ts()} ERROR Poll cycle failed: {exc}", flush=True)

        time.sleep(POLL_INTERVAL)
