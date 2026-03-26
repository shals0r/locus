"""Command palette search endpoint.

Powers the Ctrl+K command palette with cross-domain search across
repos, machines, feed items, tasks, and static actions.
"""

import logging

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.local.manager import LOCAL_MACHINE_ID, LOCAL_MACHINE_NAME, local_machine_manager
from app.models.feed_item import FeedItem
from app.models.machine import Machine
from app.models.task import Task
from app.schemas.command_palette import SearchResponse, SearchResult
from app.services.auth import get_current_user
from app.ssh.manager import ssh_manager

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/search", tags=["search"])

# Total result cap across all domains
MAX_RESULTS = 50

# Static actions available in the command palette
STATIC_ACTIONS: list[dict] = [
    {"title": "Toggle Sidebar", "action": "toggle_sidebar"},
    {"title": "Toggle Feed Panel", "action": "toggle_feed_panel"},
    {"title": "New Task", "action": "new_task"},
    {"title": "Promote to Task", "action": "promote_to_task"},
    {"title": "Open Settings", "action": "open_settings"},
    {"title": "Refresh Connections", "action": "refresh_connections"},
]


@router.get("", response_model=SearchResponse)
async def search(
    q: str = Query("", min_length=0, description="Search query"),
    _user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> SearchResponse:
    """Search across repos, machines, feed items, tasks, and actions.

    Returns grouped results ordered: repos, machines, feed items, tasks, actions.
    Limited to 50 total results.
    """
    if not q.strip():
        return SearchResponse(results=[])

    query = q.strip().lower()
    results: list[SearchResult] = []

    # --- 1. Repos: scan machines for matching repo names ---
    results.extend(await _search_repos(db, query))

    # --- 2. Machines: filter by name ---
    results.extend(await _search_machines(db, query))

    # --- 3. Feed Items: filter by title (not dismissed) ---
    results.extend(await _search_feed_items(db, query))

    # --- 4. Tasks: filter by title ---
    results.extend(await _search_tasks(db, query))

    # --- 5. Actions: static list filtered by query ---
    results.extend(_search_actions(query))

    # Cap total results
    return SearchResponse(results=results[:MAX_RESULTS])


async def _search_repos(db: AsyncSession, query: str) -> list[SearchResult]:
    """Search repos across all machines by repo name."""
    results: list[SearchResult] = []

    # Local machine repos
    local_paths = settings.local_repo_scan_paths
    for scan_path in local_paths:
        # Extract repo name from path (last component)
        repo_name = scan_path.rstrip("/").rsplit("/", 1)[-1] if "/" in scan_path else scan_path
        if query in repo_name.lower():
            results.append(SearchResult(
                id=f"repo-local-{scan_path}",
                type="repo",
                title=repo_name,
                subtitle=f"{LOCAL_MACHINE_NAME}",
                action_data={"machine_id": LOCAL_MACHINE_ID, "repo_path": scan_path},
            ))

    # Remote machines
    stmt = select(Machine)
    db_result = await db.execute(stmt)
    machines = db_result.scalars().all()

    for machine in machines:
        if not machine.repo_scan_paths:
            continue
        for scan_path in machine.repo_scan_paths:
            repo_name = scan_path.rstrip("/").rsplit("/", 1)[-1] if "/" in scan_path else scan_path
            if query in repo_name.lower():
                results.append(SearchResult(
                    id=f"repo-{machine.id}-{scan_path}",
                    type="repo",
                    title=repo_name,
                    subtitle=f"{machine.name}",
                    action_data={
                        "machine_id": str(machine.id),
                        "repo_path": scan_path,
                    },
                ))

    return results[:10]


async def _search_machines(db: AsyncSession, query: str) -> list[SearchResult]:
    """Search machines by name (case-insensitive)."""
    results: list[SearchResult] = []

    # Local machine
    if query in LOCAL_MACHINE_NAME.lower():
        results.append(SearchResult(
            id=f"machine-{LOCAL_MACHINE_ID}",
            type="machine",
            title=LOCAL_MACHINE_NAME,
            subtitle=local_machine_manager.get_status(),
            action_data={"machine_id": LOCAL_MACHINE_ID},
        ))

    # Remote machines via ILIKE
    stmt = select(Machine).where(Machine.name.ilike(f"%{query}%"))
    db_result = await db.execute(stmt)
    machines = db_result.scalars().all()

    for machine in machines:
        results.append(SearchResult(
            id=f"machine-{machine.id}",
            type="machine",
            title=machine.name,
            subtitle=ssh_manager.get_status(str(machine.id)),
            action_data={"machine_id": str(machine.id)},
        ))

    return results[:10]


async def _search_feed_items(db: AsyncSession, query: str) -> list[SearchResult]:
    """Search feed items by title (not dismissed)."""
    stmt = (
        select(FeedItem)
        .where(
            FeedItem.title.ilike(f"%{query}%"),
            FeedItem.is_dismissed.is_(False),
        )
        .limit(10)
    )
    db_result = await db.execute(stmt)
    items = db_result.scalars().all()

    return [
        SearchResult(
            id=f"feed-{item.id}",
            type="feed_item",
            title=item.title,
            subtitle=f"{item.source_type} - {item.tier}",
            action_data={"item_id": str(item.id)},
        )
        for item in items
    ]


async def _search_tasks(db: AsyncSession, query: str) -> list[SearchResult]:
    """Search tasks by title."""
    stmt = (
        select(Task)
        .where(Task.title.ilike(f"%{query}%"))
        .limit(10)
    )
    db_result = await db.execute(stmt)
    tasks = db_result.scalars().all()

    return [
        SearchResult(
            id=f"task-{task.id}",
            type="task",
            title=task.title,
            subtitle=task.status,
            action_data={"task_id": str(task.id)},
        )
        for task in tasks
    ]


def _search_actions(query: str) -> list[SearchResult]:
    """Filter static actions by query."""
    return [
        SearchResult(
            id=f"action-{action['action']}",
            type="action",
            title=action["title"],
            action_data={"action": action["action"]},
        )
        for action in STATIC_ACTIONS
        if query in action["title"].lower()
    ]
