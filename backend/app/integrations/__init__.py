"""Integrations polling system.

Provides APScheduler-based polling for external sources
(GitHub, GitLab, Jira, Google Calendar) with adapter registry.
"""

from app.integrations.scheduler import start_polling, stop_polling, scheduler

__all__ = ["start_polling", "stop_polling", "scheduler"]
