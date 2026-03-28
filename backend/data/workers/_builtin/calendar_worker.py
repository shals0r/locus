#!/usr/bin/env python3
"""Standalone Google Calendar polling worker.

Polls upcoming calendar events (next 24 hours) from the Google
Calendar API. Posts results to the Locus ingest API.

Environment variables (injected by supervisor):
    LOCUS_INGEST_URL  -- URL to POST results to
    LOCUS_WORKER_SECRET -- HMAC secret for ingest auth
    POLL_INTERVAL -- seconds between polls
    GOOGLE_CREDENTIALS_JSON -- service account JSON or OAuth credentials
    WORKER_CALENDAR_IDS -- comma-separated calendar IDs (default: "primary")
    ACCESS_TOKEN -- OAuth2 access token (alternative to service account)
    REFRESH_TOKEN -- OAuth2 refresh token
    CLIENT_ID -- Google OAuth client ID
    CLIENT_SECRET -- Google OAuth client secret
"""

from __future__ import annotations

import os
import sys
import time
from datetime import datetime, timedelta, timezone

import httpx

CALENDAR_API = "https://www.googleapis.com/calendar/v3"
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"

# -- Configuration from environment ------------------------------------------

INGEST_URL = os.environ.get("LOCUS_INGEST_URL", "http://localhost:8080/api/feed/ingest")
WORKER_SECRET = os.environ.get("LOCUS_WORKER_SECRET", "")
POLL_INTERVAL = int(os.environ.get("POLL_INTERVAL", "300"))
ACCESS_TOKEN = os.environ.get("ACCESS_TOKEN", "")
REFRESH_TOKEN = os.environ.get("REFRESH_TOKEN", "")
CLIENT_ID = os.environ.get("CLIENT_ID", "")
CLIENT_SECRET = os.environ.get("CLIENT_SECRET", "")
CALENDAR_IDS = [
    c.strip()
    for c in os.environ.get("WORKER_CALENDAR_IDS", "primary").split(",")
    if c.strip()
]

# Mutable token state for refresh
_current_token = ACCESS_TOKEN


def _ts() -> str:
    """Return ISO timestamp for log lines."""
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _format_start_time(start_time: str) -> str:
    """Format a start time string for display in snippet."""
    if not start_time:
        return "unknown"
    try:
        dt = datetime.fromisoformat(start_time.replace("Z", "+00:00"))
        return dt.strftime("%H:%M %Z")
    except (ValueError, AttributeError):
        return start_time


def _refresh_access_token() -> str | None:
    """Refresh the OAuth access token. Returns new token or None."""
    global _current_token

    if not REFRESH_TOKEN or not CLIENT_ID or not CLIENT_SECRET:
        return None

    try:
        with httpx.Client(timeout=15.0) as client:
            response = client.post(
                GOOGLE_TOKEN_URL,
                data={
                    "grant_type": "refresh_token",
                    "refresh_token": REFRESH_TOKEN,
                    "client_id": CLIENT_ID,
                    "client_secret": CLIENT_SECRET,
                },
            )
            response.raise_for_status()
            data = response.json()

        new_token = data.get("access_token")
        if new_token:
            _current_token = new_token
            print(f"{_ts()} INFO Access token refreshed successfully", flush=True)
            return new_token
    except Exception as exc:
        print(f"{_ts()} ERROR Token refresh failed: {exc}", flush=True)

    return None


def _fetch_events(token: str, calendar_id: str) -> list[dict]:
    """Fetch upcoming events from a single calendar."""
    now = datetime.now(timezone.utc)
    time_max = now + timedelta(hours=24)

    with httpx.Client(
        timeout=30.0,
        headers={"Authorization": f"Bearer {token}"},
    ) as client:
        response = client.get(
            f"{CALENDAR_API}/calendars/{calendar_id}/events",
            params={
                "timeMin": now.isoformat(),
                "timeMax": time_max.isoformat(),
                "singleEvents": "true",
                "orderBy": "startTime",
                "maxResults": 50,
            },
        )
        response.raise_for_status()
        data = response.json()

    items = []
    for event in data.get("items", []):
        event_id = event.get("id", "")
        summary = event.get("summary", "Untitled Event")

        start = event.get("start", {})
        start_time = start.get("dateTime") or start.get("date", "")
        start_display = _format_start_time(start_time)

        items.append({
            "source_type": "calendar",
            "external_id": f"event:{event_id}",
            "title": summary,
            "snippet": f"Starts: {start_display}",
            "url": event.get("htmlLink"),
            "tier_hint": "prep",
            "source_icon": "calendar",
            "metadata": {
                "event_id": event_id,
                "start": start_time,
                "location": event.get("location"),
                "organizer": event.get("organizer", {}).get("email"),
            },
        })

    return items


def poll() -> list[dict]:
    """Poll Google Calendar for upcoming events.

    Returns list of dicts matching IngestPayload schema.
    """
    global _current_token

    if not _current_token:
        print(f"{_ts()} WARN Missing ACCESS_TOKEN, skipping poll", flush=True)
        return []

    items: list[dict] = []

    for calendar_id in CALENDAR_IDS:
        try:
            events = _fetch_events(_current_token, calendar_id)
            items.extend(events)
        except httpx.HTTPStatusError as exc:
            if exc.response.status_code == 401:
                # Token expired -- try refresh
                new_token = _refresh_access_token()
                if new_token:
                    try:
                        events = _fetch_events(new_token, calendar_id)
                        items.extend(events)
                    except Exception as retry_exc:
                        print(f"{_ts()} ERROR Retry after refresh failed for {calendar_id}: {retry_exc}", flush=True)
                else:
                    print(f"{_ts()} ERROR Token refresh failed, cannot poll {calendar_id}", flush=True)
            else:
                print(f"{_ts()} ERROR Calendar API error for {calendar_id}: {exc}", flush=True)
        except Exception as exc:
            print(f"{_ts()} ERROR Failed to poll calendar {calendar_id}: {exc}", flush=True)

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
    print(f"{_ts()} INFO Calendar worker starting (calendars={CALENDAR_IDS}, interval={POLL_INTERVAL}s)", flush=True)

    while True:
        try:
            items = poll()
            print(f"{_ts()} INFO Polled {len(items)} events from Google Calendar", flush=True)
            if items:
                _post_items(items)
                print(f"{_ts()} INFO Posted {len(items)} items to ingest API", flush=True)
        except Exception as exc:
            print(f"{_ts()} ERROR Poll cycle failed: {exc}", flush=True)

        time.sleep(POLL_INTERVAL)
