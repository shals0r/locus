"""File operations REST API endpoints.

Provides CRUD endpoints for file operations on any machine
(local or remote) and cross-file text search within repositories.
All operations route through file_service / machine_registry
for local/remote support.
"""

import logging
import re
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
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
from app.services.machine_registry import is_local_machine, run_command_on_machine

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
        mtime_iso = datetime.fromtimestamp(stat_info["mtime"], tz=timezone.utc).isoformat()
        return FileContent(
            content=content,
            language=language,
            size=stat_info["size"],
            mtime=mtime_iso,
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
    depth: int = Query(1, ge=1, le=15),
    _user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> DirectoryListing:
    """List directory contents with type info.

    Use depth > 1 to prefetch multiple levels in a single SSH call.
    The response still contains a flat list — the frontend groups by parent path.
    """
    await _validate_machine(machine_id, db)
    try:
        entries = await list_directory(machine_id, dir_path, depth)
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
        await create_file(body.machine_id, body.file_path, body.content, body.is_dir)
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
        mtime_iso = datetime.fromtimestamp(stat_info["mtime"], tz=timezone.utc).isoformat()
        return FileStatResponse(size=stat_info["size"], mtime=mtime_iso)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except ConnectionError as exc:
        raise HTTPException(status_code=502, detail=f"SSH error: {exc}")
    except Exception as exc:
        logger.error("File stat failed: %s", exc)
        raise HTTPException(status_code=500, detail=f"File stat failed: {exc}")


# ---------------------------------------------------------------------------
# Cross-file search
# ---------------------------------------------------------------------------

class FileMatch(BaseModel):
    line: int
    text: str


class FileSearchResult(BaseModel):
    file: str
    matches: list[FileMatch]


class FileSearchResponse(BaseModel):
    results: list[FileSearchResult]
    truncated: bool


@router.get("/search", response_model=FileSearchResponse)
async def search_files(
    machine_id: str = Query(..., description="Machine ID"),
    repo_path: str = Query(..., description="Absolute path to the repository"),
    query: str = Query(..., min_length=1, description="Search query text"),
    max_results: int = Query(50, ge=1, le=200, description="Max files to return"),
    case_sensitive: bool = Query(False, description="Case-sensitive search"),
    regex: bool = Query(False, description="Treat query as regex"),
    _user=Depends(get_current_user),
):
    """Search for text within files in a repository.

    Uses grep via machine_registry for local/remote support.
    Returns matching files with line numbers and context.
    """
    # Build grep command with appropriate flags
    exclude_dirs = [
        ".git", "node_modules", "__pycache__", ".venv", "venv",
        "dist", "build", ".next", ".nuxt", "coverage",
        ".mypy_cache", ".pytest_cache", ".tox", "egg-info",
    ]

    # Common source file extensions to search
    include_exts = [
        "py", "ts", "tsx", "js", "jsx", "json", "yaml", "yml",
        "toml", "cfg", "ini", "md", "txt", "html", "css", "scss",
        "sql", "sh", "bash", "rs", "go", "java", "rb", "php",
        "c", "cpp", "h", "hpp", "vue", "svelte",
    ]

    exclude_flags = " ".join(f"--exclude-dir={d}" for d in exclude_dirs)
    include_flags = " ".join(f"--include='*.{ext}'" for ext in include_exts)

    # Escape query for shell safety unless regex mode
    if regex:
        # For regex mode, use -E (extended regex) and pass pattern as-is
        search_pattern = query
        regex_flag = "-E"
    else:
        # For literal search, use -F (fixed string)
        search_pattern = query
        regex_flag = "-F"

    case_flag = "" if case_sensitive else "-i"

    # Use grep -rn to get file:line:text output
    # Limit to max_results files using head-like approach
    # Shell-escape the search pattern
    escaped_query = search_pattern.replace("'", "'\\''")
    cmd = (
        f"grep -rn {regex_flag} {case_flag} {exclude_flags} {include_flags} "
        f"-- '{escaped_query}' {repo_path} 2>/dev/null | head -500"
    )

    try:
        output = await run_command_on_machine(machine_id, cmd)
    except ConnectionError:
        raise HTTPException(status_code=503, detail="Machine not connected")
    except Exception as e:
        logger.warning("File search failed: %s", e)
        # grep returns exit code 1 when no matches found - treat as empty
        output = ""

    # Parse grep output: file:line:text
    results_map: dict[str, list[FileMatch]] = {}
    line_pattern = re.compile(r"^(.+?):(\d+):(.*)$")

    for raw_line in output.splitlines():
        m = line_pattern.match(raw_line)
        if not m:
            continue

        file_path = m.group(1)
        line_num = int(m.group(2))
        line_text = m.group(3).strip()

        # Make path relative to repo_path
        if file_path.startswith(repo_path):
            rel_path = file_path[len(repo_path):].lstrip("/").lstrip("\\")
        else:
            rel_path = file_path

        if rel_path not in results_map:
            if len(results_map) >= max_results:
                break
            results_map[rel_path] = []

        # Limit to 5 matches per file
        if len(results_map[rel_path]) < 5:
            results_map[rel_path].append(FileMatch(line=line_num, text=line_text))

    results = [
        FileSearchResult(file=fp, matches=matches)
        for fp, matches in results_map.items()
    ]

    return FileSearchResponse(
        results=results,
        truncated=len(results_map) >= max_results,
    )
