"""Abstract base class for polling adapters.

All polling adapters extend BasePollingAdapter and implement poll().
The execute() method handles the full lifecycle: poll -> mention check
-> tier elevation -> ingest -> broadcast. Error handling wraps everything
to prevent adapter failures from killing the scheduler job.
"""

from __future__ import annotations

import logging
import re
from abc import ABC, abstractmethod
from datetime import datetime, timezone
from typing import Any

from app.database import async_session_factory
from app.models.integration_source import IntegrationSource
from app.services import feed_service
from app.ws.feed import broadcast_feed_update

logger = logging.getLogger(__name__)

# Tier elevation order (lower index = higher urgency)
_TIER_RANK = {
    "now": 0,
    "respond": 1,
    "review": 2,
    "prep": 3,
    "follow_up": 4,
}


class BasePollingAdapter(ABC):
    """Abstract base class for integration polling adapters.

    Subclasses must implement poll() which returns a list of dicts
    matching the IngestPayload schema (source_type, external_id,
    title, snippet, url, tier_hint, source_icon, metadata).
    """

    @abstractmethod
    async def poll(self, source: IntegrationSource) -> list[dict]:
        """Poll the external source and return items as dicts.

        Each dict should have at minimum:
            source_type, external_id, title

        Optional fields:
            snippet, url, tier_hint, source_icon, metadata, body
            (body is used for mention detection but not persisted directly)

        Returns:
            List of dicts matching IngestPayload schema.
        """
        ...

    async def execute(self, source: IntegrationSource) -> None:
        """Execute the full poll-ingest cycle for this source.

        1. Call self.poll() to get items from the external API
        2. For each item, check for @mentions and elevate tier if needed
        3. Ingest each item via feed_service.ingest_item
        4. Broadcast new items to connected feed WebSocket clients
        5. Update source.last_polled_at

        All errors are caught and logged -- never propagated to APScheduler.
        """
        try:
            items = await self.poll(source)
            if not items:
                logger.debug(
                    "No items from %s poll", source.source_type
                )
                # Still update last_polled_at even with no items
                await self._update_last_polled(source)
                return

            ingested_count = 0
            async with async_session_factory() as db:
                for item in items:
                    try:
                        # Check mentions and elevate tier if needed
                        item = self._elevate_tier_if_mentioned(item, source)

                        # Ingest via feed service (upsert dedup)
                        feed_item = await feed_service.ingest_item(db, item)
                        ingested_count += 1

                        # Broadcast to connected WebSocket clients
                        broadcast_feed_update({
                            "type": "new_item",
                            "item_id": str(feed_item.id),
                            "source_type": feed_item.source_type,
                            "title": feed_item.title,
                            "tier": feed_item.tier,
                        })
                    except Exception as item_exc:
                        logger.warning(
                            "Failed to ingest item %s from %s: %s",
                            item.get("external_id", "unknown"),
                            source.source_type,
                            item_exc,
                        )

                await db.commit()

            logger.info(
                "Polled %s: %d items fetched, %d ingested",
                source.source_type,
                len(items),
                ingested_count,
            )

            # Update last_polled_at
            await self._update_last_polled(source)

        except Exception as exc:
            logger.error(
                "Adapter %s failed during execute: %s",
                source.source_type,
                exc,
                exc_info=True,
            )

    def _is_mentioned(self, item: dict, source: IntegrationSource) -> bool:
        """Check if the user is @mentioned in the item content.

        Reads the user's configured usernames from source.config
        (e.g., github_username, gitlab_username, jira_username, email).
        Searches item title, snippet, and body for @username patterns.
        Case-insensitive matching.

        Args:
            item: Dict with title, snippet, body fields
            source: IntegrationSource with config containing usernames

        Returns:
            True if the user is @mentioned in any searchable field.
        """
        config = source.config or {}

        # Collect all usernames to check for mentions
        usernames: list[str] = []
        for key in (
            "github_username",
            "gitlab_username",
            "jira_username",
            "username",
            "email",
        ):
            val = config.get(key)
            if val:
                usernames.append(val)

        if not usernames:
            return False

        # Build searchable text from item fields
        searchable_parts = []
        for field in ("title", "snippet", "body", "description"):
            val = item.get(field)
            if val and isinstance(val, str):
                searchable_parts.append(val)

        if not searchable_parts:
            return False

        text = " ".join(searchable_parts).lower()

        # Check for @username mentions (case-insensitive)
        for username in usernames:
            # Match @username with word boundary (not part of email domain)
            pattern = rf"@{re.escape(username.lower())}\b"
            if re.search(pattern, text):
                return True

            # Also check for plain username mentions in review/assignee contexts
            if username.lower() in text:
                return True

        return False

    def _elevate_tier_if_mentioned(
        self, item: dict, source: IntegrationSource
    ) -> dict:
        """Elevate item tier if the user is @mentioned.

        Tier elevation rules (FEED-05):
        - If mentioned and tier is "prep", "follow_up", or None -> "respond"
        - If mentioned and tier is "review" -> "respond"
        - If tier is already "now" or "respond" -> leave as-is

        Args:
            item: Dict with tier_hint field
            source: IntegrationSource for mention detection

        Returns:
            The (possibly modified) item dict.
        """
        if not self._is_mentioned(item, source):
            return item

        current_tier = item.get("tier_hint")

        if current_tier in ("now", "respond"):
            # Already high urgency, leave as-is
            return item

        # Elevate to "respond" for mentioned items
        item["tier_hint"] = "respond"
        logger.debug(
            "Elevated tier for %s from %s to respond (user mentioned)",
            item.get("external_id", "unknown"),
            current_tier,
        )
        return item

    async def _update_last_polled(self, source: IntegrationSource) -> None:
        """Update the source's last_polled_at timestamp."""
        try:
            async with async_session_factory() as db:
                from sqlalchemy import update

                await db.execute(
                    update(IntegrationSource)
                    .where(IntegrationSource.id == source.id)
                    .values(last_polled_at=datetime.now(timezone.utc))
                )
                await db.commit()
        except Exception as exc:
            logger.warning(
                "Failed to update last_polled_at for %s: %s",
                source.source_type,
                exc,
            )
