"""Git operations REST API endpoints.

Provides endpoints for git status, commits, branches, diffs,
fetch/pull/push operations, and GSD state reading.
All git operations route through git_service which uses
CLI commands via machine_registry (supports local and remote).
"""

import logging

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from uuid import UUID

from app.config import settings
from app.database import get_db
from app.local.manager import LOCAL_MACHINE_ID, local_machine_manager
from app.models.machine import Machine
from app.schemas.git import (
    BranchInfo,
    ChangedFile,
    CommitEntry,
    GitOpResult,
    GsdState,
    RepoDetail,
    RepoStatus,
)
from app.services.auth import get_current_user
from app.services.git_service import (
    checkout_branch,
    create_branch,
    get_changed_files,
    get_commit_diff,
    get_commit_log,
    get_diff_for_file,
    get_gsd_state,
    get_repo_status,
    git_fetch,
    git_pull,
    git_push,
    list_branches,
)
from app.services.machine_registry import is_local_machine, run_command_on_machine
from app.ssh.manager import ssh_manager

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/git", tags=["git"])


# ---------------------------------------------------------------------------
# Request schemas (inline for simple body payloads)
# ---------------------------------------------------------------------------
from pydantic import BaseModel


class GitOpRequest(BaseModel):
    """Request body for git operations (fetch, pull, push)."""
    machine_id: str
    repo_path: str


class CheckoutRequest(BaseModel):
    """Request body for checkout/create-branch."""
    machine_id: str
    repo_path: str
    branch: str


# ---------------------------------------------------------------------------
# Status endpoints
# ---------------------------------------------------------------------------


@router.get("/status", response_model=RepoStatus)
async def get_status(
    machine_id: str = Query(...),
    repo_path: str = Query(...),
    _user: dict = Depends(get_current_user),
) -> RepoStatus:
    """Get git status for a single repo on a machine."""
    try:
        result = await get_repo_status(machine_id, repo_path)
        return RepoStatus(**result)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Git status failed: {exc}")


