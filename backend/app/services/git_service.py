"""Git operations service layer.

All git operations run as CLI commands via run_command_on_machine(),
routing through the machine registry to support both local and remote
machines over SSH. GitPython is NOT used (requires local filesystem).

Includes GSD state reading for .planning/ directory parsing.
"""

from __future__ import annotations

import logging
import re
import shlex

from app.services.machine_registry import run_command_on_machine

logger = logging.getLogger(__name__)


async def get_repo_status(machine_id: str, repo_path: str) -> dict:
    """Get git status for a repo on any machine.

    Returns: {branch, is_dirty, changed_count, ahead, behind}
    """
    safe_path = shlex.quote(repo_path)

    # Branch name
    branch = (await run_command_on_machine(
        machine_id, f"git -C {safe_path} rev-parse --abbrev-ref HEAD"
    )).strip()

    # Dirty state: count of changed files
    status_output = await run_command_on_machine(
        machine_id, f"git -C {safe_path} status --porcelain"
    )
    changed_files = [line for line in status_output.strip().split("\n") if line.strip()]

    # Ahead/behind tracking remote
    try:
        counts = (await run_command_on_machine(
            machine_id,
            f"git -C {safe_path} rev-list --left-right --count HEAD...@{{upstream}}"
        )).strip().split("\t")
        ahead, behind = int(counts[0]), int(counts[1])
    except Exception:
        ahead, behind = 0, 0

    return {
        "branch": branch,
        "is_dirty": len(changed_files) > 0,
        "changed_count": len(changed_files),
        "ahead": ahead,
        "behind": behind,
    }


async def get_commit_log(
    machine_id: str, repo_path: str, limit: int = 30
) -> list[dict]:
    """Get commit history with structured output.

    Uses NUL-separated format for safe parsing of messages with special chars.
    Returns: list of {sha, message, author, date}
    """
    safe_path = shlex.quote(repo_path)
    safe_limit = int(limit)  # Ensure limit is an integer

    log_output = await run_command_on_machine(
        machine_id,
        f"git -C {safe_path} log --format='%H%x00%s%x00%an%x00%aI' -n {safe_limit}"
    )

    commits = []
    for line in log_output.strip().split("\n"):
        if not line:
            continue
        parts = line.split("\x00")
        if len(parts) >= 4:
            commits.append({
                "sha": parts[0],
                "message": parts[1],
                "author": parts[2],
                "date": parts[3],
            })
    return commits


async def get_changed_files(machine_id: str, repo_path: str) -> list[dict]:
    """Get list of changed files with status indicators.

    Maps git status codes: M=modified, A=added, D=deleted, ??=untracked, R=renamed.
    Returns: list of {status, path}
    """
    safe_path = shlex.quote(repo_path)

    output = await run_command_on_machine(
        machine_id, f"git -C {safe_path} status --porcelain"
    )

    STATUS_MAP = {
        "M": "modified",
        "A": "added",
        "D": "deleted",
        "??": "untracked",
        "R": "renamed",
    }

    files = []
    for line in output.strip().split("\n"):
        if not line.strip():
            continue
        status_code = line[:2].strip()
        filepath = line[3:]
        files.append({
            "status": STATUS_MAP.get(status_code, status_code),
            "status_code": status_code,
            "path": filepath,
        })
    return files


async def get_diff_for_file(
    machine_id: str, repo_path: str, file_path: str, staged: bool = False
) -> str:
    """Get unified diff for a specific file.

    Args:
        staged: If True, show staged changes (--cached). Otherwise unstaged.
    """
    safe_path = shlex.quote(repo_path)
    safe_file = shlex.quote(file_path)
    cached_flag = " --cached" if staged else ""

    return await run_command_on_machine(
        machine_id, f"git -C {safe_path} diff{cached_flag} -- {safe_file}"
    )


async def get_commit_diff(machine_id: str, repo_path: str, commit_sha: str) -> str:
    """Get diff for a specific commit."""
    safe_path = shlex.quote(repo_path)
    safe_sha = shlex.quote(commit_sha)

    return await run_command_on_machine(
        machine_id, f"git -C {safe_path} show --format='' {safe_sha}"
    )


