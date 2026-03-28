"""Feed REST API endpoints.

Provides CRUD for feed items, HMAC-verified webhook ingest,
and meeting transcript ingestion with AI action-item extraction.
"""

import hashlib
import hmac
import logging
from datetime import datetime

import httpx
from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request, status
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.models.feed_item import FeedItem
from app.schemas.feed import (
    FeedItemResponse,
    FeedItemUpdate,
    FeedListResponse,
    IngestPayload,
)
from app.services.auth import get_current_user, verify_token
from app.services.feed_service import (
    dismiss_item,
    get_feed_items,
    ingest_item,
    snooze_item,
    update_feed_item,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/feed", tags=["feed"])


# ---------------------------------------------------------------------------
# Request schemas (inline for endpoint-specific bodies)
# ---------------------------------------------------------------------------
from pydantic import BaseModel


class SnoozeRequest(BaseModel):
    """Request body for snoozing a feed item."""
    until: datetime


class TranscriptRequest(BaseModel):
    """Request body for transcript submission."""
    transcript_text: str
    meeting_title: str | None = None
    meeting_date: str | None = None


# ---------------------------------------------------------------------------
# Webhook ingest (HMAC or JWT auth)
# ---------------------------------------------------------------------------


@router.post("/ingest")
async def ingest_webhook(
    request: Request,
    body: IngestPayload,
    db: AsyncSession = Depends(get_db),
    x_locus_signature: str | None = Header(None),
    x_locus_worker_secret: str | None = Header(None),
    authorization: str | None = Header(None),
) -> dict:
    """Ingest a feed item via webhook.

    Auth: X-Locus-Worker-Secret (worker subprocess auth),
    X-Locus-Signature (HMAC), or Bearer JWT token.
    """
    if x_locus_worker_secret:
        # Worker subprocess auth path
        from app.services.worker_supervisor import get_worker_secret
        if not hmac.compare_digest(x_locus_worker_secret, get_worker_secret()):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid worker secret",
            )
    elif x_locus_signature:
        # HMAC verification path
        raw_body = await request.body()
        # Look up webhook secret from settings or integration source
        webhook_secret = settings.webhook_secret if hasattr(settings, "webhook_secret") and settings.webhook_secret else None
        if not webhook_secret:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Webhook secret not configured",
            )
        expected = hmac.new(
            webhook_secret.encode(),
            raw_body,
            hashlib.sha256,
        ).hexdigest()
        if not hmac.compare_digest(f"sha256={expected}", x_locus_signature):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid HMAC signature",
            )
    else:
        # JWT auth path
        if not authorization or not authorization.startswith("Bearer "):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Authentication required (HMAC signature or JWT token)",
            )
        token = authorization.split(" ", 1)[1]
        verify_token(token)

    item = await ingest_item(db, body.model_dump())

    # Broadcast via WebSocket
    try:
        from app.ws.feed import broadcast_feed_update
        broadcast_feed_update({
            "type": "new_item",
            "item_id": str(item.id),
        })
    except Exception as exc:
        logger.warning("Feed broadcast failed (best-effort): %s", exc)

    return {"status": "ok", "item_id": str(item.id)}


# ---------------------------------------------------------------------------
# Feed CRUD
# ---------------------------------------------------------------------------


