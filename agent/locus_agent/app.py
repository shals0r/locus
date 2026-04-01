"""FastAPI application factory for the Locus host agent.

Creates the FastAPI app with all routers registered and lifespan
handling for startup/shutdown.
"""

from __future__ import annotations

import logging
import platform
import sys
from contextlib import asynccontextmanager
from typing import AsyncIterator

from fastapi import FastAPI

logger = logging.getLogger(__name__)

__version__ = "0.1.0"


@asynccontextmanager
async def _lifespan(app: FastAPI) -> AsyncIterator[None]:
    """Application lifespan: startup and shutdown hooks."""
    # --- Startup ---
    _install_log_handler()
    logger.info(
        "Locus agent v%s starting on %s (%s)",
        __version__,
        platform.node(),
        sys.platform,
    )
    yield
    # --- Shutdown ---
    try:
        from locus_agent.terminal.session_pool import session_pool
        await session_pool.close_all()
    except ImportError:
        pass  # terminal module may not be installed yet
    logger.info("Locus agent shutting down")


def _install_log_handler() -> None:
    """Configure root logging for the agent."""
    from locus_agent.config import settings

    level = getattr(logging, settings.log_level.upper(), logging.INFO)
    logging.basicConfig(
        level=level,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )


def create_app() -> FastAPI:
    """Create and configure the FastAPI application with all routers."""
    app = FastAPI(
        title="Locus Host Agent",
        version=__version__,
        lifespan=_lifespan,
    )

    # --- REST API routers ---
    from locus_agent.api.health import router as health_router
    app.include_router(health_router)

    from locus_agent.api.tmux import router as tmux_router
    app.include_router(tmux_router)

    from locus_agent.api.claude import router as claude_router
    app.include_router(claude_router)

    # --- WebSocket routers ---
    try:
        from locus_agent.ws.terminal import router as ws_terminal_router
        app.include_router(ws_terminal_router)
    except ImportError:
        logger.debug("ws.terminal router not available")

    try:
        from locus_agent.ws.logs import router as ws_logs_router
        app.include_router(ws_logs_router)
    except ImportError:
        logger.debug("ws.logs router not available")

    return app