async def get_file_content_at_ref(
    machine_id: str, repo_path: str, ref: str, file_path: str
) -> str:
    """Get file content at a specific ref (for diff viewer old/new content)."""
    safe_path = shlex.quote(repo_path)
    safe_ref = shlex.quote(ref)
    safe_file = shlex.quote(file_path)

    return await run_command_on_machine(
        machine_id, f"git -C {safe_path} show {safe_ref}:{safe_file}"
    )


async def git_fetch(machine_id: str, repo_path: str) -> str:
    """Fetch from remote with prune."""
    safe_path = shlex.quote(repo_path)
    return await run_command_on_machine(
        machine_id, f"git -C {safe_path} fetch --prune 2>&1"
    )


async def git_pull(machine_id: str, repo_path: str) -> str:
    """Pull from remote."""
    safe_path = shlex.quote(repo_path)
    return await run_command_on_machine(
        machine_id, f"git -C {safe_path} pull 2>&1"
    )


async def git_push(machine_id: str, repo_path: str) -> str:
    """Push to remote."""
    safe_path = shlex.quote(repo_path)
    return await run_command_on_machine(
        machine_id, f"git -C {safe_path} push 2>&1"
    )


async def list_branches(machine_id: str, repo_path: str) -> list[dict]:
    """List all local branches with current branch indicator.

    Returns: list of {name, is_current}
    """
    safe_path = shlex.quote(repo_path)

    output = await run_command_on_machine(
        machine_id,
        f"git -C {safe_path} branch --format='%(refname:short)%x00%(HEAD)'"
    )

    branches = []
    for line in output.strip().split("\n"):
        if not line:
            continue
        # Strip null bytes and surrounding whitespace from raw git output
        clean = line.replace("\x00", "\t").strip()
        parts = clean.split("\t")
        name = parts[0].strip()
        if not name:
            continue
        is_current = parts[1].strip() == "*" if len(parts) > 1 else False
        branches.append({
            "name": name,
            "is_current": is_current,
        })
    return branches


async def checkout_branch(machine_id: str, repo_path: str, branch: str) -> str:
    """Checkout an existing branch."""
    safe_path = shlex.quote(repo_path)
    safe_branch = shlex.quote(branch)
    return await run_command_on_machine(
        machine_id, f"git -C {safe_path} checkout {safe_branch} 2>&1"
    )


async def create_branch(machine_id: str, repo_path: str, branch: str) -> str:
    """Create and checkout a new branch."""
    safe_path = shlex.quote(repo_path)
    safe_branch = shlex.quote(branch)
    return await run_command_on_machine(
        machine_id, f"git -C {safe_path} checkout -b {safe_branch} 2>&1"
    )


# ---------------------------------------------------------------------------
# GSD State Reading (GIT-05)
# ---------------------------------------------------------------------------


async def get_gsd_state(machine_id: str, repo_path: str) -> dict:
    """Read GSD state from a repo's .planning/ directory.

    Parses STATE.md for current phase, status, pending todos, blockers.
    Parses ROADMAP.md for total/completed phases.

    Returns: {has_gsd, current_phase, phase_status, pending_todos, blockers,
              total_phases, completed_phases} or {has_gsd: False}
    """
    safe_path = shlex.quote(repo_path)

    # Check if .planning directory exists
    try:
        check = await run_command_on_machine(
            machine_id,
            f"test -d {safe_path}/.planning && echo exists || echo missing"
        )
        if "missing" in check:
            return {"has_gsd": False}
    except Exception:
        return {"has_gsd": False}

    state = {
        "has_gsd": True,
        "current_phase": None,
        "phase_status": None,
        "pending_todos": 0,
        "blockers": 0,
        "total_phases": 0,
        "completed_phases": 0,
    }

    # Read STATE.md
    try:
        state_content = await run_command_on_machine(
            machine_id,
            f"test -f {safe_path}/.planning/STATE.md && cat {safe_path}/.planning/STATE.md || echo ''"
        )
        state.update(_parse_state_md(state_content))
    except Exception as exc:
        logger.warning("Failed to read STATE.md for %s: %s", repo_path, exc)

    # Read ROADMAP.md for phase counts
    try:
        roadmap_content = await run_command_on_machine(
            machine_id,
            f"test -f {safe_path}/.planning/ROADMAP.md && cat {safe_path}/.planning/ROADMAP.md || echo ''"
        )
        state.update(_parse_roadmap_phases(roadmap_content))
    except Exception as exc:
        logger.warning("Failed to read ROADMAP.md for %s: %s", repo_path, exc)

    return state