@router.get("/status/all", response_model=list[RepoDetail])
async def get_all_status(
    machine_id: str = Query(...),
    _user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[RepoDetail]:
    """Get status for all repos on a machine.

    Discovers repos via the machine's repo_scan_paths, then
    fetches git status for each discovered repo.
    """
    # Get scan paths for the machine
    if is_local_machine(machine_id):
        if not local_machine_manager.is_usable:
            raise HTTPException(status_code=409, detail="Local machine is not available")
        scan_paths = settings.local_repo_scan_paths
    else:
        machine = await db.get(Machine, UUID(machine_id))
        if machine is None:
            raise HTTPException(status_code=404, detail="Machine not found")
        scan_paths = machine.repo_scan_paths or []

    if not scan_paths:
        return []

    # Discover repos
    repos: list[str] = []
    for scan_path in scan_paths:
        try:
            output = await run_command_on_machine(
                machine_id,
                f"find {scan_path} -maxdepth 2 -name .git -type d 2>/dev/null"
            )
            for line in output.strip().split("\n"):
                if line:
                    repo_path = line.rstrip("/")
                    if repo_path.endswith("/.git"):
                        repo_path = repo_path[:-5]
                    repos.append(repo_path)
        except Exception as exc:
            logger.warning("Repo scan failed for %s: %s", scan_path, exc)

    # Get status for each repo
    details: list[RepoDetail] = []
    for repo_path in repos:
        try:
            status_data = await get_repo_status(machine_id, repo_path)
            name = repo_path.rstrip("/").split("/")[-1]
            details.append(RepoDetail(
                machine_id=machine_id,
                repo_path=repo_path,
                name=name,
                status=RepoStatus(**status_data),
            ))
        except Exception as exc:
            logger.warning("Status failed for %s: %s", repo_path, exc)

    return details


# ---------------------------------------------------------------------------
# Commit / file info
# ---------------------------------------------------------------------------


@router.get("/commits", response_model=list[CommitEntry])
async def get_commits(
    machine_id: str = Query(...),
    repo_path: str = Query(...),
    limit: int = Query(30, ge=1, le=200),
    _user: dict = Depends(get_current_user),
) -> list[CommitEntry]:
    """Get recent commit log for a repo."""
    try:
        commits = await get_commit_log(machine_id, repo_path, limit)
        return [CommitEntry(**c) for c in commits]
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Commit log failed: {exc}")


@router.get("/changed-files", response_model=list[ChangedFile])
async def get_changed(
    machine_id: str = Query(...),
    repo_path: str = Query(...),
    _user: dict = Depends(get_current_user),
) -> list[ChangedFile]:
    """Get list of changed files in a repo."""
    try:
        files = await get_changed_files(machine_id, repo_path)
        return [ChangedFile(**f) for f in files]
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Changed files failed: {exc}")


@router.get("/branches", response_model=list[BranchInfo])
async def get_branches(
    machine_id: str = Query(...),
    repo_path: str = Query(...),
    _user: dict = Depends(get_current_user),
) -> list[BranchInfo]:
    """List branches for a repo."""
    try:
        branches = await list_branches(machine_id, repo_path)
        return [BranchInfo(**b) for b in branches]
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Branch listing failed: {exc}")


# ---------------------------------------------------------------------------
# Git operations (fetch, pull, push, checkout, create-branch)
# ---------------------------------------------------------------------------


@router.post("/fetch", response_model=GitOpResult)
async def do_fetch(
    body: GitOpRequest,
    _user: dict = Depends(get_current_user),
) -> GitOpResult:
    """Fetch from remote with prune."""
    try:
        output = await git_fetch(body.machine_id, body.repo_path)
        return GitOpResult(success=True, message=output or "Fetch complete")
    except Exception as exc:
        return GitOpResult(success=False, message=str(exc))


@router.post("/pull", response_model=GitOpResult)
async def do_pull(
    body: GitOpRequest,
    _user: dict = Depends(get_current_user),
) -> GitOpResult:
    """Pull from remote."""
    try:
        output = await git_pull(body.machine_id, body.repo_path)
        return GitOpResult(success=True, message=output or "Pull complete")
    except Exception as exc:
        return GitOpResult(success=False, message=str(exc))


@router.post("/push", response_model=GitOpResult)
async def do_push(
    body: GitOpRequest,
    _user: dict = Depends(get_current_user),
) -> GitOpResult:
    """Push to remote."""
    try:
        output = await git_push(body.machine_id, body.repo_path)
        return GitOpResult(success=True, message=output or "Push complete")
    except Exception as exc:
        return GitOpResult(success=False, message=str(exc))


@router.post("/checkout", response_model=GitOpResult)
async def do_checkout(
    body: CheckoutRequest,
    _user: dict = Depends(get_current_user),
) -> GitOpResult:
    """Checkout an existing branch."""
    try:
        output = await checkout_branch(body.machine_id, body.repo_path, body.branch)
        return GitOpResult(success=True, message=output or f"Checked out {body.branch}")
    except Exception as exc:
        return GitOpResult(success=False, message=str(exc))


@router.post("/create-branch", response_model=GitOpResult)
async def do_create_branch(
    body: CheckoutRequest,
    _user: dict = Depends(get_current_user),
) -> GitOpResult:
    """Create and checkout a new branch."""
    try:
        output = await create_branch(body.machine_id, body.repo_path, body.branch)
        return GitOpResult(success=True, message=output or f"Created branch {body.branch}")
    except Exception as exc:
        return GitOpResult(success=False, message=str(exc))


# ---------------------------------------------------------------------------
# Diff endpoints
# ---------------------------------------------------------------------------


@router.get("/diff")
async def get_file_diff(
    machine_id: str = Query(...),
    repo_path: str = Query(...),
    file_path: str = Query(...),
    staged: bool = Query(False),
    _user: dict = Depends(get_current_user),
) -> dict:
    """Get unified diff for a specific file."""
    try:
        diff = await get_diff_for_file(machine_id, repo_path, file_path, staged)
        return {"diff": diff}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Diff failed: {exc}")


@router.get("/commit-diff")
async def get_commit_diff_endpoint(
    machine_id: str = Query(...),
    repo_path: str = Query(...),
    sha: str = Query(...),
    _user: dict = Depends(get_current_user),
) -> dict:
    """Get diff for a specific commit."""
    try:
        diff = await get_commit_diff(machine_id, repo_path, sha)
        return {"diff": diff}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Commit diff failed: {exc}")


# ---------------------------------------------------------------------------
# GSD State (GIT-05)
# ---------------------------------------------------------------------------


@router.get("/gsd-state", response_model=GsdState)
async def get_gsd_state_endpoint(
    machine_id: str = Query(...),
    repo_path: str = Query(...),
    _user: dict = Depends(get_current_user),
) -> GsdState:
    """Get GSD state for a repo (phase, progress, todos, blockers).

    Powers the GSD state display in the sidebar and the
    GSD action buttons.
    """
    try:
        state = await get_gsd_state(machine_id, repo_path)
        return GsdState(**state)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"GSD state failed: {exc}")
