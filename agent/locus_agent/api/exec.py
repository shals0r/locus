"""POST /exec endpoint: run commands on the host machine.

Used by the Locus backend to execute arbitrary commands on the host
without SSH, routed through the agent's REST API.
"""

from __future__ import annotations

import asyncio
import logging

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from locus_agent.auth import verify_token

logger = logging.getLogger("locus_agent")

router = APIRouter(dependencies=[Depends(verify_token)])


class ExecRequest(BaseModel):
    command: str
    timeout: float = 30.0  # seconds


class ExecResponse(BaseModel):
    stdout: str
    stderr: str
    returncode: int


@router.post("/exec", response_model=ExecResponse)
async def exec_command(body: ExecRequest) -> ExecResponse:
    """Execute a shell command on the host and return stdout/stderr/returncode."""
    try:
        proc = await asyncio.create_subprocess_shell(
            body.command,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout_bytes, stderr_bytes = await asyncio.wait_for(
            proc.communicate(), timeout=body.timeout
        )
        return ExecResponse(
            stdout=stdout_bytes.decode(errors="replace"),
            stderr=stderr_bytes.decode(errors="replace"),
            returncode=proc.returncode or 0,
        )
    except asyncio.TimeoutError:
        logger.warning("EXEC: Command timed out after %.1fs: %s", body.timeout, body.command[:100])
        return ExecResponse(
            stdout="",
            stderr=f"Command timed out after {body.timeout}s",
            returncode=-1,
        )
    except Exception as exc:
        logger.error("EXEC: Command failed: %s", exc)
        return ExecResponse(
            stdout="",
            stderr=str(exc),
            returncode=-1,
        )
