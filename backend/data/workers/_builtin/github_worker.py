#!/usr/bin/env python3
"""Standalone GitHub polling worker.

Polls open pull requests and issues from configured repositories using
the GitHub REST API. Posts results to the Locus ingest API.

Environment variables (injected by supervisor):
    LOCUS_INGEST_URL  -- URL to POST results to
    LOCUS_WORKER_SECRET -- HMAC secret for ingest auth
    POLL_INTERVAL -- seconds between polls
    GITHUB_TOKEN -- GitHub personal access token
    WORKER_REPOS -- comma-separated "owner/repo" strings
    GITHUB_USERNAME -- for review-request tier classification
"""

from __future__ import annotations

import os
import sys
import time
from datetime import datetime, timezone

import httpx

GITHUB_API = "https://api.github.com"

# -- Configuration from environment ------------------------------------------

INGEST_URL = os.environ.get("LOCUS_INGEST_URL", "http://localhost:8080/api/feed/ingest")
WORKER_SECRET = os.environ.get("LOCUS_WORKER_SECRET", "")
POLL_INTERVAL = int(os.environ.get("POLL_INTERVAL", "300"))
GITHUB_TOKEN = os.environ.get("GITHUB_TOKEN", "")
WORKER_REPOS = [r.strip() for r in os.environ.get("WORKER_REPOS", "").split(",") if r.strip()]
GITHUB_USERNAME = os.environ.get("GITHUB_USERNAME", "")


def _ts() -> str:
    """Return ISO timestamp for log lines."""
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _classify_pr_tier(pr: dict) -> str:
    """Classify PR tier based on review status.

    - requested_reviewers includes user -> "review"
    - draft PR -> "follow_up"
    - otherwise -> "prep"
    """
    if GITHUB_USERNAME:
        requested = pr.get("requested_reviewers", [])
        if any(
            r.get("login", "").lower() == GITHUB_USERNAME.lower()
            for r in requested
        ):
            return "review"

    if pr.get("draft", False):
        return "follow_up"

    return "prep"


def poll() -> list[dict]:
    """Poll GitHub for open PRs across configured repos.

    Returns list of dicts matching IngestPayload schema.
    """
    if not GITHUB_TOKEN or not WORKER_REPOS:
        print(f"{_ts()} WARN Missing GITHUB_TOKEN or WORKER_REPOS, skipping poll", flush=True)
        return []

    items: list[dict] = []

    with httpx.Client(
        timeout=30.0,
        headers={
            "Authorization": f"Bearer {GITHUB_TOKEN}",
            "Accept": "application/vnd.github.v3+json",
        },
    ) as client:
        for repo in WORKER_REPOS:
            try:
                # Poll open PRs
                response = client.get(
                    f"{GITHUB_API}/repos/{repo}/pulls",
                    params={"state": "open", "per_page": 50},
                )
                response.raise_for_status()
                prs = response.json()

                for pr in prs:
                    number = pr["number"]
                    body = pr.get("body") or ""
                    tier_hint = _classify_pr_tier(pr)

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
                    })

                # Poll open issues assigned to user
                issue_params = {"state": "open", "per_page": 50}
                if GITHUB_USERNAME:
                    issue_params["assignee"] = GITHUB_USERNAME

                response = client.get(
                    f"{GITHUB_API}/repos/{repo}/issues",
                    params=issue_params,
                )
                response.raise_for_status()
                issues = response.json()

                for issue in issues:
                    # Skip pull requests (GitHub returns PRs in issues endpoint)
                    if issue.get("pull_request"):
                        continue
                    number = issue["number"]
                    body = issue.get("body") or ""

                    items.append({
                        "source_type": "github",
                        "external_id": f"issue:{repo}:{number}",
                        "title": f"Issue #{number}: {issue['title']}",
                        "snippet": body[:100] if body else None,
                        "url": issue.get("html_url"),
                        "tier_hint": "prep",
                        "source_icon": "github",
                        "metadata": {
                            "repo": repo,
                            "number": number,
                            "state": issue.get("state"),
                            "user": issue.get("user", {}).get("login"),
                        },
                    })

            except Exception as exc:
                print(f"{_ts()} ERROR Failed to poll {repo}: {exc}", flush=True)

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
    print(f"{_ts()} INFO GitHub worker starting (repos={WORKER_REPOS}, interval={POLL_INTERVAL}s)", flush=True)

    while True:
        try:
            items = poll()
            print(f"{_ts()} INFO Polled {len(items)} items from GitHub", flush=True)
            if items:
                _post_items(items)
                print(f"{_ts()} INFO Posted {len(items)} items to ingest API", flush=True)
        except Exception as exc:
            print(f"{_ts()} ERROR Poll cycle failed: {exc}", flush=True)

        time.sleep(POLL_INTERVAL)
