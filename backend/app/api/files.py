"""File operations REST API endpoints.

Provides endpoints for cross-file text search within repositories.
All file operations route through machine_registry for local/remote support.
"""

import logging
import re
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from app.services.auth import get_current_user
from app.services.machine_registry import run_command_on_machine

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/files", tags=["files"])


class FileMatch(BaseModel):
    line: int
    text: str


class FileSearchResult(BaseModel):
    file: str
    matches: list[FileMatch]


class FileSearchResponse(BaseModel):
    results: list[FileSearchResult]
    truncated: bool


@router.get("/search", response_model=FileSearchResponse)
async def search_files(
    machine_id: str = Query(..., description="Machine ID"),
    repo_path: str = Query(..., description="Absolute path to the repository"),
    query: str = Query(..., min_length=1, description="Search query text"),
    max_results: int = Query(50, ge=1, le=200, description="Max files to return"),
    case_sensitive: bool = Query(False, description="Case-sensitive search"),
    regex: bool = Query(False, description="Treat query as regex"),
    _user=Depends(get_current_user),
):
    """Search for text within files in a repository.

    Uses grep via machine_registry for local/remote support.
    Returns matching files with line numbers and context.
    """
    # Build grep command with appropriate flags
    exclude_dirs = [
        ".git", "node_modules", "__pycache__", ".venv", "venv",
        "dist", "build", ".next", ".nuxt", "coverage",
        ".mypy_cache", ".pytest_cache", ".tox", "egg-info",
    ]

    # Common source file extensions to search
    include_exts = [
        "py", "ts", "tsx", "js", "jsx", "json", "yaml", "yml",
        "toml", "cfg", "ini", "md", "txt", "html", "css", "scss",
        "sql", "sh", "bash", "rs", "go", "java", "rb", "php",
        "c", "cpp", "h", "hpp", "vue", "svelte",
    ]

    exclude_flags = " ".join(f"--exclude-dir={d}" for d in exclude_dirs)
    include_flags = " ".join(f"--include='*.{ext}'" for ext in include_exts)

    # Escape query for shell safety unless regex mode
    if regex:
        # For regex mode, use -E (extended regex) and pass pattern as-is
        search_pattern = query
        regex_flag = "-E"
    else:
        # For literal search, use -F (fixed string)
        search_pattern = query
        regex_flag = "-F"

    case_flag = "" if case_sensitive else "-i"

    # Use grep -rn to get file:line:text output
    # Limit to max_results files using head-like approach
    # Shell-escape the search pattern
    escaped_query = search_pattern.replace("'", "'\\''")
    cmd = (
        f"grep -rn {regex_flag} {case_flag} {exclude_flags} {include_flags} "
        f"-- '{escaped_query}' {repo_path} 2>/dev/null | head -500"
    )

    try:
        output = await run_command_on_machine(machine_id, cmd)
    except ConnectionError:
        raise HTTPException(status_code=503, detail="Machine not connected")
    except Exception as e:
        logger.warning("File search failed: %s", e)
        # grep returns exit code 1 when no matches found - treat as empty
        output = ""

    # Parse grep output: file:line:text
    results_map: dict[str, list[FileMatch]] = {}
    line_pattern = re.compile(r"^(.+?):(\d+):(.*)$")

    for raw_line in output.splitlines():
        m = line_pattern.match(raw_line)
        if not m:
            continue

        file_path = m.group(1)
        line_num = int(m.group(2))
        line_text = m.group(3).strip()

        # Make path relative to repo_path
        if file_path.startswith(repo_path):
            rel_path = file_path[len(repo_path):].lstrip("/").lstrip("\\")
        else:
            rel_path = file_path

        if rel_path not in results_map:
            if len(results_map) >= max_results:
                break
            results_map[rel_path] = []

        # Limit to 5 matches per file
        if len(results_map[rel_path]) < 5:
            results_map[rel_path].append(FileMatch(line=line_num, text=line_text))

    results = [
        FileSearchResult(file=fp, matches=matches)
        for fp, matches in results_map.items()
    ]

    return FileSearchResponse(
        results=results,
        truncated=len(results_map) >= max_results,
    )
