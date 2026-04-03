"""Machine CRUD API with SSH connection management."""

import logging
from uuid import UUID

import asyncssh
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.local.manager import LOCAL_MACHINE_ID, LOCAL_MACHINE_NAME, local_machine_manager
from app.local.tmux import list_tmux_sessions_local, create_local_terminal_in_tmux
from app.models.machine import Machine
from app.schemas.machine import (
    MachineCreate,
    MachineResponse,
    MachineUpdate,
    TestConnectionRequest,
    TestConnectionResponse,
    TmuxCreateResponse,
    TmuxSessionItem,
    TmuxSessionsResponse,
)
from app.services.auth import get_current_user
from app.services.crypto import decrypt_value, encrypt_value
from app.services.machine_registry import is_local_machine, get_connection_for_machine
from app.ssh.manager import ssh_manager
from app.ssh.tmux import create_terminal_in_tmux, list_tmux_sessions

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/machines", tags=["machines"])


def _get_passphrase(machine: Machine) -> str | None:
    """Decrypt the stored SSH key passphrase, or return None."""
    if machine.ssh_key_passphrase:
        return decrypt_value(machine.ssh_key_passphrase)
    return None


def _machine_to_response(machine: Machine) -> MachineResponse:
    """Convert a Machine ORM instance to a MachineResponse with live status."""
    return MachineResponse(
        id=str(machine.id),
        name=machine.name,
        host=machine.host,
        port=machine.port,
        username=machine.username,
        ssh_key_path=machine.ssh_key_path,
        repo_scan_paths=machine.repo_scan_paths or [],
        status=ssh_manager.get_status(str(machine.id)),
    )


def _local_machine_response() -> MachineResponse:
    """Build a synthetic MachineResponse for the local machine."""
    return MachineResponse(
        id=LOCAL_MACHINE_ID,
        name=LOCAL_MACHINE_NAME,
        host="localhost",
        port=0,
        username="",
        ssh_key_path="",
        repo_scan_paths=settings.local_repo_scan_paths,
        status=local_machine_manager.get_status(),
    )


