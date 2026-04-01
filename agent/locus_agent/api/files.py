"""File operations REST API on the agent.

Provides read, write, list, stat, and search endpoints for local
filesystem operations, eliminating SSH exec overhead for file ops.
"""

from __future__ import annotations

import base64
import logging
import os
import asyncio
import shutil
import stat as stat_module

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel

from locus_agent.auth import verify_token

logger = logging.getLogger("locus_agent")

router = APIRouter(dependencies=[Depends(verify_token)], tags=["files"])

# Maximum file size for reads (10 MB)
MAX_FILE_SIZE = 10 * 1024 * 1024


# -- Request/Response models --

class WriteRequest(BaseModel):
    path: str
    content: str
    encoding: str = "utf-8"


class SearchRequest(BaseModel):
    path: str
    pattern: str
    glob: str | None = None
    max_results: int = 100


# -- Endpoints --

@router.get("/files/read")
async def read_file(path: str = Query(...)):
    """Read a file from the filesystem.

    Returns content as utf-8 text or base64 for binary files.
    Max file size: 10 MB.
    """
    if not os.path.exists(path):
        raise HTTPException(status_code=404, detail=f"File not found: {path}")

    if not os.path.isfile(path):
        raise HTTPException(status_code=400, detail=f"Not a file: {path}")

    file_size = os.path.getsize(path)
    if file_size > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"File too large: {file_size} bytes (max {MAX_FILE_SIZE})",
        )

    try:
        with open(path, "rb") as f:
            raw = f.read()
    except PermissionError:
        raise HTTPException(status_code=403, detail=f"Permission denied: {path}")

    # Try UTF-8 decoding; fall back to base64 for binary
    try:
        content = raw.decode("utf-8")
        encoding = "utf-8"
    except UnicodeDecodeError:
        content = base64.b64encode(raw).decode("ascii")
        encoding = "base64"

    return {
        "path": path,
        "content": content,
        "size": file_size,
        "encoding": encoding,
    }


@router.post("/files/write")
async def write_file(body: WriteRequest):
    """Write content to a file. Creates parent directories if needed."""
    parent = os.path.dirname(body.path)
    if parent:
        os.makedirs(parent, exist_ok=True)

    try:
        if body.encoding == "base64":
            data = base64.b64decode(body.content)
        else:
            data = body.content.encode(body.encoding)

        with open(body.path, "wb") as f:
            f.write(data)
    except PermissionError:
        raise HTTPException(status_code=403, detail=f"Permission denied: {body.path}")
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Write failed: {exc}")

    return {
        "path": body.path,
        "size": os.path.getsize(body.path),
        "written": True,
    }


@router.get("/files/list")
async def list_directory(
    path: str = Query(...),
    recursive: bool = Query(False),
):
    """List directory entries with type and metadata."""
    if not os.path.exists(path):
        raise HTTPException(status_code=404, detail=f"Path not found: {path}")

    if not os.path.isdir(path):
        raise HTTPException(status_code=400, detail=f"Not a directory: {path}")

    entries = []
    try:
        if recursive:
            for dirpath, dirnames, filenames in os.walk(path):
                for d in dirnames:
                    full = os.path.join(dirpath, d)
                    try:
                        st = os.stat(full)
                        entries.append({
                            "name": os.path.relpath(full, path),
                            "type": "dir",
                            "size": 0,
                            "modified": st.st_mtime,
                        })
                    except OSError:
                        pass
                for fn in filenames:
                    full = os.path.join(dirpath, fn)
                    try:
                        st = os.lstat(full)
                        entry_type = "symlink" if stat_module.S_ISLNK(st.st_mode) else "file"
                        entries.append({
                            "name": os.path.relpath(full, path),
                            "type": entry_type,
                            "size": st.st_size,
                            "modified": st.st_mtime,
                        })
                    except OSError:
                        pass
        else:
            with os.scandir(path) as it:
                for entry in it:
                    try:
                        st = entry.stat(follow_symlinks=False)
                        if entry.is_symlink():
                            entry_type = "symlink"
                        elif entry.is_dir():
                            entry_type = "dir"
                        else:
                            entry_type = "file"
                        entries.append({
                            "name": entry.name,
                            "type": entry_type,
                            "size": st.st_size if entry_type != "dir" else 0,
                            "modified": st.st_mtime,
                        })
                    except OSError:
                        pass
    except PermissionError:
        raise HTTPException(status_code=403, detail=f"Permission denied: {path}")

    return {"path": path, "entries": entries}


