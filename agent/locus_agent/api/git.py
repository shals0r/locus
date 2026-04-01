"""Git operations REST API on the agent.

Provides status, branches, log, diff, and exec endpoints for git
operations, eliminating SSH exec overhead for git ops.
"""

from __future__ import annotations

import asyncio
import logging
import re
import shutil

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel

from locus_agent.auth import verify_token

logger = logging.getLogger("locus_agent")

router = APIRouter(dependencies=[Depends(verify_token)], tags=["git"])

# Commands blocked for safety
_BLOCKED_PATTERNS = [
    "push --force",
    "push -f",
    "reset --hard",
    "clean -f",
    "clean -fd",
    "clean -fx",
]


async def _run_git(repo_path: str, *args: str) -> tuple[int, str, str]:
    """Run a git command in the given repo.

    Returns (returncode, stdout, stderr).
    Raises HTTPException 503 if git is not found.
    """
    git_path = shutil.which("git")
    if not git_path:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="git not found on this host",
        )

    cmd = [git_path, "-C", repo_path, *args]
    proc = await asyncio.create_subprocess_exec(
        *cmd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    stdout_bytes, stderr_bytes = await asyncio.wait_for(
        proc.communicate(), timeout=30.0
    )
    return (
        proc.returncode or 0,
        stdout_bytes.decode(errors="replace"),
        stderr_bytes.decode(errors="replace"),
    )


# -- Request/Response models --

class ExecRequest(BaseModel):
    repo_path: str
    args: list[str]


# -- Endpoints --

@router.get("/git/status")
async def git_status(repo_path: str = Query(...)):
    """Get repository status (branch, clean state, changed files)."""
    returncode, stdout, stderr = await _run_git(
        repo_path, "status", "--porcelain=v2", "--branch"
    )
    if returncode != 0:
        raise HTTPException(status_code=400, detail=f"git status failed: {stderr}")

    branch = ""
    ahead = 0
    behind = 0
    files = []

    for line in stdout.split("\n"):
        line = line.strip()
        if not line:
            continue

        if line.startswith("# branch.head "):
            branch = line[len("# branch.head "):]
        elif line.startswith("# branch.ab "):
            # Format: # branch.ab +N -M
            ab_match = re.search(r"\+(\d+)\s+-(\d+)", line)
            if ab_match:
                ahead = int(ab_match.group(1))
                behind = int(ab_match.group(2))
        elif line.startswith("1 ") or line.startswith("2 ") or line.startswith("? "):
            # Changed/untracked entries
            if line.startswith("? "):
                # Untracked: ? path
                fpath = line[2:]
                files.append({"path": fpath, "status": "??"})
            elif line.startswith("1 "):
                # Ordinary: 1 XY sub mH mI mW hH hI path
                parts = line.split(" ", 8)
                if len(parts) >= 9:
                    files.append({"path": parts[8], "status": parts[1]})
            elif line.startswith("2 "):
                # Rename: 2 XY sub mH mI mW hH hI X path\torigPath
                parts = line.split(" ", 9)
                if len(parts) >= 10:
                    paths = parts[9].split("\t")
                    files.append({"path": paths[0], "status": parts[1]})

    return {
        "repo_path": repo_path,
        "branch": branch,
        "clean": len(files) == 0,
        "ahead": ahead,
        "behind": behind,
        "files": files,
    }


@router.get("/git/branches")
async def git_branches(repo_path: str = Query(...)):
    """List all branches (local and remote)."""
    returncode, stdout, stderr = await _run_git(
        repo_path, "branch", "-a",
        "--format=%(refname:short):%(objectname:short):%(upstream:short)"
    )
    if returncode != 0:
        raise HTTPException(status_code=400, detail=f"git branch failed: {stderr}")

    # Determine current branch
    _, current_out, _ = await _run_git(repo_path, "rev-parse", "--abbrev-ref", "HEAD")
    current_branch = current_out.strip()

    branches = []
    for line in stdout.split("\n"):
        line = line.strip()
        if not line:
            continue
        parts = line.split(":", 2)
        name = parts[0] if len(parts) >= 1 else ""
        commit = parts[1] if len(parts) >= 2 else ""
        upstream = parts[2] if len(parts) >= 3 else ""

        if not name:
            continue

        branches.append({
            "name": name,
            "commit": commit,
            "upstream": upstream or None,
            "current": name == current_branch,
        })

    return {"branches": branches}


@router.get("/git/log")
async def git_log(
    repo_path: str = Query(...),
    count: int = Query(20, ge=1, le=500),
):
    """Get commit log."""
    returncode, stdout, stderr = await _run_git(
        repo_path, "log",
        "--format=%H|%h|%an|%ae|%at|%s",
        f"-n{count}",
    )
    if returncode != 0:
        raise HTTPException(status_code=400, detail=f"git log failed: {stderr}")

    commits = []
    for line in stdout.split("\n"):
        line = line.strip()
        if not line:
            continue
        parts = line.split("|", 5)
        if len(parts) >= 6:
            commits.append({
                "hash": parts[0],
                "short_hash": parts[1],
                "author": parts[2],
                "email": parts[3],
                "timestamp": int(parts[4]) if parts[4].isdigit() else 0,
                "message": parts[5],
            })

    return {"commits": commits}


@router.get("/git/diff")
async def git_diff(
    repo_path: str = Query(...),
    ref: str | None = Query(None),
    cached: bool = Query(False),
):
    """Get diff output and stats."""
    diff_args = ["diff"]
    if cached:
        diff_args.append("--cached")
    if ref:
        diff_args.append(ref)

    returncode, diff_output, stderr = await _run_git(repo_path, *diff_args)
    if returncode != 0:
        raise HTTPException(status_code=400, detail=f"git diff failed: {stderr}")

    # Get diff stats
    stat_args = ["diff", "--stat"]
    if cached:
        stat_args.append("--cached")
    if ref:
        stat_args.append(ref)

    _, stat_output, _ = await _run_git(repo_path, *stat_args)

    # Parse summary line: " N files changed, M insertions(+), K deletions(-)"
    files_changed = 0
    insertions = 0
    deletions = 0
    summary_match = re.search(
        r"(\d+) files? changed(?:, (\d+) insertions?\(\+\))?(?:, (\d+) deletions?\(-\))?",
        stat_output,
    )
    if summary_match:
        files_changed = int(summary_match.group(1))
        insertions = int(summary_match.group(2) or 0)
        deletions = int(summary_match.group(3) or 0)

    return {
        "diff": diff_output,
        "stats": {
            "files_changed": files_changed,
            "insertions": insertions,
            "deletions": deletions,
        },
    }


@router.post("/git/exec")
async def git_exec(body: ExecRequest):
    """Execute an arbitrary git command (with safety blocklist)."""
    # Check blocklist
    args_str = " ".join(body.args)
    for blocked in _BLOCKED_PATTERNS:
        if blocked in args_str:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Blocked dangerous git operation: {blocked}",
            )

    returncode, stdout, stderr = await _run_git(body.repo_path, *body.args)

    return {
        "returncode": returncode,
        "stdout": stdout,
        "stderr": stderr,
    }
