"""GSD event service for emitting feed items on GSD actions.

When GSD actions complete (phase planned, executed, verified, etc.),
this service creates corresponding feed items so they appear in the
universal work feed. Events are deduped by event type + repo + phase.
"""

from __future__ import annotations

import logging

from sqlalchemy.ext.asyncio import AsyncSession

from app.services.feed_service import broadcast_feed_update, ingest_item

logger = logging.getLogger(__name__)

# Mapping of GSD event types to feed item properties
_EVENT_CONFIG: dict[str, dict] = {
    "phase_planned": {
        "tier": "prep",
        "title_template": "Phase planned: {phase_name}",
    },
    "phase_executed": {
        "tier": "review",
        "title_template": "Phase executed: {phase_name}",
    },
    "phase_verified": {
        "tier": "follow_up",
        "title_template": "Phase verified: {phase_name}",
    },
    "gap_found": {
        "tier": "respond",
        "title_template": "Gaps found in {phase_name}",
    },
    "phase_complete": {
        "tier": "follow_up",
        "title_template": "Phase complete: {phase_name}",
    },
}


async def emit_gsd_event(
    db: AsyncSession,
    event_type: str,
    repo_path: str,
    machine_id: str,
    details: dict,
) -> object:
    """Emit a GSD event as a feed item.

    Creates a feed item for the given GSD event type, deduped by
    event_type + repo_path + phase. Broadcasts via WebSocket for
    real-time updates.

    Args:
        db: Async database session
        event_type: One of phase_planned, phase_executed, phase_verified,
                    gap_found, phase_complete
        repo_path: Path to the repo where the GSD action occurred
        machine_id: Machine where the repo lives
        details: Dict with at least {phase_name, phase} and optional extras

    Returns: The created/updated FeedItem
    """
    config = _EVENT_CONFIG.get(event_type)
    if not config:
        logger.warning("Unknown GSD event type: %s", event_type)
        # Default fallback for unknown event types
        config = {
            "tier": "follow_up",
            "title_template": f"GSD event ({event_type}): {{phase_name}}",
        }

    phase_name = details.get("phase_name", details.get("phase", "unknown"))
    phase = details.get("phase", "unknown")

    # Build external_id for dedup: gsd:{event_type}:{repo_path}:{phase}
    external_id = f"gsd:{event_type}:{repo_path}:{phase}"

    title = config["title_template"].format(phase_name=phase_name)

    payload = {
        "source_type": "gsd",
        "external_id": external_id,
        "title": title,
        "snippet": details.get("summary"),
        "tier_hint": config["tier"],
        "source_icon": "gsd",
        "metadata": {
            "event_type": event_type,
            "repo_path": repo_path,
            "machine_id": machine_id,
            **details,
        },
    }

    item = await ingest_item(db, payload)

    # Broadcast for real-time WebSocket push
    await broadcast_feed_update(item)

    logger.info(
        "GSD event emitted: %s for %s on %s",
        event_type, repo_path, machine_id,
    )

    return item
