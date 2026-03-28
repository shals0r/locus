"""File operations REST API endpoints.

Provides CRUD endpoints for file operations on any machine
(local or remote). All operations route through file_service
which uses CLI commands via machine_registry.
"""

import logging

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from uuid import UUID

from app.database import get_db
from app.models.machine import Machine
from app.schemas.files import (
    DirectoryEntry,
    DirectoryListing,
    FileContent,
    FileCreateRequest,
    FileDeleteRequest,
    FileRenameRequest,
    FileStatResponse,
    FileWriteRequest,
)
from app.services.auth import get_current_user
from app.services.file_service import (
    create_file,
    delete_file,
    detect_language,
    file_stat,
    list_directory,
    read_file,
    rename_file,
    write_file,
)
from app.services.machine_registry import is_local_machine

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/files", tags=["files"])


async def _validate_machine(machine_id: str, db: AsyncSession) -> None:
    """Validate that a machine_id refers to a valid machine.

    For "local", no DB check needed. For UUIDs, verify existence.
    """
    if is_local_machine(machine_id):
        return
    try:
        machine_uuid = UUID(machine_id)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Invalid machine_id: {machine_id}")
    machine = await db.get(Machine, machine_uuid)
    if machine is None:
        raise HTTPException(status_code=404, detail="Machine not found")


@router.get("/read", response_model=FileContent)
async def read_file_endpoint(
    machine_id: str = Query(...),
    file_path: str = Query(...),
    _user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> FileContent:
    """Read file content with detected language and metadata."""
    await _validate_machine(machine_id, db)
    try:
        content = await read_file(machine_id, file_path)
        stat_info = await file_stat(machine_id, file_path)
        language = detect_language(file_path)
        return FileContent(
            content=content,
            language=language,
            size=stat_info["size"],
            mtime=stat_info["mtime"],
        )
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except ValueError as exc:
        # File too large
        raise HTTPException(status_code=413, detail=str(exc))
    except ConnectionError as exc:
        raise HTTPException(status_code=502, detail=f"SSH error: {exc}")
    except Exception as exc:
        logger.error("File read failed: %s", exc)
        raise HTTPException(status_code=500, detail=f"File read failed: {exc}")


@router.post("/write")
async def write_file_endpoint(
    body: FileWriteRequest,
    _user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Write content to a file."""
    await _validate_machine(body.machine_id, db)
    try:
        await write_file(body.machine_id, body.file_path, body.content)
        return {"success": True}
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=f"Permission denied: {exc}")
    except ConnectionError as exc:
        raise HTTPException(status_code=502, detail=f"SSH error: {exc}")
    except Exception as exc:
        logger.error("File write failed: %s", exc)
        raise HTTPException(status_code=500, detail=f"File write failed: {exc}")


@router.get("/list", response_model=DirectoryListing)
async def list_directory_endpoint(
    machine_id: str = Query(...),
    dir_path: str = Query(...),
    _user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> DirectoryListing:
    """List directory contents with type info."""
    await _validate_machine(machine_id, db)
    try:
        entries = await list_directory(machine_id, dir_path)
        return DirectoryListing(
            path=dir_path,
            entries=[DirectoryEntry(**e) for e in entries],
        )
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except ConnectionError as exc:
        raise HTTPException(status_code=502, detail=f"SSH error: {exc}")
    except Exception as exc:
        logger.error("Directory listing failed: %s", exc)
        raise HTTPException(status_code=500, detail=f"Directory listing failed: {exc}")


@router.post("/create")
async def create_file_endpoint(
    body: FileCreateRequest,
    _user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Create a new file with optional content."""
    await _validate_machine(body.machine_id, db)
    try:
        await create_file(body.machine_id, body.file_path, body.content)
        return {"success": True, "path": body.file_path}
    except ConnectionError as exc:
        raise HTTPException(status_code=502, detail=f"SSH error: {exc}")
    except Exception as exc:
        logger.error("File create failed: %s", exc)
        raise HTTPException(status_code=500, detail=f"File create failed: {exc}")


@router.post("/rename")
async def rename_file_endpoint(
    body: FileRenameRequest,
    _user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Rename or move a file."""
    await _validate_machine(body.machine_id, db)
    try:
        await rename_file(body.machine_id, body.old_path, body.new_path)
        return {"success": True}
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except ConnectionError as exc:
        raise HTTPException(status_code=502, detail=f"SSH error: {exc}")
    except Exception as exc:
        logger.error("File rename failed: %s", exc)
        raise HTTPException(status_code=500, detail=f"File rename failed: {exc}")


@router.delete("/delete")
async def delete_file_endpoint(
    machine_id: str = Query(...),
    file_path: str = Query(...),
    _user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Delete a file."""
    await _validate_machine(machine_id, db)
    try:
        await delete_file(machine_id, file_path)
        return {"success": True}
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except ConnectionError as exc:
        raise HTTPException(status_code=502, detail=f"SSH error: {exc}")
    except Exception as exc:
        logger.error("File delete failed: %s", exc)
        raise HTTPException(status_code=500, detail=f"File delete failed: {exc}")


@router.get("/stat", response_model=FileStatResponse)
async def stat_file_endpoint(
    machine_id: str = Query(...),
    file_path: str = Query(...),
    _user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> FileStatResponse:
    """Get file size and modification time for change detection polling."""
    await _validate_machine(machine_id, db)
    try:
        stat_info = await file_stat(machine_id, file_path)
        return FileStatResponse(**stat_info)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except ConnectionError as exc:
        raise HTTPException(status_code=502, detail=f"SSH error: {exc}")
    except Exception as exc:
        logger.error("File stat failed: %s", exc)
        raise HTTPException(status_code=500, detail=f"File stat failed: {exc}")
