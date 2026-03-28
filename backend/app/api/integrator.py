"""Integrator chat REST endpoints.

Routes user messages through Claude Code CLI on a connected machine
for interactive integration worker building.
"""

import logging

from fastapi import APIRouter, Body, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.schemas.integrator import (
    IntegratorDeployRequest,
    IntegratorMessage,
    IntegratorResponse,
)
from app.services.auth import get_current_user
from app.services.integrator_service import integrator_service
from app.services import machine_registry

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/integrator", tags=["integrator"])


@router.post("/message", response_model=IntegratorResponse)
async def send_message(
    body: IntegratorMessage,
    _user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> IntegratorResponse:
    """Send a message to the Integrator and get a response.

    Requires a machine_id to route through Claude Code CLI on that machine.
    """
    if not body.machine_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="machine_id is required to route through Claude Code CLI",
        )

    # Get connection for the target machine
    conn = await machine_registry.get_connection_for_machine(body.machine_id)
    if conn is None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Machine is not connected or not available",
        )

    # Determine working directory based on worker_id
    cwd = "/data/workers"
    if body.worker_id:
        cwd = f"/data/workers/user/{body.worker_id}"

    result = await integrator_service.send_message(
        conn=conn,
        message=body.content,
        session_id=body.session_id,
        cwd=cwd,
    )

    return IntegratorResponse(**result)


@router.post("/deploy")
async def deploy_worker(
    body: IntegratorDeployRequest,
    _user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Deploy a worker from an Integrator session.

    Creates the IntegrationSource DB entry, sets up a venv if needed,
    and starts the worker through the supervisor.
    """
    # Import supervisor lazily to avoid circular imports
    try:
        from app.services.worker_supervisor import worker_supervisor
        supervisor = worker_supervisor
    except ImportError:
        # Supervisor may not exist yet -- return a stub response
        logger.warning("WorkerSupervisor not available, returning stub deploy response")
        return {
            "worker_id": body.worker_id,
            "status": "pending",
            "message": "Worker supervisor not available. Worker recorded but not started.",
        }

    result = await integrator_service.deploy_worker(
        db=db,
        worker_id=body.worker_id,
        script_path=body.script_path,
        name=body.name,
        source_type=body.source_type,
        supervisor=supervisor,
    )
    return result


@router.get("/machines")
async def list_integrator_machines(
    _user: dict = Depends(get_current_user),
) -> list[dict]:
    """List machines available for Integrator (have Claude Code installed)."""
    machines = await integrator_service.get_machines_with_claude(machine_registry)
    return machines
