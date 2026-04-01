from fastapi import HTTPException, Request, WebSocket, status

from locus_agent.config import settings


async def verify_token(request: Request) -> None:
    """Verify Bearer token from Authorization header.

    Raises HTTPException 401 if token is missing or invalid.
    """
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing or invalid Authorization header",
        )
    token = auth_header[7:]  # Strip "Bearer "
    if token != settings.token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token",
        )


async def verify_ws_token(websocket: WebSocket) -> bool:
    """Verify token from WebSocket query parameter.

    Returns True if valid, False otherwise.
    """
    token = websocket.query_params.get("token", "")
    return token == settings.token
