import logging
import os
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.api.ai_review import router as ai_review_router
from app.api.auth import router as auth_router
from app.api.skills import router as skills_router
from app.api.feed import router as feed_router
from app.api.files import router as files_router
from app.api.git import router as git_router
from app.api.integrator import router as integrator_router
from app.api.gsd_events import router as gsd_events_router
from app.api.machines import router as machines_router
from app.api.review import router as review_router
from app.api.search import router as search_router
from app.api.sessions import router as sessions_router
from app.api.settings import router as settings_router
from app.api.tasks import router as tasks_router
from app.api.ai_review import router as ai_review_router
from app.api.upload import router as upload_router
from app.api.workers import router as workers_router, get_supervisor
from app.database import engine
from app.models import Base
from app.local.manager import local_machine_manager
from app.ssh.manager import ssh_manager
from app.ws.feed import router as feed_ws_router
from app.ws.terminal import router as terminal_ws_router
from app.ws.status import router as status_ws_router
from app.ws.worker_logs import router as worker_logs_router
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

    # Migrate integration_sources for Phase 4: drop unique constraint on source_type,
    # add new worker management columns
    async with engine.begin() as mig_conn2:
        # Check if new columns exist yet
        col_check = await mig_conn2.execute(text(
            "SELECT column_name FROM information_schema.columns "
            "WHERE table_name = 'integration_sources' AND column_name = 'worker_status'"
        ))
        if not col_check.first():
            logger.info("Migrating integration_sources for Phase 4 worker management...")
            await mig_conn2.execute(text(
                "ALTER TABLE integration_sources "
                "DROP CONSTRAINT IF EXISTS integration_sources_source_type_key"
            ))
            await mig_conn2.execute(text(
                "ALTER TABLE integration_sources "
                "ADD COLUMN IF NOT EXISTS name VARCHAR(255) DEFAULT ''"
            ))
            await mig_conn2.execute(text(
                "ALTER TABLE integration_sources "
                "ADD COLUMN IF NOT EXISTS worker_script_path VARCHAR(500)"
            ))
            await mig_conn2.execute(text(
                "ALTER TABLE integration_sources "
                "ADD COLUMN IF NOT EXISTS worker_status VARCHAR(20) DEFAULT 'stopped'"
            ))
            await mig_conn2.execute(text(
                "ALTER TABLE integration_sources "
                "ADD COLUMN IF NOT EXISTS failure_count INTEGER DEFAULT 0"
            ))
            await mig_conn2.execute(text(
                "ALTER TABLE integration_sources "
                "ADD COLUMN IF NOT EXISTS total_items_ingested INTEGER DEFAULT 0"
            ))
            await mig_conn2.execute(text(
                "ALTER TABLE integration_sources "
                "ADD COLUMN IF NOT EXISTS worker_pid INTEGER"
            ))
            await mig_conn2.execute(text(
                "ALTER TABLE integration_sources "
                "ADD COLUMN IF NOT EXISTS is_builtin BOOLEAN DEFAULT FALSE"
            ))
            logger.info("Migration complete: integration_sources updated for Phase 4")

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

    # Auto-deploy agents to connected remote machines
    from app.agent.deployer import ensure_agent
    from app.services.machine_registry import register_agent_client
    for machine in machines:
        mid = str(machine.id)
        conn = await ssh_manager.get_connection(mid)
        if conn:
            try:
                base_url, token = await ensure_agent(conn, host=machine.host)
                await register_agent_client(mid, base_url, token)
                logger.info("Agent deployed to %s", machine.name)
            except Exception as exc:
                logger.info("Agent not available on %s (SSH fallback): %s", machine.name, exc)

    # Start integration polling (APScheduler -- legacy, kept for backward compat)
    await start_polling()

    # Start supervisor-managed workers (Phase 4 subprocess model)
    supervisor = get_supervisor()
    async with async_session_factory() as db:
        from app.models.integration_source import IntegrationSource as IS
        worker_result = await db.execute(
            select(IS).where(IS.is_enabled.is_(True), IS.worker_script_path.isnot(None))
        )
        enabled_workers = worker_result.scalars().all()
        for src in enabled_workers:
            try:
                env = await supervisor.build_worker_env(str(src.id))
                await supervisor.start_worker(
                    worker_id=str(src.id),
                    script_path=src.worker_script_path,
                    env=env,
                )
                logger.info("Auto-started worker: %s (%s)", src.name, src.source_type)
            except Exception as exc:
                logger.warning("Failed to auto-start worker %s: %s", src.name, exc)

    yield

    # Shutdown supervisor-managed workers
    await supervisor.shutdown()

    # Shutdown legacy polling
    await stop_polling()

    # Close remote agent clients
    from app.services.machine_registry import _remote_agent_clients
    for mid, client in list(_remote_agent_clients.items()):
        try:
            await client.close()
        except Exception:
            pass
    _remote_agent_clients.clear()

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
app.include_router(worker_logs_router)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:8080"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


app.include_router(ai_review_router)
app.include_router(auth_router)
app.include_router(feed_router)
app.include_router(files_router)
app.include_router(git_router)
app.include_router(gsd_events_router)
app.include_router(integrator_router)
app.include_router(machines_router)
app.include_router(review_router)
app.include_router(search_router)
app.include_router(sessions_router)
app.include_router(settings_router)
app.include_router(tasks_router)
app.include_router(upload_router)
app.include_router(skills_router)
app.include_router(workers_router)
app.include_router(files_router)


@app.get("/api/health")
async def health():
    """Health check endpoint."""
    return {"status": "ok"}


# Mount static files if directory exists (production build)
static_dir = Path("/app/static")
if static_dir.is_dir():
    app.mount("/", StaticFiles(directory=str(static_dir), html=True), name="static")
