"""Image upload API — pushes files to remote machines via SSH."""

from __future__ import annotations

import asyncio
import logging
import time

import asyncssh
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile

from app.services.auth import get_current_user
from app.ssh.manager import ssh_manager

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["upload"])

# Serialize uploads so we never stack SSH exec channels.
_upload_semaphore = asyncio.Semaphore(1)

REMOTE_DIR = "/tmp/locus-images"


@router.post("/upload-image")
async def upload_image(
    machine_id: str = Form(...),
    file: UploadFile = File(...),
    _user: dict = Depends(get_current_user),
) -> dict:
    """Upload an image to a remote machine's filesystem.

    The file is pushed via a short-lived SSH exec channel (`cat > path`)
    with raw bytes piped to stdin.  Returns the remote file path so the
    frontend can paste it into the terminal for Claude Code to reference.
    """
    raw_bytes = await file.read()
    if not raw_bytes:
        raise HTTPException(status_code=400, detail="Empty file")

    ext = (file.filename or "image.png").rsplit(".", 1)[-1] or "png"
    filename = f"paste-{int(time.time() * 1000)}.{ext}"
    remote_path = f"{REMOTE_DIR}/{filename}"

    async with _upload_semaphore:
        conn = await ssh_manager.get_connection(machine_id)
        if conn is None:
            raise HTTPException(status_code=502, detail="Machine not connected")

        try:
            await asyncio.wait_for(
                conn.run(
                    f"mkdir -p {REMOTE_DIR} && cat > {remote_path}",
                    input=raw_bytes,
                    check=True,
                    encoding=None,
                ),
                timeout=30.0,
            )
        except asyncio.TimeoutError:
            raise HTTPException(status_code=504, detail="Upload timed out")
        except asyncssh.ProcessError as exc:
            logger.warning("Upload command failed: %s", exc.stderr)
            raise HTTPException(status_code=502, detail="Upload command failed")
        except (asyncssh.ConnectionLost, asyncssh.DisconnectError):
            raise HTTPException(status_code=502, detail="SSH connection lost during upload")

    logger.info("IMAGE: Uploaded %d bytes -> %s", len(raw_bytes), remote_path)
    return {"remote_path": remote_path}
