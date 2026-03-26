"""WebSocket endpoint for real-time feed updates.

Clients connect to /ws/feed?token=... and receive:
1. Initial snapshot of recent unread feed items on connect
2. Live updates when items are created, updated, or dismissed

The broadcast_feed_update() function is importable by API routes
(api/feed.py, api/gsd_events.py) for pushing updates after mutations.
"""

from __future__ import annotations

import asyncio
import json
import logging
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from sqlalchemy import select, case

from app.database import async_session_factory
from app.models.feed_item import FeedItem
from app.services.auth import verify_token

logger = logging.getLogger(__name__)

router = APIRouter()

# Connected WebSocket client queues for broadcasting
feed_clients: list[asyncio.Queue] = []


def broadcast_feed_update(update: dict) -> None:
    """Push a feed update to all connected WebSocket clients.

    Call this from API routes after feed mutations.
    Non-blocking: silently drops if a client queue is full.

    Args:
        update: Dict with type ("new_item", "item_updated", "item_dismissed")
                and item_id fields.
    """
    for queue in feed_clients:
        try:
            queue.put_nowait(update)
        except asyncio.QueueFull:
            logger.debug("Feed WS client queue full, dropping update")


@router.websocket("/ws/feed")
async def feed_websocket(websocket: WebSocket) -> None:
    """WebSocket endpoint for live feed updates.

    Auth via ?token= query parameter. Sends initial snapshot on connect
    (last 50 unread, undismissed, unsnoozed items), then pushes
    real-time updates as items are created/updated/dismissed.
    """
    # Auth check
    token = websocket.query_params.get("token")
    if not token:
        await websocket.close(code=4001, reason="Missing token")
        return

    try:
        verify_token(token)
    except Exception:
        await websocket.close(code=4003, reason="Invalid token")
        return

    await websocket.accept()

    # Create bounded queue for this client
    client_queue: asyncio.Queue = asyncio.Queue(maxsize=100)
    feed_clients.append(client_queue)

    try:
        # Send initial snapshot of recent feed items
        snapshot = await _build_feed_snapshot()
        await websocket.send_text(json.dumps({
            "type": "initial",
            "items": snapshot,
        }))

        # Main loop: forward queued updates to the client
        while True:
            try:
                update = await asyncio.wait_for(client_queue.get(), timeout=30.0)
                await websocket.send_text(json.dumps(update))
            except asyncio.TimeoutError:
                # Send keepalive ping
                try:
                    await websocket.send_text(json.dumps({"type": "ping"}))
                except Exception:
                    break
    except WebSocketDisconnect:
        pass
    except Exception as exc:
        logger.warning("Feed WebSocket error: %s", exc)
    finally:
        # Remove client queue
        try:
            feed_clients.remove(client_queue)
        except ValueError:
            pass


async def _build_feed_snapshot() -> list[dict]:
    """Build initial snapshot of recent unread feed items.

    Returns last 50 items that are not dismissed and not currently snoozed,
    ordered by tier priority then recency.
    """
    from app.services.feed_service import TIER_PRIORITY

    now = datetime.now(timezone.utc)

    try:
        async with async_session_factory() as db:
            stmt = (
                select(FeedItem)
                .where(FeedItem.is_dismissed.is_(False))
                .where(
                    (FeedItem.snoozed_until.is_(None))
                    | (FeedItem.snoozed_until <= now)
                )
            )

            # Order by tier priority then recency
            tier_order = case(
                TIER_PRIORITY,
                value=FeedItem.tier,
                else_=5,
            )
            stmt = stmt.order_by(tier_order, FeedItem.created_at.desc()).limit(50)

            result = await db.execute(stmt)
            items = result.scalars().all()

            return [
                {
                    "id": str(item.id),
                    "source_type": item.source_type,
                    "external_id": item.external_id,
                    "title": item.title,
                    "snippet": item.snippet,
                    "url": item.url,
                    "tier": item.tier,
                    "is_read": item.is_read,
                    "source_icon": item.source_icon,
                    "created_at": item.created_at.isoformat() if item.created_at else None,
                }
                for item in items
            ]
    except Exception as exc:
        logger.warning("Failed to build feed snapshot: %s", exc)
        return []
