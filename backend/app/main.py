import logging
import os
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.api.auth import router as auth_router
from app.api.feed import router as feed_router
from app.api.git import router as git_router
from app.api.gsd_events import router as gsd_events_router
from app.api.machines import router as machines_router
from app.api.review import router as review_router
from app.api.search import router as search_router
from app.api.sessions import router as sessions_router
from app.api.settings import router as settings_router
from app.api.tasks import router as tasks_router
from app.api.upload import router as upload_router
from app.database import engine
from app.models import Base
from app.local.manager import local_machine_manager
from app.ssh.manager import ssh_manager
from app.ws.feed import router as feed_ws_router
from app.ws.terminal import router as terminal_ws_router
from app.ws.status import router as status_ws_router
from app.integrations.scheduler import start_polling, stop_polling

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan: create tables on startup, dispose engine on shutdown."""
    from sqlalchemy import select, text
    from app.database import async_session_factory
    from app.models.machine import Machine
    from app.services.crypto import decrypt_value

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    logger.info("Database tables created")

    # Migrate terminal_sessions.machine_id from UUID to VARCHAR if needed
    # This handles existing databases that still have the old FK constraint.
    # For fresh databases, create_all already creates the correct schema.
    async with engine.begin() as mig_conn:
        result = await mig_conn.execute(text(
            "SELECT data_type FROM information_schema.columns "
            "WHERE table_name = 'terminal_sessions' AND column_name = 'machine_id'"
        ))
        row = result.first()
        if row and row[0] == "uuid":
            logger.info("Migrating terminal_sessions.machine_id from UUID to VARCHAR(255)...")
            await mig_conn.execute(text(
                "ALTER TABLE terminal_sessions "
                "DROP CONSTRAINT IF EXISTS terminal_sessions_machine_id_fkey"
            ))
            await mig_conn.execute(text(
                "ALTER TABLE terminal_sessions "
                "ALTER COLUMN machine_id TYPE VARCHAR(255) USING machine_id::text"
            ))
            logger.info("Migration complete: terminal_sessions.machine_id is now VARCHAR(255)")

    # Initialize local machine connection
    await local_machine_manager.initialize()
    if local_machine_manager.in_docker:
        logger.info("Local machine: initialized (Docker mode: SSH to host)")
    else:
        logger.info("Local machine: initialized (native mode: subprocess)")

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

    # Start integration polling (APScheduler)
    await start_polling()

    yield

    # Shutdown integration polling
    await stop_polling()
    await local_machine_manager.shutdown()
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
app.include_router(feed_ws_router)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:8080"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


app.include_router(auth_router)
app.include_router(feed_router)
app.include_router(git_router)
app.include_router(gsd_events_router)
app.include_router(machines_router)
app.include_router(review_router)
app.include_router(search_router)
app.include_router(sessions_router)
app.include_router(settings_router)
app.include_router(tasks_router)
app.include_router(upload_router)


@app.get("/api/health")
async def health():
    """Health check endpoint."""
    return {"status": "ok"}


# Mount static files if directory exists (production build)
static_dir = Path("/app/static")
if static_dir.is_dir():
    app.mount("/", StaticFiles(directory=str(static_dir), html=True), name="static")
