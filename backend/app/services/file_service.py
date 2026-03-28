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

from app.services.machine_registry import run_command_on_machine

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

    Tries Linux stat format first, falls back to macOS/BSD format.
    Returns: {"size": int, "mtime": int}
    """
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

    Checks file size before reading (rejects files > 5 MB).
    Returns the decoded file content as a string.
    """
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

    Creates parent directories if needed.
    """
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


async def list_directory(machine_id: str, dir_path: str) -> list[dict]:
    """List directory contents with type info (file vs directory).

    Uses ls -1F to get entries with type indicators.
    Returns list of {"name": str, "is_dir": bool} sorted dirs-first
    then alphabetical.
    """
    safe_path = shlex.quote(dir_path)

    try:
        output = await run_command_on_machine(
            machine_id, f"ls -1F {safe_path}"
        )
    except Exception as exc:
        raise FileNotFoundError(f"Directory not found: {dir_path}: {exc}") from exc

    entries: list[dict] = []
    for line in output.strip().split("\n"):
        name = line.strip()
        if not name:
            continue

        is_dir = name.endswith("/")
        # Strip type indicators: / (dir), * (exec), @ (link), | (pipe), = (socket)
        clean_name = name.rstrip("/*@|=")
        if not clean_name:
            continue

        entries.append({"name": clean_name, "is_dir": is_dir})

    # Sort: directories first, then alphabetical within each group
    entries.sort(key=lambda e: (not e["is_dir"], e["name"].lower()))
    return entries


async def create_file(
    machine_id: str, file_path: str, content: str = ""
) -> None:
    """Create a new file with optional content.

    Creates parent directories if they don't exist.
    """
    safe_path = shlex.quote(file_path)
    parent_dir = shlex.quote(os.path.dirname(file_path))

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
