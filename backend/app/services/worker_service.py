"""Worker CRUD database operations.

Provides async functions for managing IntegrationSource records as
worker entries. Used by the workers REST API.
"""

from __future__ import annotations

import logging

from sqlalchemy import select, update as sql_update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.integration_source import IntegrationSource

logger = logging.getLogger(__name__)


async def list_workers(db: AsyncSession) -> list[IntegrationSource]:
    """List all integration sources ordered by name."""
    result = await db.execute(
        select(IntegrationSource).order_by(IntegrationSource.name)
    )
    return list(result.scalars().all())


async def get_worker(db: AsyncSession, worker_id: str) -> IntegrationSource | None:
    """Get a single worker by ID."""
    result = await db.execute(
        select(IntegrationSource).where(IntegrationSource.id == worker_id)
    )
    return result.scalar_one_or_none()


async def create_worker(db: AsyncSession, data: dict) -> IntegrationSource:
    """Create a new worker entry.

    Sets worker_script_path based on source_type for built-in workers.
    """
    source = IntegrationSource(**data)
    db.add(source)
    await db.flush()
    return source


async def update_worker(
    db: AsyncSession, worker_id: str, data: dict
) -> IntegrationSource:
    """Update worker fields (name, poll_interval, credential_id, is_enabled, config).

    Raises ValueError if worker not found.
    """
    result = await db.execute(
        select(IntegrationSource).where(IntegrationSource.id == worker_id)
    )
    source = result.scalar_one_or_none()
    if not source:
        raise ValueError(f"Worker {worker_id} not found")

    for key, value in data.items():
        if hasattr(source, key) and value is not None:
            setattr(source, key, value)

    await db.flush()
    return source


async def delete_worker(db: AsyncSession, worker_id: str) -> None:
    """Delete a worker. Caller must stop it first.

    Raises ValueError if worker not found.
    """
    result = await db.execute(
        select(IntegrationSource).where(IntegrationSource.id == worker_id)
    )
    source = result.scalar_one_or_none()
    if not source:
        raise ValueError(f"Worker {worker_id} not found")

    await db.delete(source)
    await db.flush()


async def update_worker_status(
    db: AsyncSession,
    worker_id: str,
    status: str,
    failure_count: int | None = None,
    pid: int | None = None,
) -> None:
    """Update runtime status fields (called by supervisor)."""
    values: dict = {"worker_status": status}
    if failure_count is not None:
        values["failure_count"] = failure_count
    if pid is not None:
        values["worker_pid"] = pid

    await db.execute(
        sql_update(IntegrationSource)
        .where(IntegrationSource.id == worker_id)
        .values(**values)
    )
    await db.flush()


async def increment_items_ingested(
    db: AsyncSession, worker_id: str, count: int
) -> None:
    """Increment total_items_ingested counter."""
    result = await db.execute(
        select(IntegrationSource).where(IntegrationSource.id == worker_id)
    )
    source = result.scalar_one_or_none()
    if source:
        source.total_items_ingested = (source.total_items_ingested or 0) + count
        await db.flush()
