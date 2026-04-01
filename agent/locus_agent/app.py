"""FastAPI application factory for the Locus Agent."""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI

from locus_agent import __version__
from locus_agent.terminal.session_pool import session_pool
from locus_agent.ws.logs import install_log_handler

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan: startup and shutdown hooks."""
    # Startup
    install_log_handler()
    logger.info("Locus Agent v%s starting", __version__)
    yield
    # Shutdown
    logger.info("Locus Agent shutting down, closing all sessions")
    await session_pool.close_all()


def create_app() -> FastAPI:
    """Create and configure the FastAPI application."""
    app = FastAPI(
        title="Locus Agent",
        version=__version__,
        lifespan=lifespan,
    )

    # Health endpoint (no auth)
    from locus_agent.api.health import router as health_router
    app.include_router(health_router)

    # Terminal REST endpoints (auth required)
    from locus_agent.api.terminal import router as terminal_router
    app.include_router(terminal_router)

    # WebSocket: terminal I/O
    from locus_agent.ws.terminal import router as ws_terminal_router
    app.include_router(ws_terminal_router)

    # WebSocket: log streaming
    from locus_agent.ws.logs import router as ws_logs_router
    app.include_router(ws_logs_router)

    return app
