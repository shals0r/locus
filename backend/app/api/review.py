"""Review API endpoints for MR/PR operations.

Wires task -> feed_item -> source_type + raw_payload -> credential lookup
-> review provider -> external API call.
"""

import json
import logging

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.credential import Credential
from app.models.feed_item import FeedItem
from app.models.integration_source import IntegrationSource
from app.models.task import Task
from app.schemas.review import (
    CommentThread,
    MrMetadata,
    ReplyRequest,
    ReviewSubmission,
)
from app.services.auth import get_current_user
from app.services.crypto import decrypt_value
from app.services.review_service import ReviewProvider, get_review_provider

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/review", tags=["review"])


async def _get_provider_for_task(
    task_id: str, db: AsyncSession
) -> tuple[ReviewProvider, str]:
    """Look up the review provider and MR ID for a given task.

    Follows the chain: task -> feed_item -> source_type + raw_payload
    -> IntegrationSource -> credential -> decrypt -> provider factory.

    Returns:
        Tuple of (ReviewProvider instance, mr_id string)
    """
    # Load task with feed_item relationship
    stmt = select(Task).where(Task.id == task_id)
    result = await db.execute(stmt)
    task = result.scalar_one_or_none()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    if not task.feed_item_id:
        raise HTTPException(
            status_code=400,
            detail="Task has no linked feed item",
        )

    # Load the feed item
    fi_stmt = select(FeedItem).where(FeedItem.id == task.feed_item_id)
    fi_result = await db.execute(fi_stmt)
    feed_item = fi_result.scalar_one_or_none()
    if not feed_item:
        raise HTTPException(status_code=404, detail="Feed item not found")

    source_type = feed_item.source_type
    raw_payload = feed_item.raw_payload or {}

    # Determine provider type (github or gitlab)
    provider_type = None
    if "github" in source_type.lower():
        provider_type = "github"
    elif "gitlab" in source_type.lower():
        provider_type = "gitlab"
    else:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported source type for review: {source_type}",
        )

    # Look up IntegrationSource to get credential_id
    is_stmt = select(IntegrationSource).where(
        IntegrationSource.source_type == source_type
    )
    is_result = await db.execute(is_stmt)
    integration_source = is_result.scalar_one_or_none()

    if not integration_source or not integration_source.credential_id:
        raise HTTPException(
            status_code=400,
            detail=f"No credential configured for source type: {source_type}",
        )

    # Load and decrypt credential
    cred_stmt = select(Credential).where(
        Credential.id == integration_source.credential_id
    )
    cred_result = await db.execute(cred_stmt)
    credential = cred_result.scalar_one_or_none()
    if not credential:
        raise HTTPException(status_code=400, detail="Credential not found")

    try:
        decrypted = decrypt_value(credential.encrypted_data)
        credential_data = json.loads(decrypted)
    except Exception:
        # If it's not JSON, treat the whole string as a token
        credential_data = {"token": decrypt_value(credential.encrypted_data)}

    # Extract project info from raw_payload
    project_info: dict = {}
    if provider_type == "github":
        # GitHub payloads typically have repository.owner.login and repository.name
        repo_data = raw_payload.get("repository", {})
        project_info["owner"] = (
            raw_payload.get("owner")
            or (repo_data.get("owner", {}).get("login") if isinstance(repo_data.get("owner"), dict) else "")
            or ""
        )
        project_info["repo"] = (
            raw_payload.get("repo")
            or repo_data.get("name", "")
        )
        if not project_info["owner"] or not project_info["repo"]:
            raise HTTPException(
                status_code=400,
                detail="Cannot determine owner/repo from feed item payload",
            )
    elif provider_type == "gitlab":
        project_data = raw_payload.get("project", {})
        project_info["project_id"] = str(
            raw_payload.get("project_id")
            or project_data.get("id", "")
        )
        project_info["gitlab_url"] = raw_payload.get(
            "gitlab_url", "https://gitlab.com"
        )
        if not project_info["project_id"]:
            raise HTTPException(
                status_code=400,
                detail="Cannot determine project_id from feed item payload",
            )

    # Extract MR/PR number
    mr_id = str(
        raw_payload.get("mr_iid")
        or raw_payload.get("pr_number")
        or raw_payload.get("iid")
        or raw_payload.get("number")
        or raw_payload.get("object_attributes", {}).get("iid", "")
        or raw_payload.get("pull_request", {}).get("number", "")
    )
    if not mr_id:
        raise HTTPException(
            status_code=400,
            detail="Cannot determine MR/PR number from feed item payload",
        )

    provider = get_review_provider(provider_type, credential_data, project_info)
    return provider, mr_id


@router.get("/metadata", response_model=MrMetadata)
async def get_metadata(
    task_id: str,
    _user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> MrMetadata:
    """Fetch MR/PR metadata for a task."""
    provider, mr_id = await _get_provider_for_task(task_id, db)
    try:
        data = await provider.get_mr_metadata(mr_id)
        return MrMetadata(**data)
    except Exception as exc:
        logger.error("Failed to fetch MR metadata: %s", exc)
        raise HTTPException(status_code=502, detail=f"Provider API error: {exc}")


@router.get("/diff")
async def get_diff(
    task_id: str,
    _user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Fetch MR/PR diff (changed files with patches)."""
    provider, mr_id = await _get_provider_for_task(task_id, db)
    try:
        return await provider.get_mr_diff(mr_id)
    except Exception as exc:
        logger.error("Failed to fetch MR diff: %s", exc)
        raise HTTPException(status_code=502, detail=f"Provider API error: {exc}")


@router.get("/comments", response_model=list[CommentThread])
async def get_comments(
    task_id: str,
    _user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[CommentThread]:
    """Fetch existing MR/PR comments as threads."""
    provider, mr_id = await _get_provider_for_task(task_id, db)
    try:
        threads = await provider.get_mr_comments(mr_id)
        return [CommentThread(**t) for t in threads]
    except Exception as exc:
        logger.error("Failed to fetch MR comments: %s", exc)
        raise HTTPException(status_code=502, detail=f"Provider API error: {exc}")


@router.post("/reply")
async def reply_to_comment(
    body: ReplyRequest,
    _user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Reply to an existing comment thread."""
    provider, mr_id = await _get_provider_for_task(body.task_id, db)
    try:
        return await provider.reply_to_comment(mr_id, body.thread_id, body.body)
    except Exception as exc:
        logger.error("Failed to reply to comment: %s", exc)
        raise HTTPException(status_code=502, detail=f"Provider API error: {exc}")


@router.post("/submit")
async def submit_review(
    body: ReviewSubmission,
    _user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Submit a full review with comments and event."""
    provider, mr_id = await _get_provider_for_task(body.task_id, db)
    comments = [c.model_dump() for c in body.comments]
    try:
        return await provider.post_review(mr_id, comments, body.event, body.body)
    except Exception as exc:
        logger.error("Failed to submit review: %s", exc)
        raise HTTPException(status_code=502, detail=f"Provider API error: {exc}")


@router.post("/approve")
async def approve_mr(
    task_id: str,
    _user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Approve an MR/PR."""
    provider, mr_id = await _get_provider_for_task(task_id, db)
    try:
        return await provider.approve(mr_id)
    except Exception as exc:
        logger.error("Failed to approve MR: %s", exc)
        raise HTTPException(status_code=502, detail=f"Provider API error: {exc}")