@router.get("", response_model=list[MachineResponse])
async def list_machines(
    _user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[MachineResponse]:
    """List all configured machines with their current SSH status.

    The local machine ("This Machine") is always the first entry.
    """
    result = await db.execute(select(Machine))
    machines = result.scalars().all()
    return [_local_machine_response()] + [_machine_to_response(m) for m in machines]


@router.post("", response_model=MachineResponse, status_code=status.HTTP_201_CREATED)
async def create_machine(
    body: MachineCreate,
    _user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> MachineResponse:
    """Create a new machine and optionally auto-connect via SSH."""
    machine = Machine(
        name=body.name,
        host=body.host,
        port=body.port,
        username=body.username,
        ssh_key_path=body.ssh_key_path,
        ssh_key_passphrase=encrypt_value(body.ssh_key_passphrase) if body.ssh_key_passphrase else None,
        repo_scan_paths=body.repo_scan_paths,
    )
    db.add(machine)
    await db.flush()

    # Attempt auto-connect (non-blocking failure)
    try:
        await ssh_manager.connect(
            machine_id=str(machine.id),
            host=machine.host,
            port=machine.port,
            username=machine.username,
            ssh_key_path=machine.ssh_key_path,
            ssh_key_passphrase=_get_passphrase(machine),
        )
    except Exception as exc:
        logger.warning("Auto-connect failed for machine %s: %s", machine.name, exc)

    return _machine_to_response(machine)


@router.get("/{machine_id}", response_model=MachineResponse)
async def get_machine(
    machine_id: str,
    _user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> MachineResponse:
    """Get a single machine by ID with its current SSH status."""
    if is_local_machine(machine_id):
        return _local_machine_response()

    machine = await db.get(Machine, UUID(machine_id))
    if machine is None:
        raise HTTPException(status_code=404, detail="Machine not found")
    return _machine_to_response(machine)


@router.put("/{machine_id}", response_model=MachineResponse)
async def update_machine(
    machine_id: UUID,
    body: MachineUpdate,
    _user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> MachineResponse:
    """Update a machine. Reconnects SSH if connection params changed."""
    machine = await db.get(Machine, machine_id)
    if machine is None:
        raise HTTPException(status_code=404, detail="Machine not found")

    connection_changed = False
    update_data = body.model_dump(exclude_unset=True)

    for field, value in update_data.items():
        if field in ("host", "port", "username", "ssh_key_path", "ssh_key_passphrase"):
            if field == "ssh_key_passphrase":
                value = encrypt_value(value) if value else None
            if getattr(machine, field) != value:
                connection_changed = True
        setattr(machine, field, value)

    await db.flush()

    # Reconnect if connection parameters changed
    if connection_changed:
        try:
            await ssh_manager.disconnect(str(machine.id))
            await ssh_manager.connect(
                machine_id=str(machine.id),
                host=machine.host,
                port=machine.port,
                username=machine.username,
                ssh_key_path=machine.ssh_key_path,
                ssh_key_passphrase=_get_passphrase(machine),
            )
        except Exception as exc:
            logger.warning("Reconnect after update failed for machine %s: %s", machine.name, exc)

    return _machine_to_response(machine)


@router.delete("/{machine_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_machine(
    machine_id: UUID,
    _user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    """Disconnect SSH and delete a machine."""
    machine = await db.get(Machine, machine_id)
    if machine is None:
        raise HTTPException(status_code=404, detail="Machine not found")

    await ssh_manager.disconnect(str(machine.id))
    await db.delete(machine)
    await db.flush()


@router.post("/test-connection", response_model=TestConnectionResponse)
async def test_connection(
    body: TestConnectionRequest,
    _user: dict = Depends(get_current_user),
) -> TestConnectionResponse:
    """Test an SSH connection before saving a machine.

    Connects with a 10-second timeout, lists tmux sessions on success.
    """
    try:
        if body.ssh_key_passphrase:
            client_keys = [asyncssh.read_private_key(body.ssh_key_path, passphrase=body.ssh_key_passphrase)]
        else:
            client_keys = [body.ssh_key_path]
        conn = await asyncssh.connect(
            body.host,
            port=body.port,
            username=body.username,
            client_keys=client_keys,
            known_hosts=None,
            login_timeout=10,
        )
        try:
            sessions = await list_tmux_sessions(conn)
            return TestConnectionResponse(
                success=True,
                message="Connected successfully.",
                tmux_sessions=sessions,
            )
        finally:
            conn.close()
    except Exception as exc:
        return TestConnectionResponse(
            success=False,
            message=f"Connection test failed: {exc}",
        )


@router.post("/{machine_id}/connect", response_model=MachineResponse)
async def connect_machine(
    machine_id: UUID,
    _user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> MachineResponse:
    """Connect to a saved machine via SSH."""
    machine = await db.get(Machine, machine_id)
    if machine is None:
        raise HTTPException(status_code=404, detail="Machine not found")

    try:
        await ssh_manager.connect(
            machine_id=str(machine.id),
            host=machine.host,
            port=machine.port,
            username=machine.username,
            ssh_key_path=machine.ssh_key_path,
            ssh_key_passphrase=_get_passphrase(machine),
        )
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"SSH connection failed: {exc}",
        )

    return _machine_to_response(machine)


@router.post("/{machine_id}/disconnect", response_model=MachineResponse)
async def disconnect_machine(
    machine_id: UUID,
    _user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> MachineResponse:
    """Disconnect SSH from a machine."""
    machine = await db.get(Machine, machine_id)
    if machine is None:
        raise HTTPException(status_code=404, detail="Machine not found")

    await ssh_manager.disconnect(str(machine.id))
    return _machine_to_response(machine)


@router.get("/{machine_id}/repos", response_model=list[str])
async def scan_repos(
    machine_id: str,
    _user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[str]:
    """Scan configured paths on a machine for git repositories.

    Uses `find` on the machine to discover .git directories
    within repo_scan_paths, up to 2 levels deep.
    """
    if is_local_machine(machine_id):
        if not local_machine_manager.is_usable:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Local machine is not available. Configure SSH to the host or install the Locus Host Agent.",
            )
        from app.config import get_local_scan_paths_from_db

        db_paths = await get_local_scan_paths_from_db()
        scan_paths = db_paths if db_paths is not None else settings.local_repo_scan_paths
        if not scan_paths:
            return []
        repos: list[str] = []
        for scan_path in scan_paths:
            try:
                output = await local_machine_manager.run_command(
                    f"find {scan_path} -maxdepth 2 -name .git -type d 2>/dev/null"
                )
                for line in output.strip().split("\n"):
                    if line:
                        repo_path = line.rstrip("/")
                        if repo_path.endswith("/.git"):
                            repo_path = repo_path[:-5]
                        repos.append(repo_path)
            except Exception as exc:
                logger.warning("Local repo scan failed for path %s: %s", scan_path, exc)
        return repos

    machine = await db.get(Machine, UUID(machine_id))
    if machine is None:
        raise HTTPException(status_code=404, detail="Machine not found")

    conn = await ssh_manager.get_connection(str(machine.id))
    if conn is None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Machine is not connected",
        )

    if not machine.repo_scan_paths:
        return []

    repos = []
    for scan_path in machine.repo_scan_paths:
        try:
            result = await conn.run(
                f"find {scan_path} -maxdepth 2 -name .git -type d 2>/dev/null",
                check=False,
            )
            if result.stdout:
                for line in result.stdout.strip().split("\n"):
                    if line:
                        repo_path = line.rstrip("/")
                        if repo_path.endswith("/.git"):
                            repo_path = repo_path[:-5]
                        repos.append(repo_path)
        except Exception as exc:
            logger.warning("Repo scan failed for path %s: %s", scan_path, exc)

    return repos


@router.get("/{machine_id}/tmux-sessions", response_model=TmuxSessionsResponse)
async def get_tmux_sessions(
    machine_id: str,
    _user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> TmuxSessionsResponse:
    """List tmux sessions on a machine (local or remote)."""
    if is_local_machine(machine_id):
        if not local_machine_manager.is_usable:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Local machine is not available. Configure SSH to the host or install the Locus Host Agent.",
            )
        conn = await local_machine_manager.get_connection()
        if conn is not None:
            # Docker mode: use SSH-based listing
            raw_sessions = await list_tmux_sessions(conn)
        else:
            # Native mode: use subprocess-based listing
            raw_sessions = await list_tmux_sessions_local()
        sessions = [
            TmuxSessionItem(
                name=str(s["name"]),
                attached=bool(s["attached"]),
                last_activity=str(s["last_activity"]),
            )
            for s in raw_sessions
        ]
        return TmuxSessionsResponse(sessions=sessions)

    machine = await db.get(Machine, UUID(machine_id))
    if machine is None:
        raise HTTPException(status_code=404, detail="Machine not found")

    conn = await ssh_manager.get_connection(str(machine.id))
    if conn is None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Machine is not connected",
        )

    raw_sessions = await list_tmux_sessions(conn)
    sessions = [
        TmuxSessionItem(
            name=str(s["name"]),
            attached=bool(s["attached"]),
            last_activity=str(s["last_activity"]),
        )
        for s in raw_sessions
    ]
    return TmuxSessionsResponse(sessions=sessions)


@router.post("/{machine_id}/tmux-sessions", response_model=TmuxCreateResponse)
async def create_tmux_session(
    machine_id: str,
    _user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> TmuxCreateResponse:
    """Create a new tmux session on a machine (local or remote)."""
    if is_local_machine(machine_id):
        if not local_machine_manager.is_usable:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Local machine is not available. Configure SSH to the host or install the Locus Host Agent.",
            )
        conn = await local_machine_manager.get_connection()
        if conn is not None:
            # Docker mode: use SSH-based creation
            process, session_name = await create_terminal_in_tmux(conn)
        else:
            # Native mode: use subprocess-based creation
            process, session_name = await create_local_terminal_in_tmux()
        process.close()
        return TmuxCreateResponse(session_name=session_name)

    machine = await db.get(Machine, UUID(machine_id))
    if machine is None:
        raise HTTPException(status_code=404, detail="Machine not found")

    conn = await ssh_manager.get_connection(str(machine.id))
    if conn is None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Machine is not connected",
        )

    process, session_name = await create_terminal_in_tmux(conn)
    process.close()
    return TmuxCreateResponse(session_name=session_name)
