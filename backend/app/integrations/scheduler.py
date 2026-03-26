"""APScheduler lifecycle management for integration polling.

Manages an AsyncIOScheduler that runs adapter poll jobs on
configurable intervals. Each enabled IntegrationSource gets
its own interval job that calls the appropriate adapter's execute().
"""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from sqlalchemy import select

from app.database import async_session_factory
from app.models.integration_source import IntegrationSource

if TYPE_CHECKING:
    from app.integrations.base_adapter import BasePollingAdapter

logger = logging.getLogger(__name__)

# Module-level scheduler instance
scheduler = AsyncIOScheduler()

# Default poll intervals per source type (seconds)
DEFAULT_INTERVALS: dict[str, int] = {
    "github": 300,     # 5 minutes
    "gitlab": 300,     # 5 minutes
    "jira": 300,       # 5 minutes
    "calendar": 600,   # 10 minutes
}


def get_adapter(source_type: str) -> BasePollingAdapter | None:
    """Look up adapter instance by source type.

    Returns None for unknown types. Adapters are imported lazily
    to avoid circular imports.
    """
    from app.integrations.github_adapter import GitHubAdapter
    from app.integrations.gitlab_adapter import GitLabAdapter
    from app.integrations.jira_adapter import JiraAdapter
    from app.integrations.calendar_adapter import GoogleCalendarAdapter

    _adapter_registry: dict[str, BasePollingAdapter] = {
        "github": GitHubAdapter(),
        "gitlab": GitLabAdapter(),
        "jira": JiraAdapter(),
        "calendar": GoogleCalendarAdapter(),
    }

    return _adapter_registry.get(source_type)


async def start_polling() -> None:
    """Start polling for all enabled integration sources.

    Queries the database for enabled IntegrationSources, creates
    an interval job for each with the appropriate adapter. Uses
    replace_existing=True so restarts don't duplicate jobs.
    """
    try:
        async with async_session_factory() as db:
            result = await db.execute(
                select(IntegrationSource).where(
                    IntegrationSource.is_enabled.is_(True)
                )
            )
            sources = result.scalars().all()

        started = []
        for source in sources:
            adapter = get_adapter(source.source_type)
            if adapter is None:
                logger.warning(
                    "No adapter registered for source type %r, skipping",
                    source.source_type,
                )
                continue

            interval = source.poll_interval_seconds or DEFAULT_INTERVALS.get(
                source.source_type, 300
            )

            job_id = f"poll_{source.source_type}_{source.id}"
            scheduler.add_job(
                adapter.execute,
                "interval",
                seconds=interval,
                args=[source],
                id=job_id,
                replace_existing=True,
                max_instances=1,
            )
            started.append(f"{source.source_type} (every {interval}s)")

        if started:
            scheduler.start()
            logger.info("Polling started for: %s", ", ".join(started))
        else:
            logger.info("No enabled integration sources found; polling not started")

    except Exception as exc:
        logger.error("Failed to start polling: %s", exc)


async def stop_polling() -> None:
    """Shut down the scheduler without waiting for running jobs."""
    try:
        if scheduler.running:
            scheduler.shutdown(wait=False)
            logger.info("Polling scheduler shut down")
    except Exception as exc:
        logger.warning("Error shutting down polling scheduler: %s", exc)
