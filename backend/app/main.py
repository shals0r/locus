import logging
import os
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.database import engine
from app.models import Base
from app.ssh.manager import ssh_manager
from app.ws.terminal import router as terminal_ws_router

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan: create tables on startup, dispose engine on shutdown."""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    logger.info("Database tables created")
    yield
    await ssh_manager.shutdown()
    await engine.dispose()


app = FastAPI(
    title="Locus",
    description="Control plane for repos, machines, Claude Code sessions, and work items",
    version="0.1.0",
    lifespan=lifespan,
)

app.include_router(terminal_ws_router)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:8080"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
async def health():
    """Health check endpoint."""
    return {"status": "ok"}


# Mount static files if directory exists (production build)
static_dir = Path("/app/static")
if static_dir.is_dir():
    app.mount("/", StaticFiles(directory=str(static_dir), html=True), name="static")