@router.get("/files/stat")
async def stat_file(path: str = Query(...)):
    """Stat a file or directory."""
    if not os.path.exists(path) and not os.path.islink(path):
        return {
            "path": path,
            "exists": False,
            "type": None,
            "size": 0,
            "modified": 0.0,
            "permissions": "",
        }

    try:
        st = os.lstat(path)
    except OSError as exc:
        raise HTTPException(status_code=500, detail=f"Stat failed: {exc}")

    if stat_module.S_ISLNK(st.st_mode):
        ftype = "symlink"
    elif stat_module.S_ISDIR(st.st_mode):
        ftype = "dir"
    else:
        ftype = "file"

    return {
        "path": path,
        "exists": True,
        "type": ftype,
        "size": st.st_size,
        "modified": st.st_mtime,
        "permissions": oct(st.st_mode)[-3:],
    }


@router.post("/files/search")
async def search_files(body: SearchRequest):
    """Search for patterns in files using ripgrep (rg) or grep fallback."""
    if not os.path.exists(body.path):
        raise HTTPException(status_code=404, detail=f"Path not found: {body.path}")

    matches = []

    # Try ripgrep first
    rg_path = shutil.which("rg")
    if rg_path:
        cmd = [rg_path, "--json", "-m", str(body.max_results)]
        if body.glob:
            cmd.extend(["--glob", body.glob])
        cmd.extend([body.pattern, body.path])

        try:
            proc = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            stdout, _ = await asyncio.wait_for(proc.communicate(), timeout=30.0)

            import json
            for line in stdout.decode(errors="replace").split("\n"):
                if not line.strip():
                    continue
                try:
                    obj = json.loads(line)
                    if obj.get("type") == "match":
                        data = obj["data"]
                        matches.append({
                            "path": data["path"]["text"],
                            "line": data["line_number"],
                            "text": data["lines"]["text"].rstrip("\n"),
                        })
                except (json.JSONDecodeError, KeyError):
                    continue
        except asyncio.TimeoutError:
            logger.warning("Search timed out for pattern=%s path=%s", body.pattern, body.path)
        except Exception as exc:
            logger.warning("ripgrep failed, falling back to grep: %s", exc)
            rg_path = None  # Fall through to grep

    # Grep fallback
    if not rg_path:
        grep_path = shutil.which("grep")
        if not grep_path:
            raise HTTPException(status_code=503, detail="Neither rg nor grep found")

        cmd = [grep_path, "-rn", "--max-count", str(body.max_results)]
        if body.glob:
            cmd.extend(["--include", body.glob])
        cmd.extend([body.pattern, body.path])

        try:
            proc = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            stdout, _ = await asyncio.wait_for(proc.communicate(), timeout=30.0)

            for line in stdout.decode(errors="replace").split("\n"):
                if not line.strip():
                    continue
                # Format: file:line:text
                parts = line.split(":", 2)
                if len(parts) >= 3:
                    matches.append({
                        "path": parts[0],
                        "line": int(parts[1]) if parts[1].isdigit() else 0,
                        "text": parts[2],
                    })
        except asyncio.TimeoutError:
            logger.warning("grep search timed out for pattern=%s", body.pattern)
        except Exception as exc:
            logger.warning("grep search failed: %s", exc)

    return {"matches": matches}
