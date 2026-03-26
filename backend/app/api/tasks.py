"""Task CRUD API with promote and state transition endpoints.

Supports the board tab (Queue/Active/Done) and the Start/Complete flows.
Tasks can be created manually or promoted from feed items.
"""

import logging

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.schemas.task import (
    TaskCreate,
    TaskResponse,
    TaskTransition,
    TaskUpdate,
)
from app.services.auth import get_current_user
from app.services.task_service import (
    create_task,
    get_tasks,
    promote_feed_item,
    transition_task,
    update_task,
)
from app.models.task import Task

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/tasks", tags=["tasks"])


# ---------------------------------------------------------------------------
# Inline request schemas for promote endpoints
# ---------------------------------------------------------------------------
from pydantic import BaseModel


class PromoteRequest(BaseModel):
    """Request body for quick-promoting a feed item to a task."""

    feed_item_id: str
    title: str
    context: str | None = None
    source_links: dict | None = None


class DeepPromoteRequest(BaseModel):
    """Request body for deep-promoting a feed item (LLM-enriched context)."""

    feed_item_id: str
    title: str
    context: str


# ---------------------------------------------------------------------------
# Task CRUD
# ---------------------------------------------------------------------------


@router.get("", response_model=list[TaskResponse])
async def list_tasks(
    status_filter: str | None = None,
    _user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[TaskResponse]:
    """List tasks with optional status filter.

    Query params:
        status: Optional filter - "queue", "active", or "done"

    Returns tasks sorted by tier priority within queue,
    started_at within active, completed_at desc within done.
    """
    tasks = await get_tasks(db, status=status_filter)
    return [TaskResponse.model_validate(t) for t in tasks]


@router.get("/{task_id}", response_model=TaskResponse)
async def get_task(
    task_id: str,
    _user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> TaskResponse:
    """Get a single task by ID."""
    stmt = select(Task).where(Task.id == task_id)
    result = await db.execute(stmt)
    task = result.scalar_one_or_none()

    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    return TaskResponse.model_validate(task)


@router.post("", response_model=TaskResponse, status_code=status.HTTP_201_CREATED)
async def create_new_task(
    body: TaskCreate,
    _user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> TaskResponse:
    """Create a manual task (no feed item link)."""
    task = await create_task(db, body.model_dump())
    return TaskResponse.model_validate(task)


@router.post("/promote", response_model=TaskResponse, status_code=status.HTTP_201_CREATED)
async def promote_to_task(
    body: PromoteRequest,
    _user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> TaskResponse:
    """Quick Promote: create a task from a feed item.

    Copies tier from the feed item. The feed item remains visible
    in the feed but the task provides the actionable board entry.
    """
    task = await promote_feed_item(
        db,
        feed_item_id=body.feed_item_id,
        title=body.title,
        context=body.context,
        source_links=body.source_links,
    )
    return TaskResponse.model_validate(task)


@router.post(
    "/deep-promote",
    response_model=TaskResponse,
    status_code=status.HTTP_201_CREATED,
)
async def deep_promote_to_task(
    body: DeepPromoteRequest,
    _user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> TaskResponse:
    """Deep Promote: create a task with LLM-generated context.

    Same as promote but context is richer (frontend handles the LLM call
    before submitting). Creates the task with the enriched context.
    """
    task = await promote_feed_item(
        db,
        feed_item_id=body.feed_item_id,
        title=body.title,
        context=body.context,
    )
    return TaskResponse.model_validate(task)


@router.patch("/{task_id}", response_model=TaskResponse)
async def update_existing_task(
    task_id: str,
    body: TaskUpdate,
    _user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> TaskResponse:
    """Update a task's title or context."""
    try:
        task = await update_task(db, task_id, body.model_dump(exclude_unset=True))
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))

    return TaskResponse.model_validate(task)


@router.patch("/{task_id}/transition", response_model=TaskResponse)
async def transition_task_status(
    task_id: str,
    body: TaskTransition,
    _user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> TaskResponse:
    """Transition a task between states (queue -> active -> done).

    Valid transitions:
    - queue -> active (start work)
    - queue -> done (skip/complete immediately)
    - active -> done (complete work)
    - active -> queue (move back to queue)

    Returns 422 for invalid transitions (e.g., done -> active).
    """
    try:
        task = await transition_task(
            db,
            task_id=task_id,
            new_status=body.status,
            machine_id=body.machine_id,
            repo_path=body.repo_path,
            branch=body.branch,
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        )

    return TaskResponse.model_validate(task)


@router.delete("/{task_id}")
async def delete_task(
    task_id: str,
    _user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Hard delete a task."""
    stmt = select(Task).where(Task.id == task_id)
    result = await db.execute(stmt)
    task = result.scalar_one_or_none()

    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    await db.delete(task)
    await db.flush()

    return {"ok": True}
