import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI

from locus_agent import __version__
from locus_agent.api.health import router as health_router

logger = logging.getLogger("locus_agent")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan: startup and shutdown logging."""
    logger.info("Locus Agent v%s starting", __version__)
    yield
    logger.info("Locus Agent shutting down")


def create_app() -> FastAPI:
    """Create and configure the FastAPI application."""
    app = FastAPI(
        title="Locus Agent",
        version=__version__,
        lifespan=lifespan,
    )
    app.include_router(health_router)
    return app