async def get_gsd_roadmap(machine_id: str, repo_path: str) -> str | None:
    """Get raw ROADMAP.md content for detailed display.

    Returns None if the file doesn't exist.
    """
    safe_path = shlex.quote(repo_path)

    try:
        check = await run_command_on_machine(
            machine_id,
            f"test -f {safe_path}/.planning/ROADMAP.md && echo exists || echo missing"
        )
        if "missing" in check:
            return None

        return await run_command_on_machine(
            machine_id, f"cat {safe_path}/.planning/ROADMAP.md"
        )
    except Exception:
        return None


def _parse_state_md(content: str) -> dict:
    """Parse STATE.md markdown to extract key fields.

    Looks for patterns like:
    - Phase: NN (...) -- EXECUTING
    - Pending Todos section items
    - Blockers section items
    """
    result = {
        "current_phase": None,
        "phase_status": None,
        "pending_todos": 0,
        "blockers": 0,
    }

    if not content.strip():
        return result

    # Extract current phase from "Phase: XX (...) -- STATUS" line
    phase_match = re.search(
        r"Phase:\s*(\S+)\s*\([^)]*\)\s*(?:--|-{1,2})\s*(\w+)", content
    )
    if phase_match:
        result["current_phase"] = phase_match.group(1)
        result["phase_status"] = phase_match.group(2).lower()

    # Count pending todos (lines starting with "- " under Pending Todos)
    in_todos = False
    for line in content.split("\n"):
        stripped = line.strip()
        if "pending todo" in stripped.lower():
            in_todos = True
            continue
        if in_todos:
            if stripped.startswith("##") or stripped.startswith("---"):
                in_todos = False
            elif stripped.startswith("- ") or stripped.startswith("* "):
                if "none" not in stripped.lower():
                    result["pending_todos"] += 1

    # Count blockers (lines starting with "- " under Blockers)
    in_blockers = False
    for line in content.split("\n"):
        stripped = line.strip()
        if "blocker" in stripped.lower() and (
            stripped.startswith("#") or stripped.startswith("*")
        ):
            in_blockers = True
            continue
        if in_blockers:
            if stripped.startswith("##") or stripped.startswith("---"):
                in_blockers = False
            elif stripped.startswith("- ") or stripped.startswith("* "):
                if "none" not in stripped.lower():
                    result["blockers"] += 1

    return result


def _parse_roadmap_phases(content: str) -> dict:
    """Parse ROADMAP.md to count total and completed phases.

    Looks for phase rows in markdown tables or phase headings.
    Completed phases have checkmarks or 'complete' status.
    """
    result = {
        "total_phases": 0,
        "completed_phases": 0,
    }

    if not content.strip():
        return result

    # Count phase headings (## Phase N: ... or similar)
    phase_headings = re.findall(r"##\s+Phase\s+\d", content)
    result["total_phases"] = len(phase_headings)

    # Count completed phases (lines containing COMPLETE or checkmark)
    for heading in phase_headings:
        # Find the line with this heading and check for completion markers
        pass

    # Also check for table rows with completion status
    complete_count = 0
    for line in content.split("\n"):
        if re.search(r"phase\s+\d", line, re.IGNORECASE):
            if any(marker in line.lower() for marker in [
                "complete", "[x]", "done"
            ]):
                complete_count += 1

    # Use the larger of heading count and table-detected count
    if complete_count > 0:
        result["completed_phases"] = complete_count

    # Fallback: check frontmatter for completed_phases
    frontmatter_match = re.search(r"completed_phases:\s*(\d+)", content)
    if frontmatter_match:
        result["completed_phases"] = max(
            result["completed_phases"],
            int(frontmatter_match.group(1)),
        )

    # Also try total_phases from frontmatter
    total_match = re.search(r"total_phases:\s*(\d+)", content)
    if total_match:
        result["total_phases"] = max(
            result["total_phases"],
            int(total_match.group(1)),
        )

    return result
