"""Worker management REST API.

Provides CRUD for integration workers plus start/stop/restart/enable
actions. Workers are subprocess-based polling scripts managed by the
WorkerSupervisor singleton.
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.schemas.worker import (
    WorkerActionResponse,
    WorkerCreate,
    WorkerListResponse,
    WorkerResponse,
    WorkerUpdate,
)
from app.services.auth import get_current_user
from app.services import worker_service
from app.services.worker_supervisor import WorkerSupervisor

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/workers", tags=["workers"])

# Supervisor singleton -- initialized at import time
_supervisor = WorkerSupervisor()


def get_supervisor() -> WorkerSupervisor:
    """Return the global supervisor instance."""
    return _supervisor


# ---------------------------------------------------------------------------
# CRUD endpoints
# ---------------------------------------------------------------------------


@router.get("", response_model=WorkerListResponse)
async def list_workers(
    _user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> WorkerListResponse:
    """List all workers with status."""
    workers = await worker_service.list_workers(db)
    return WorkerListResponse(
        workers=[WorkerResponse.model_validate(w) for w in workers],
        total=len(workers),
    )


@router.get("/{worker_id}", response_model=WorkerResponse)
async def get_worker(
    worker_id: str,
    _user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> WorkerResponse:
    """Get a single worker by ID."""
    worker = await worker_service.get_worker(db, worker_id)
    if not worker:
        raise HTTPException(status_code=404, detail="Worker not found")
    return WorkerResponse.model_validate(worker)


@router.post("", response_model=WorkerResponse, status_code=201)
async def create_worker(
    body: WorkerCreate,
    _user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> WorkerResponse:
    """Create a new worker entry."""
    worker = await worker_service.create_worker(db, body.model_dump())
    return WorkerResponse.model_validate(worker)


@router.patch("/{worker_id}", response_model=WorkerResponse)
async def update_worker(
    worker_id: str,
    body: WorkerUpdate,
    _user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> WorkerResponse:
    """Update worker configuration."""
    try:
        worker = await worker_service.update_worker(
            db, worker_id, body.model_dump(exclude_unset=True)
        )
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    return WorkerResponse.model_validate(worker)


@router.delete("/{worker_id}")
async def delete_worker(
    worker_id: str,
    _user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Delete a worker. Must be stopped first."""
    supervisor = get_supervisor()
    wp = supervisor.get_worker(worker_id)
    if wp and wp.state.value in ("running", "starting"):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Worker must be stopped before deletion",
        )

    try:
        await worker_service.delete_worker(db, worker_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    return {"ok": True}


# ---------------------------------------------------------------------------
# Action endpoints
# ---------------------------------------------------------------------------


@router.post("/{worker_id}/start", response_model=WorkerActionResponse)
async def start_worker(
    worker_id: str,
    _user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> WorkerActionResponse:
    """Start a worker subprocess via the supervisor."""
    worker = await worker_service.get_worker(db, worker_id)
    if not worker:
        raise HTTPException(status_code=404, detail="Worker not found")

    if not worker.worker_script_path:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Worker has no script path configured",
        )

    supervisor = get_supervisor()

    # Build environment with credentials
    env = await supervisor.build_worker_env(str(worker.id))

    # Determine venv python path if applicable
    venv_python = None

    await supervisor.start_worker(
        worker_id=str(worker.id),
        script_path=worker.worker_script_path,
        env=env,
        venv_python=venv_python,
    )

    return WorkerActionResponse(
        status="started",
        message=f"Worker {worker.name} started",
    )


@router.post("/{worker_id}/stop", response_model=WorkerActionResponse)
async def stop_worker(
    worker_id: str,
    _user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> WorkerActionResponse:
    """Stop a worker subprocess."""
    worker = await worker_service.get_worker(db, worker_id)
    if not worker:
        raise HTTPException(status_code=404, detail="Worker not found")

    supervisor = get_supervisor()
    await supervisor.stop_worker(str(worker.id))

    return WorkerActionResponse(
        status="stopped",
        message=f"Worker {worker.name} stopped",
    )


@router.post("/{worker_id}/restart", response_model=WorkerActionResponse)
async def restart_worker(
    worker_id: str,
    _user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> WorkerActionResponse:
    """Restart a worker subprocess."""
    worker = await worker_service.get_worker(db, worker_id)
    if not worker:
        raise HTTPException(status_code=404, detail="Worker not found")

    supervisor = get_supervisor()
    await supervisor.restart_worker(str(worker.id))

    return WorkerActionResponse(
        status="restarted",
        message=f"Worker {worker.name} restarted",
    )


@router.post("/{worker_id}/enable", response_model=WorkerActionResponse)
async def enable_worker(
    worker_id: str,
    _user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> WorkerActionResponse:
    """Re-enable a disabled worker.

    Resets failure_count, sets status to stopped, then auto-starts
    the worker (per D-09 design decision).
    """
    worker = await worker_service.get_worker(db, worker_id)
    if not worker:
        raise HTTPException(status_code=404, detail="Worker not found")

    if worker.worker_status != "disabled":
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Worker is not disabled",
        )

    # Reset failure state
    await worker_service.update_worker_status(
        db, str(worker.id), status="stopped", failure_count=0
    )

    # Auto-start after enable
    if worker.worker_script_path:
        supervisor = get_supervisor()
        env = await supervisor.build_worker_env(str(worker.id))
        await supervisor.start_worker(
            worker_id=str(worker.id),
            script_path=worker.worker_script_path,
            env=env,
        )

    return WorkerActionResponse(
        status="enabled",
        message=f"Worker {worker.name} re-enabled and started",
    )


@router.get("/{worker_id}/logs")
async def get_worker_logs(
    worker_id: str,
    _user: dict = Depends(get_current_user),
) -> dict:
    """Return buffered log lines for a worker as JSON array."""
    supervisor = get_supervisor()
    wp = supervisor.get_worker(worker_id)
    if not wp:
        return {"lines": [], "worker_id": worker_id}

    return {"lines": list(wp.log_buffer), "worker_id": worker_id}
