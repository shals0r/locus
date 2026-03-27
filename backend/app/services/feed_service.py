"""Feed service for the universal work feed.

Handles feed item ingestion with upsert dedup, AI-assisted tier
classification (with graceful fallback), and CRUD operations.
All items flow through ingest_item() regardless of source.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Optional

import httpx
from sqlalchemy import case, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.feed_item import FeedItem

logger = logging.getLogger(__name__)

# Priority ordering for tier-based sorting
TIER_PRIORITY: dict[str, int] = {
    "now": 0,
    "respond": 1,
    "review": 2,
    "prep": 3,
    "follow_up": 4,
}

# Source-type heuristic fallback when LLM is unavailable
_SOURCE_TIER_FALLBACK: dict[str, str] = {
    "ci": "now",
    "ci_failure": "now",
    "pr_review": "review",
    "merge_request": "review",
    "pull_request": "review",
    "jira_high": "respond",
    "jira": "respond",
    "github_issue": "respond",
    "gitlab_issue": "respond",
    "calendar": "prep",
    "meeting": "prep",
    "gsd": "follow_up",
    "chat": "follow_up",
}

# Connected WebSocket clients for real-time feed updates
# Will be populated by the WebSocket endpoint (Plan 03/04)
_feed_subscribers: set = set()


async def classify_tier(
    title: str, snippet: str | None, source_type: str
) -> str:
    """AI-assisted tier classification using LLM.

    Sends a prompt to the configured LLM endpoint to classify a work item
    into one of 5 urgency tiers. Falls back to source-type heuristic if
    the LLM call fails (no API key, timeout, error).

    Returns: One of "now", "respond", "review", "prep", "follow_up"
    """
    # Try LLM classification first
    if settings.llm_api_key:
        try:
            tier = await _classify_via_llm(title, snippet, source_type)
            if tier in TIER_PRIORITY:
                return tier
            logger.warning("LLM returned invalid tier %r, falling back", tier)
        except Exception as exc:
            logger.warning("LLM classification failed: %s, falling back", exc)

    # Fallback: source-type-based heuristic
    return _classify_heuristic(source_type)


async def _classify_via_llm(
    title: str, snippet: str | None, source_type: str
) -> str:
    """Call the Anthropic API to classify a work item tier."""
    prompt = (
        "Classify this work item into one of these urgency tiers: "
        "now, respond, review, prep, follow_up.\n\n"
        f"Title: {title}\n"
        f"Source: {source_type}\n"
    )
    if snippet:
        prompt += f"Snippet: {snippet}\n"
    prompt += "\nRespond with ONLY the tier name."

    async with httpx.AsyncClient(timeout=10.0) as client:
        response = await client.post(
            settings.llm_api_url,
            headers={
                "x-api-key": settings.llm_api_key,
                "anthropic-version": "2023-06-01",
                "content-type": "application/json",
            },
            json={
                "model": settings.llm_model,
                "max_tokens": 20,
                "messages": [{"role": "user", "content": prompt}],
            },
        )
        response.raise_for_status()
        data = response.json()
        # Extract text from Anthropic API response format
        tier_text = data["content"][0]["text"].strip().lower()
        # Normalize: replace spaces/hyphens with underscores
        tier_text = tier_text.replace(" ", "_").replace("-", "_")
        return tier_text


def _classify_heuristic(source_type: str) -> str:
    """Fallback tier classification based on source type."""
    return _SOURCE_TIER_FALLBACK.get(source_type, "follow_up")


async def ingest_item(db: AsyncSession, payload: dict) -> FeedItem:
    """Ingest a feed item with upsert dedup.

    Uses PostgreSQL INSERT...ON CONFLICT(source_type, external_id) DO UPDATE
    to handle duplicate items gracefully. If tier_hint is provided, uses it
    directly. Otherwise calls classify_tier() for AI-suggested tier.

    Args:
        db: Async database session
        payload: Dict with source_type, external_id, title, snippet, url,
                 tier_hint, source_icon, metadata (raw_payload)

    Returns: The created or updated FeedItem
    """
    # Determine tier: use hint if provided, otherwise AI-classify
    tier = payload.get("tier_hint")
    if not tier:
        tier = await classify_tier(
            title=payload["title"],
            snippet=payload.get("snippet"),
            source_type=payload["source_type"],
        )

    values = {
        "source_type": payload["source_type"],
        "external_id": payload["external_id"],
        "title": payload["title"],
        "snippet": payload.get("snippet"),
        "url": payload.get("url"),
        "tier": tier,
        "source_icon": payload.get("source_icon"),
        "raw_payload": payload.get("metadata") or payload.get("raw_payload"),
    }

    stmt = pg_insert(FeedItem).values(**values)
    stmt = stmt.on_conflict_do_update(
        constraint="uq_feed_source_external",
        set_={
            "title": stmt.excluded.title,
            "snippet": stmt.excluded.snippet,
            "url": stmt.excluded.url,
            "tier": stmt.excluded.tier,
            "source_icon": stmt.excluded.source_icon,
            "raw_payload": stmt.excluded.raw_payload,
            "is_dismissed": False,  # Re-surface on update
            "updated_at": datetime.now(timezone.utc),
        },
    )
    stmt = stmt.returning(FeedItem)

    result = await db.execute(stmt)
    item = result.scalar_one()
    await db.flush()

    return item


async def get_feed_items(
    db: AsyncSession,
    include_dismissed: bool = False,
    tier: str | None = None,
) -> list[FeedItem]:
    """Query feed items with filters.

    Excludes snoozed items (snoozed_until > now) and dismissed items
    by default. Orders by tier priority then created_at descending.
    """
    now = datetime.now(timezone.utc)

    stmt = select(FeedItem)

    # Filter dismissed
    if not include_dismissed:
        stmt = stmt.where(FeedItem.is_dismissed.is_(False))

    # Filter snoozed (exclude items still snoozed)
    stmt = stmt.where(
        (FeedItem.snoozed_until.is_(None)) | (FeedItem.snoozed_until <= now)
    )

    # Filter by tier
    if tier:
        stmt = stmt.where(FeedItem.tier == tier)

    # Order by tier priority (now=0, respond=1, ...) then recency
    tier_order = case(
        TIER_PRIORITY,
        value=FeedItem.tier,
        else_=5,
    )
    stmt = stmt.order_by(tier_order, FeedItem.created_at.desc())

    result = await db.execute(stmt)
    return list(result.scalars().all())


async def update_feed_item(
    db: AsyncSession, item_id: str, updates: dict
) -> FeedItem:
    """Update feed item fields (is_read, is_dismissed, snoozed_until, tier)."""
    stmt = select(FeedItem).where(FeedItem.id == item_id)
    result = await db.execute(stmt)
    item = result.scalar_one_or_none()
    if not item:
        raise ValueError(f"Feed item {item_id} not found")

    for field, value in updates.items():
        if hasattr(item, field):
            setattr(item, field, value)

    await db.flush()
    await db.refresh(item)
    return item


async def snooze_item(db: AsyncSession, item_id: str, until: datetime) -> FeedItem:
    """Snooze a feed item until a specific time."""
    return await update_feed_item(db, item_id, {"snoozed_until": until})


async def dismiss_item(db: AsyncSession, item_id: str) -> FeedItem:
    """Dismiss a feed item (hide from default view)."""
    return await update_feed_item(db, item_id, {"is_dismissed": True})


async def mark_read(db: AsyncSession, item_id: str) -> FeedItem:
    """Mark a feed item as read."""
    return await update_feed_item(db, item_id, {"is_read": True})


async def broadcast_feed_update(item: FeedItem) -> None:
    """Broadcast a feed item update to connected WebSocket clients.

    This is a placeholder that will be wired to the /ws/feed WebSocket
    endpoint in Plan 03/04. Currently logs the broadcast intent.
    """
    logger.debug("Feed update broadcast: %s (%s)", item.title, item.tier)
    # WebSocket broadcasting will be implemented in the feed WebSocket plan
    # For now, subscribers set is available for the WS endpoint to populate
