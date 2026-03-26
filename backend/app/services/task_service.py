"""Task service with state machine enforcement.

Tasks follow the Queue -> Active -> Done lifecycle.
Valid transitions: queue->active, queue->done, active->done, active->queue.
Done is terminal (no transitions out of done).
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import case, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.feed_item import FeedItem
from app.models.task import Task
from app.services.feed_service import TIER_PRIORITY

logger = logging.getLogger(__name__)

# State machine: valid transitions from each status
VALID_TRANSITIONS: dict[str, set[str]] = {
    "queue": {"active", "done"},
    "active": {"done", "queue"},
    "done": set(),  # Terminal state
}


async def create_task(db: AsyncSession, data: dict) -> Task:
    """Create a new task from a dict.

    Args:
        data: Dict with title, context (optional), tier, feed_item_id (optional),
              source_links (optional)

    Returns: Created Task with status="queue"
    """
    task = Task(
        title=data["title"],
        context=data.get("context"),
        tier=data.get("tier", "follow_up"),
        status="queue",
        feed_item_id=data.get("feed_item_id"),
        source_links=data.get("source_links"),
    )
    db.add(task)
    await db.flush()
    return task


async def promote_feed_item(
    db: AsyncSession,
    feed_item_id: str,
    title: str,
    context: str | None = None,
    source_links: dict | None = None,
) -> Task:
    """Create a task linked to a feed item (promote from feed).

    Copies the tier from the feed item. The feed item remains in the feed
    but the task provides the actionable representation on the board.
    """
    # Look up the feed item to copy tier
    stmt = select(FeedItem).where(FeedItem.id == feed_item_id)
    result = await db.execute(stmt)
    feed_item = result.scalar_one_or_none()

    tier = feed_item.tier if feed_item else "follow_up"

    task = Task(
        title=title,
        context=context,
        tier=tier,
        status="queue",
        feed_item_id=feed_item_id,
        source_links=source_links,
    )
    db.add(task)
    await db.flush()
    return task


async def transition_task(
    db: AsyncSession,
    task_id: str,
    new_status: str,
    **kwargs,
) -> Task:
    """Transition a task to a new status with validation.

    Enforces VALID_TRANSITIONS state machine. Sets timestamps and
    context fields on transition.

    Args:
        task_id: UUID of the task
        new_status: Target status (queue, active, done)
        **kwargs: Additional fields for the transition:
            - machine_id: Set on queue->active
            - repo_path: Set on queue->active
            - branch: Set on queue->active

    Raises:
        ValueError: If the transition is invalid
    """
    stmt = select(Task).where(Task.id == task_id)
    result = await db.execute(stmt)
    task = result.scalar_one_or_none()

    if not task:
        raise ValueError(f"Task {task_id} not found")

    current_status = task.status
    allowed = VALID_TRANSITIONS.get(current_status, set())

    if new_status not in allowed:
        raise ValueError(
            f"Invalid transition: {current_status} -> {new_status}. "
            f"Allowed: {allowed or 'none (terminal state)'}"
        )

    task.status = new_status

    # Set timestamps and context on specific transitions
    now = datetime.now(timezone.utc)

    if new_status == "active":
        task.started_at = now
        # Set work context from kwargs
        if "machine_id" in kwargs:
            task.machine_id = kwargs["machine_id"]
        if "repo_path" in kwargs:
            task.repo_path = kwargs["repo_path"]
        if "branch" in kwargs:
            task.branch = kwargs["branch"]

    if new_status == "done":
        task.completed_at = now

    if new_status == "queue":
        # Moving back to queue clears active context
        task.started_at = None

    await db.flush()
    return task


async def get_tasks(
    db: AsyncSession, status: str | None = None
) -> list[Task]:
    """Query tasks with optional status filter.

    Ordering:
    - queue: by tier priority (now first)
    - active: by started_at ascending
    - done: by completed_at descending
    """
    stmt = select(Task)

    if status:
        stmt = stmt.where(Task.status == status)

    # Order by tier priority, then appropriate timestamp
    tier_order = case(
        TIER_PRIORITY,
        value=Task.tier,
        else_=5,
    )
    stmt = stmt.order_by(
        tier_order,
        Task.started_at.asc().nulls_last(),
        Task.created_at.desc(),
    )

    result = await db.execute(stmt)
    return list(result.scalars().all())


async def update_task(
    db: AsyncSession, task_id: str, updates: dict
) -> Task:
    """Update task title or context."""
    stmt = select(Task).where(Task.id == task_id)
    result = await db.execute(stmt)
    task = result.scalar_one_or_none()

    if not task:
        raise ValueError(f"Task {task_id} not found")

    allowed_fields = {"title", "context"}
    for field, value in updates.items():
        if field in allowed_fields:
            setattr(task, field, value)

    await db.flush()
    return task