@router.get("", response_model=FeedListResponse)
async def list_feed(
    tier: str | None = Query(None),
    include_dismissed: bool = Query(False),
    _user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> FeedListResponse:
    """List feed items filtered by tier and sorted by urgency."""
    items = await get_feed_items(db, include_dismissed=include_dismissed, tier=tier)
    return FeedListResponse(
        items=[FeedItemResponse.model_validate(item) for item in items],
        total=len(items),
    )


@router.get("/{item_id}", response_model=FeedItemResponse)
async def get_feed_item(
    item_id: str,
    _user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> FeedItemResponse:
    """Get a single feed item by ID."""
    stmt = select(FeedItem).where(FeedItem.id == item_id)
    result = await db.execute(stmt)
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Feed item not found")
    return FeedItemResponse.model_validate(item)


@router.patch("/{item_id}", response_model=FeedItemResponse)
async def patch_feed_item(
    item_id: str,
    body: FeedItemUpdate,
    _user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> FeedItemResponse:
    """Update a feed item (read, dismiss, snooze, tier change)."""
    try:
        item = await update_feed_item(db, item_id, body.model_dump(exclude_unset=True))
    except ValueError:
        raise HTTPException(status_code=404, detail="Feed item not found")

    # Broadcast update
    try:
        from app.ws.feed import broadcast_feed_update
        broadcast_feed_update({
            "type": "item_updated",
            "item_id": str(item.id),
        })
    except Exception as exc:
        logger.warning("Feed broadcast failed (best-effort): %s", exc)

    return FeedItemResponse.model_validate(item)


@router.post("/{item_id}/snooze", response_model=FeedItemResponse)
async def snooze_feed_item(
    item_id: str,
    body: SnoozeRequest,
    _user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> FeedItemResponse:
    """Snooze a feed item until a specific time."""
    try:
        item = await snooze_item(db, item_id, body.until)
    except ValueError:
        raise HTTPException(status_code=404, detail="Feed item not found")
    return FeedItemResponse.model_validate(item)


@router.post("/{item_id}/dismiss", response_model=FeedItemResponse)
async def dismiss_feed_item(
    item_id: str,
    _user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> FeedItemResponse:
    """Dismiss a feed item."""
    try:
        item = await dismiss_item(db, item_id)
    except ValueError:
        raise HTTPException(status_code=404, detail="Feed item not found")

    # Broadcast dismiss
    try:
        from app.ws.feed import broadcast_feed_update
        broadcast_feed_update({
            "type": "item_dismissed",
            "item_id": str(item.id),
        })
    except Exception as exc:
        logger.warning("Feed broadcast failed (best-effort): %s", exc)

    return FeedItemResponse.model_validate(item)


@router.delete("/{item_id}")
async def delete_feed_item(
    item_id: str,
    _user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Hard delete a feed item (admin cleanup)."""
    stmt = select(FeedItem).where(FeedItem.id == item_id)
    result = await db.execute(stmt)
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Feed item not found")
    await db.delete(item)
    await db.flush()
    return {"ok": True}


# ---------------------------------------------------------------------------
# Transcript ingestion (FEED-07)
# ---------------------------------------------------------------------------


@router.post("/transcripts")
async def ingest_transcript(
    body: TranscriptRequest,
    _user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Accept meeting transcript text and extract action items via LLM.

    Each extracted action item becomes a feed item with source_type="transcript".
    Falls back to creating a single feed item with the full transcript if
    LLM extraction fails.
    """
    created_items: list[FeedItemResponse] = []

    if settings.llm_api_key:
        try:
            actions = await _extract_actions_from_transcript(body.transcript_text)
            for action in actions:
                external_id = f"transcript:{hashlib.md5((action.get('title', '') + (body.meeting_date or '')).encode()).hexdigest()}"
                item = await ingest_item(db, {
                    "source_type": "transcript",
                    "external_id": external_id,
                    "title": action.get("title", "Action item"),
                    "snippet": action.get("context"),
                    "tier_hint": action.get("urgency", "review"),
                    "source_icon": "transcript",
                    "metadata": {
                        "meeting_title": body.meeting_title,
                        "meeting_date": body.meeting_date,
                    },
                })
                created_items.append(FeedItemResponse.model_validate(item))

                # Broadcast new item
                try:
                    from app.ws.feed import broadcast_feed_update
                    broadcast_feed_update({
                        "type": "new_item",
                        "item_id": str(item.id),
                    })
                except Exception as exc:
                    logger.warning("Feed broadcast failed (best-effort): %s", exc)

            return {
                "status": "ok",
                "items": [item.model_dump(mode="json") for item in created_items],
            }
        except Exception as exc:
            logger.warning("LLM transcript extraction failed: %s, creating single item", exc)

    # Fallback: create a single feed item with the full transcript
    title = body.meeting_title or "Meeting transcript"
    external_id = f"transcript:{hashlib.md5((title + (body.meeting_date or '')).encode()).hexdigest()}"
    item = await ingest_item(db, {
        "source_type": "transcript",
        "external_id": external_id,
        "title": title,
        "snippet": body.transcript_text[:500],
        "tier_hint": "review",
        "source_icon": "transcript",
        "metadata": {
            "meeting_title": body.meeting_title,
            "meeting_date": body.meeting_date,
            "full_transcript": body.transcript_text,
        },
    })
    created_items.append(FeedItemResponse.model_validate(item))

    return {
        "status": "ok",
        "items": [item.model_dump(mode="json") for item in created_items],
    }


async def _extract_actions_from_transcript(transcript_text: str) -> list[dict]:
    """Use LLM to extract action items from a meeting transcript.

    Returns list of {title, context, urgency}.
    """
    import json as json_module

    prompt = (
        "Extract action items from this meeting transcript. "
        "For each, provide: title (brief), context (1-2 sentences), "
        "and urgency (now/respond/review/prep/follow_up). "
        "Return JSON array of {title, context, urgency}. "
        f"Transcript: {transcript_text}"
    )

    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.post(
            settings.llm_api_url,
            headers={
                "x-api-key": settings.llm_api_key,
                "anthropic-version": "2023-06-01",
                "content-type": "application/json",
            },
            json={
                "model": settings.llm_model,
                "max_tokens": 2000,
                "messages": [{"role": "user", "content": prompt}],
            },
        )
        response.raise_for_status()
        data = response.json()
        text = data["content"][0]["text"].strip()

        # Extract JSON from the response (handle markdown code blocks)
        if "```json" in text:
            text = text.split("```json")[1].split("```")[0].strip()
        elif "```" in text:
            text = text.split("```")[1].split("```")[0].strip()

        actions = json_module.loads(text)
        if not isinstance(actions, list):
            raise ValueError("LLM did not return a JSON array")
        return actions
