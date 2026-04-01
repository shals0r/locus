"""File operations service layer.

All file operations run as CLI commands via run_command_on_machine(),
routing through the machine registry to support both local and remote
machines over SSH. Uses base64 encoding for binary-safe file transfer.
"""

from __future__ import annotations

import base64
import logging
import os
import shlex

from app.services.machine_registry import get_agent_client_for_machine, run_command_on_machine

logger = logging.getLogger(__name__)

# Maximum file size we'll read (5 MB)
MAX_FILE_SIZE = 5 * 1024 * 1024

# Extension -> language mapping for syntax highlighting
_LANGUAGE_MAP: dict[str, str] = {
    ".py": "python",
    ".js": "javascript",
    ".jsx": "javascriptreact",
    ".ts": "typescript",
    ".tsx": "typescriptreact",
    ".html": "html",
    ".htm": "html",
    ".css": "css",
    ".scss": "scss",
    ".sass": "sass",
    ".less": "less",
    ".json": "json",
    ".yaml": "yaml",
    ".yml": "yaml",
    ".toml": "toml",
    ".xml": "xml",
    ".md": "markdown",
    ".markdown": "markdown",
    ".sh": "shellscript",
    ".bash": "shellscript",
    ".zsh": "shellscript",
    ".fish": "shellscript",
    ".rs": "rust",
    ".go": "go",
    ".java": "java",
    ".kt": "kotlin",
    ".kts": "kotlin",
    ".c": "c",
    ".h": "c",
    ".cpp": "cpp",
    ".cxx": "cpp",
    ".cc": "cpp",
    ".hpp": "cpp",
    ".cs": "csharp",
    ".rb": "ruby",
    ".php": "php",
    ".swift": "swift",
    ".r": "r",
    ".R": "r",
    ".sql": "sql",
    ".graphql": "graphql",
    ".gql": "graphql",
    ".dockerfile": "dockerfile",
    ".docker": "dockerfile",
    ".tf": "terraform",
    ".hcl": "hcl",
    ".lua": "lua",
    ".vim": "vim",
    ".ini": "ini",
    ".cfg": "ini",
    ".conf": "ini",
    ".env": "dotenv",
    ".gitignore": "ignore",
    ".dockerignore": "ignore",
    ".svg": "xml",
    ".vue": "vue",
    ".svelte": "svelte",
    ".astro": "astro",
}


def detect_language(file_path: str) -> str:
    """Detect language from file extension for syntax highlighting.

    Returns a language identifier string suitable for editors/highlighters.
    Falls back to "plaintext" for unknown extensions.
    """
    basename = os.path.basename(file_path)

    # Check full basename first (e.g., Dockerfile, Makefile)
    basename_lower = basename.lower()
    if basename_lower == "dockerfile":
        return "dockerfile"
    if basename_lower == "makefile":
        return "makefile"

    _, ext = os.path.splitext(file_path)
    if not ext:
        return "plaintext"
    return _LANGUAGE_MAP.get(ext.lower(), "plaintext")


async def file_stat(machine_id: str, file_path: str) -> dict:
    """Get file size and modification time.

    Routes through agent when available, falls back to SSH exec.
    Returns: {"size": int, "mtime": int}
    """
    agent = await get_agent_client_for_machine(machine_id)
    if agent:
        try:
            result = await agent.stat_file(file_path)
            return {
                "size": result.get("size", 0),
                "mtime": int(result.get("modified", 0)),
            }
        except Exception as exc:
            logger.warning("Agent stat_file failed, falling back to SSH: %s", exc)

    safe_path = shlex.quote(file_path)

    try:
        # Linux stat format
        output = await run_command_on_machine(
            machine_id,
            f"stat --format='%s %Y' {safe_path} 2>/dev/null"
            f" || stat -f '%z %m' {safe_path}"
        )
        parts = output.strip().split()
        if len(parts) >= 2:
            return {"size": int(parts[0]), "mtime": int(parts[1])}
    except Exception as exc:
        raise FileNotFoundError(f"Cannot stat {file_path}: {exc}") from exc

    raise FileNotFoundError(f"Cannot stat {file_path}: unexpected output format")


async def read_file(machine_id: str, file_path: str) -> str:
    """Read file content using base64 encoding for binary safety.

    Routes through agent when available, falls back to SSH exec.
    Returns the decoded file content as a string.
    """
    agent = await get_agent_client_for_machine(machine_id)
    if agent:
        try:
            result = await agent.read_file(file_path)
            content = result.get("content", "")
            if result.get("encoding") == "base64":
                import base64 as b64
                content = b64.b64decode(content).decode("utf-8", errors="replace")
            return content
        except Exception as exc:
            logger.warning("Agent read_file failed, falling back to SSH: %s", exc)

    # Check file size first
    stat_info = await file_stat(machine_id, file_path)
    if stat_info["size"] > MAX_FILE_SIZE:
        raise ValueError(
            f"File too large: {stat_info['size']} bytes "
            f"(max {MAX_FILE_SIZE} bytes)"
        )

    safe_path = shlex.quote(file_path)

    try:
        b64_output = await run_command_on_machine(
            machine_id, f"base64 < {safe_path}"
        )
        content_bytes = base64.b64decode(b64_output.strip())
        return content_bytes.decode("utf-8", errors="replace")
    except FileNotFoundError:
        raise
    except Exception as exc:
        raise IOError(f"Failed to read {file_path}: {exc}") from exc


