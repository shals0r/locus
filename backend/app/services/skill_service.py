"""SSH-based skill discovery with in-memory TTL cache.

Scans both .claude/commands/*.md (flat files) and
.claude/skills/*/SKILL.md (directory structure) per the Claude Code
skill model.
"""

from __future__ import annotations

import asyncio
import logging
from time import time

logger = logging.getLogger(__name__)

_skill_cache: dict[str, tuple[float, list[dict]]] = {}
SKILL_TTL = 300  # 5 minutes


async def _run_command(conn, command: str) -> str:
    """Run a command via SSH connection or local subprocess.

    Args:
        conn: asyncssh connection, or None for local machine.
        command: shell command string.

    Returns:
        stdout as a string (empty string on error).
    """
    if conn is not None:
        try:
            result = await conn.run(command, check=False)
            return result.stdout or ""
        except Exception as exc:
            logger.debug("SSH command failed (%s): %s", command[:60], exc)
            return ""
    else:
        try:
            proc = await asyncio.create_subprocess_shell(
                command,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            stdout, _ = await proc.communicate()
            return stdout.decode() if stdout else ""
        except Exception as exc:
            logger.debug("Local command failed (%s): %s", command[:60], exc)
            return ""


def _parse_description_from_lines(lines: list[str]) -> str:
    """Extract description from the first meaningful line of a skill file.

    Skips YAML frontmatter (--- blocks) and blank lines.
    Strips leading '#' characters.
    """
    in_frontmatter = False
    for line in lines:
        stripped = line.strip()
        if stripped == "---":
            in_frontmatter = not in_frontmatter
            continue
        if in_frontmatter:
            continue
        if not stripped:
            continue
        # Strip leading markdown heading markers
        return stripped.lstrip("#").strip()
    return ""


def _parse_skill_md_frontmatter(lines: list[str]) -> tuple[str | None, str | None]:
    """Parse name and description from YAML frontmatter of a SKILL.md file.

    Returns (name, description) -- either may be None if not found.
    """
    name = None
    description = None
    in_frontmatter = False
    for line in lines:
        stripped = line.strip()
        if stripped == "---":
            if in_frontmatter:
                break  # end of frontmatter
            in_frontmatter = True
            continue
        if not in_frontmatter:
            continue
        if stripped.startswith("name:"):
            name = stripped[5:].strip().strip("\"'")
        elif stripped.startswith("description:"):
            description = stripped[12:].strip().strip("\"'")
    return name, description


async def discover_skills(conn, repo_path: str) -> list[dict]:
    """Discover Claude Code skills for a repo via SSH or local subprocess.

    Scans both .claude/commands/*.md (flat files) and
    .claude/skills/*/SKILL.md (directory structure).

    Args:
        conn: asyncssh connection (or None for local machine)
        repo_path: absolute path to the repository

    Returns:
        List of dicts with keys: name, description, path
    """
    # Check cache
    cache_key = f"{id(conn)}:{repo_path}"
    now = time()
    cached = _skill_cache.get(cache_key)
    if cached is not None:
        ts, skills = cached
        if now - ts < SKILL_TTL:
            return skills

    skills: list[dict] = []
    seen_names: set[str] = set()

    try:
        # 1. Scan .claude/commands/*.md
        commands_output = await _run_command(
            conn,
            f"ls {repo_path}/.claude/commands/*.md 2>/dev/null",
        )
        for filepath in commands_output.strip().split("\n"):
            filepath = filepath.strip()
            if not filepath or not filepath.endswith(".md"):
                continue
            # Name from filename
            name = filepath.rsplit("/", 1)[-1].removesuffix(".md")
            if name in seen_names:
                continue

            # Read first 5 lines for description
            head_output = await _run_command(
                conn,
                f"head -5 '{filepath}' 2>/dev/null",
            )
            description = _parse_description_from_lines(head_output.split("\n"))

            skills.append({
                "name": name,
                "description": description,
                "path": filepath,
            })
            seen_names.add(name)

        # 2. Scan .claude/skills/*/SKILL.md
        skills_output = await _run_command(
            conn,
            f"ls -d {repo_path}/.claude/skills/*/SKILL.md 2>/dev/null",
        )
        for filepath in skills_output.strip().split("\n"):
            filepath = filepath.strip()
            if not filepath or not filepath.endswith("SKILL.md"):
                continue
            # Name from parent directory
            parts = filepath.rsplit("/", 2)
            if len(parts) < 3:
                continue
            name = parts[-2]
            if name in seen_names:
                continue  # commands/ takes precedence

            # Read first 10 lines for frontmatter
            head_output = await _run_command(
                conn,
                f"head -10 '{filepath}' 2>/dev/null",
            )
            lines = head_output.split("\n")
            fm_name, fm_desc = _parse_skill_md_frontmatter(lines)
            final_name = fm_name or name
            description = fm_desc or _parse_description_from_lines(lines)

            # Use fm_name for display but dir name for dedup
            if final_name in seen_names:
                continue

            skills.append({
                "name": final_name,
                "description": description,
                "path": filepath,
            })
            seen_names.add(final_name)

    except Exception as exc:
        logger.warning("Skill discovery failed for %s: %s", repo_path, exc)
        # Skills are optional, never block
        skills = []

    # Cache results
    _skill_cache[cache_key] = (now, skills)
    return skills
