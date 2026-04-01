"""Health endpoint for the Locus Agent.

Returns version, uptime, and platform information.
No authentication required.
"""

from __future__ import annotations

import socket
import sys
import time

from fastapi import APIRouter

from locus_agent import __version__

router = APIRouter(tags=["health"])

_start_time = time.time()


@router.get("/health")
async def health() -> dict:
    """Health check endpoint (no auth required)."""
    return {
        "status": "ok",
        "version": __version__,
        "uptime_seconds": round(time.time() - _start_time, 1),
        "platform": sys.platform,
        "python_version": sys.version,
        "hostname": socket.gethostname(),
    }
