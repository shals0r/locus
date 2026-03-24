import logging
import os
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.api.auth import router as auth_router
from app.api.machines import router as machines_router
from app.api.sessions import router as sessions_router
from app.api.settings import router as settings_router
from app.api.upload import router as upload_router
from app.database import engine
from app.models import Base
from app.ssh.manager import ssh_manager
from app.ws.terminal import router as terminal_ws_router
from app.ws.status import router as status_ws_router

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan: create tables on startup, dispose engine on shutdown."""
    from sqlalchemy import select
    from app.database import async_session_factory
    from app.models.machine import Machine
    from app.services.crypto import decrypt_value

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    logger.info("Database tables created")

    # Auto-reconnect SSH to all machines
    async with async_session_factory() as db:
        result = await db.execute(select(Machine))
        machines = result.scalars().all()
        for machine in machines:
            try:
                passphrase = decrypt_value(machine.ssh_key_passphrase) if machine.ssh_key_passphrase else None
                await ssh_manager.connect(
                    machine_id=str(machine.id),
                    host=machine.host,
                    port=machine.port,
                    username=machine.username,
                    ssh_key_path=machine.ssh_key_path,
                    ssh_key_passphrase=passphrase,
                )
                logger.info("Auto-connected to %s", machine.name)
            except Exception as exc:
                logger.warning("Auto-connect failed for %s: %s", machine.name, exc)

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
app.include_router(status_ws_router)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:8080"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


app.include_router(auth_router)
app.include_router(machines_router)
app.include_router(sessions_router)
app.include_router(settings_router)
app.include_router(upload_router)


@app.get("/api/health")
async def health():
    """Health check endpoint."""
    return {"status": "ok"}


# Mount static files if directory exists (production build)
static_dir = Path("/app/static")
if static_dir.is_dir():
    app.mount("/", StaticFiles(directory=str(static_dir), html=True), name="static")