async def write_file(machine_id: str, file_path: str, content: str) -> None:
    """Write file content using base64 encode/decode for safety.

    Routes through agent when available, falls back to SSH exec.
    Creates parent directories if needed.
    """
    agent = await get_agent_client_for_machine(machine_id)
    if agent:
        try:
            await agent.write_file(file_path, content)
            return
        except Exception as exc:
            logger.warning("Agent write_file failed, falling back to SSH: %s", exc)

    safe_path = shlex.quote(file_path)
    parent_dir = shlex.quote(os.path.dirname(file_path))

    # Ensure parent directory exists
    if parent_dir and parent_dir != shlex.quote(""):
        await run_command_on_machine(
            machine_id, f"mkdir -p {parent_dir}"
        )

    # Encode content to base64 and write
    encoded = base64.b64encode(content.encode("utf-8")).decode("ascii")
    safe_encoded = shlex.quote(encoded)

    try:
        await run_command_on_machine(
            machine_id,
            f"printf '%s' {safe_encoded} | base64 -d > {safe_path}"
        )
    except Exception as exc:
        raise IOError(f"Failed to write {file_path}: {exc}") from exc


_PRUNE_DIRS = (
    ".git", "node_modules", "__pycache__", ".venv", "venv",
    ".mypy_cache", ".pytest_cache", ".tox", "dist", "build",
    ".next", ".nuxt", ".cache", ".eggs",
)


async def list_directory(
    machine_id: str, dir_path: str, depth: int = 1
) -> list[dict]:
    """List directory contents with type info (file vs directory).

    Routes through agent when available, falls back to SSH exec.
    Prunes heavy directories (.git, node_modules, etc.) for speed.
    """
    agent = await get_agent_client_for_machine(machine_id)
    if agent:
        try:
            result = await agent.list_directory(dir_path, recursive=(depth > 1))
            entries = []
            for e in result.get("entries", []):
                entries.append({
                    "name": e.get("name", ""),
                    "path": os.path.join(dir_path, e.get("name", "")),
                    "is_dir": e.get("type") == "dir",
                })
            entries.sort(key=lambda e: (not e["is_dir"], e["name"].lower()))
            return entries
        except Exception as exc:
            logger.warning("Agent list_directory failed, falling back to SSH: %s", exc)

    safe_path = shlex.quote(dir_path)

    # Build prune expression to skip heavy dirs
    prune_parts = " -o ".join(f"-name {d}" for d in _PRUNE_DIRS)
    cmd = (
        f"find {safe_path} -maxdepth {depth} -mindepth 1"
        f" \\( {prune_parts} \\) -prune"
        f" -o -type d -printf 'd %p\\n'"
        f" -o -type f -printf 'f %p\\n'"
    )

    try:
        output = await run_command_on_machine(machine_id, cmd)
    except Exception as exc:
        raise FileNotFoundError(f"Directory not found: {dir_path}: {exc}") from exc

    entries: list[dict] = []
    for line in output.strip().split("\n"):
        line = line.strip()
        if not line or len(line) < 3 or line[1] != " ":
            continue

        entry_type = line[0]
        entry_path = line[2:]
        name = entry_path.rsplit("/", 1)[-1]
        if not name:
            continue

        entries.append({
            "name": name,
            "path": entry_path,
            "is_dir": entry_type == "d",
        })

    entries.sort(key=lambda e: (not e["is_dir"], e["name"].lower()))
    return entries


async def create_file(
    machine_id: str, file_path: str, content: str = "", is_dir: bool = False
) -> None:
    """Create a new file or directory.

    Creates parent directories if they don't exist.
    """
    safe_path = shlex.quote(file_path)
    parent_dir = shlex.quote(os.path.dirname(file_path))

    if is_dir:
        await run_command_on_machine(machine_id, f"mkdir -p {safe_path}")
        return

    # Ensure parent directory exists
    if parent_dir and parent_dir != shlex.quote(""):
        await run_command_on_machine(
            machine_id, f"mkdir -p {parent_dir}"
        )

    if content:
        await write_file(machine_id, file_path, content)
    else:
        await run_command_on_machine(
            machine_id, f"touch {safe_path}"
        )


async def rename_file(
    machine_id: str, old_path: str, new_path: str
) -> None:
    """Rename/move a file."""
    safe_old = shlex.quote(old_path)
    safe_new = shlex.quote(new_path)

    try:
        await run_command_on_machine(
            machine_id, f"mv {safe_old} {safe_new}"
        )
    except Exception as exc:
        raise IOError(f"Failed to rename {old_path} -> {new_path}: {exc}") from exc


async def delete_file(
    machine_id: str, file_path: str, is_dir: bool = False
) -> None:
    """Delete a file or directory.

    For safety, only deletes single files by default.
    Set is_dir=True to recursively delete a directory.
    """
    safe_path = shlex.quote(file_path)

    try:
        if is_dir:
            await run_command_on_machine(
                machine_id, f"rm -rf {safe_path}"
            )
        else:
            await run_command_on_machine(
                machine_id, f"rm {safe_path}"
            )
    except Exception as exc:
        raise IOError(f"Failed to delete {file_path}: {exc}") from exc
