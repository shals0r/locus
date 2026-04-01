"""Token-based authentication for the Locus Agent."""

from __future__ import annotations

from fastapi import HTTPException, Request, WebSocket

from locus_agent.config import settings


async def verify_token(request: Request) -> None:
    """Verify Bearer token in Authorization header.

    Raises HTTPException(401) if token is missing or invalid.
    """
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing authentication token")

    token = auth_header[7:]
    if token != settings.token:
        raise HTTPException(status_code=401, detail="Invalid authentication token")


async def verify_ws_token(websocket: WebSocket) -> bool:
    """Verify token from WebSocket query parameter.

    Returns True if valid, False otherwise.
    """
    token = websocket.query_params.get("token", "")
    return token == settings.token
