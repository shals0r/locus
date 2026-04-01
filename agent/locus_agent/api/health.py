import socket
import sys
import time

from fastapi import APIRouter

from locus_agent import __version__

router = APIRouter(tags=["health"])

_start_time = time.monotonic()


@router.get("/health")
async def health():
    """Health check endpoint. No authentication required."""
    return {
        "status": "ok",
        "version": __version__,
        "uptime_seconds": round(time.monotonic() - _start_time, 2),
        "platform": sys.platform,
        "python_version": sys.version,
        "hostname": socket.gethostname(),
    }
