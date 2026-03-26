"""Google Calendar polling adapter.

Polls upcoming calendar events (next 24 hours) from the Google
Calendar API. Always classifies events as "prep" tier since they
are planning items. Handles OAuth token refresh on 401 responses.
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone

import httpx

from app.integrations.base_adapter import BasePollingAdapter
from app.models.integration_source import IntegrationSource

logger = logging.getLogger(__name__)

CALENDAR_API = "https://www.googleapis.com/calendar/v3"
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"


class GoogleCalendarAdapter(BasePollingAdapter):
    """Polls Google Calendar for upcoming events in the next 24 hours."""

    async def poll(self, source: IntegrationSource) -> list[dict]:
        """Poll Google Calendar for upcoming events.

        Config expects:
            access_token: OAuth2 access token
            refresh_token: OAuth2 refresh token (for auto-refresh)
            client_id: Google OAuth client ID (for refresh)
            client_secret: Google OAuth client secret (for refresh)
            calendar_id: Calendar ID (default "primary")

        Returns list of dicts with IngestPayload fields.
        Calendar events are always tier "prep" (planning items).
        """
        config = source.config or {}
        access_token = config.get("access_token")
        calendar_id = config.get("calendar_id", "primary")

        if not access_token:
            logger.warning("Calendar adapter missing access_token config")
            return []

        now = datetime.now(timezone.utc)
        time_max = now + timedelta(hours=24)

        try:
            items = await self._fetch_events(
                access_token, calendar_id, now, time_max
            )
            return items
        except httpx.HTTPStatusError as exc:
            if exc.response.status_code == 401:
                # Token expired -- try refresh
                new_token = await self._refresh_token(source)
                if new_token:
                    try:
                        items = await self._fetch_events(
                            new_token, calendar_id, now, time_max
                        )
                        return items
                    except Exception as retry_exc:
                        logger.warning(
                            "Calendar: retry after refresh failed: %s",
                            retry_exc,
                        )
                        return []
                else:
                    logger.warning(
                        "Calendar: token refresh failed, cannot poll"
                    )
                    return []
            else:
                logger.warning("Calendar: API error: %s", exc)
                return []
        except Exception as exc:
            logger.warning("Calendar: failed to poll events: %s", exc)
            return []

    async def _fetch_events(
        self,
        access_token: str,
        calendar_id: str,
        time_min: datetime,
        time_max: datetime,
    ) -> list[dict]:
        """Fetch events from Google Calendar API."""
        async with httpx.AsyncClient(
            timeout=30.0,
            headers={
                "Authorization": f"Bearer {access_token}",
            },
        ) as client:
            response = await client.get(
                f"{CALENDAR_API}/calendars/{calendar_id}/events",
                params={
                    "timeMin": time_min.isoformat(),
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
            description = event.get("description", "")

            # Parse start time
            start = event.get("start", {})
            start_time = start.get("dateTime") or start.get("date", "")
            start_display = self._format_start_time(start_time)

            # Build attendee list for body (mention detection)
            attendees = event.get("attendees", [])
            attendee_text = " ".join(
                a.get("email", "") for a in attendees
            )

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
                # Body for mention detection
                "body": f"{description} {attendee_text}".strip(),
            })

        return items

    async def _refresh_token(
        self, source: IntegrationSource
    ) -> str | None:
        """Refresh the Google OAuth access token.

        Updates the source config with the new access token in the database.
        Returns the new access token or None on failure.
        """
        config = source.config or {}
        refresh_token = config.get("refresh_token")
        client_id = config.get("client_id")
        client_secret = config.get("client_secret")

        if not refresh_token or not client_id or not client_secret:
            logger.warning(
                "Calendar: cannot refresh token -- missing refresh_token, "
                "client_id, or client_secret"
            )
            return None

        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                response = await client.post(
                    GOOGLE_TOKEN_URL,
                    data={
                        "grant_type": "refresh_token",
                        "refresh_token": refresh_token,
                        "client_id": client_id,
                        "client_secret": client_secret,
                    },
                )
                response.raise_for_status()
                data = response.json()

            new_access_token = data.get("access_token")
            if not new_access_token:
                logger.warning("Calendar: refresh response missing access_token")
                return None

            # Update source config with new token
            from sqlalchemy import update as sql_update
            from app.database import async_session_factory
            from app.models.integration_source import IntegrationSource as IS

            updated_config = dict(config)
            updated_config["access_token"] = new_access_token

            async with async_session_factory() as db:
                await db.execute(
                    sql_update(IS)
                    .where(IS.id == source.id)
                    .values(config=updated_config)
                )
                await db.commit()

            logger.info("Calendar: access token refreshed successfully")
            return new_access_token

        except Exception as exc:
            logger.warning("Calendar: token refresh failed: %s", exc)
            return None

    def _format_start_time(self, start_time: str) -> str:
        """Format a start time string for display in snippet."""
        if not start_time:
            return "unknown"

        try:
            # Try ISO datetime format
            dt = datetime.fromisoformat(start_time.replace("Z", "+00:00"))
            return dt.strftime("%H:%M %Z")
        except (ValueError, AttributeError):
            # Fallback for date-only format
            return start_time
