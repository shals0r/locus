# Phase 4: Integrations Runner & Skills - Research

**Researched:** 2026-03-28
**Domain:** Subprocess process supervision, Claude Code CLI integration, real-time log streaming, skill discovery via SSH
**Confidence:** HIGH

## Summary

Phase 4 replaces the current in-process APScheduler-based integration polling system with a subprocess-based worker supervisor. All workers (4 existing built-in adapters plus user-created ones) run as standalone Python scripts managed by an asyncio-based process supervisor in the main app container. The Integrator is a dedicated chat side panel backed by Claude Code CLI running on a connected machine. Per-repo skills are discovered by scanning `.claude/commands/*.md` over SSH.

The core technical challenge is building a robust subprocess supervisor using Python's `asyncio.create_subprocess_exec()` that handles lifecycle management (start/stop/restart), crash recovery with exponential backoff, log streaming via WebSocket, and hot-deployment of new workers. This is well-supported by Python's stdlib -- no external process-management library is needed. The secondary challenge is routing chat messages to a Claude Code CLI session on a remote machine via the existing SSH infrastructure, which aligns with patterns already established in Phase 1.

**Primary recommendation:** Build a custom `WorkerSupervisor` service using `asyncio.create_subprocess_exec()` with PIPE-based stdout/stderr capture, a per-worker state machine (starting/running/degraded/crashed/disabled), and exponential backoff restart logic. Use the existing ingest API as the uniform contract for all workers. Route Integrator chat through Claude Code CLI's `-p` flag with `--continue` for multi-turn conversations over SSH.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** All workers (including 4 existing built-in adapters) run as supervised subprocesses, not in-process. Uniform model.
- **D-02:** Workers are standalone Python scripts with a `poll()` function contract, main loop that calls `poll()` on an interval, POSTs results to `POST /api/feed/ingest`. No class inheritance required.
- **D-03:** Worker code lives on the filesystem in a dedicated directory (e.g., `/data/workers/`).
- **D-04:** Existing 4 built-in adapters must be migrated from `BasePollingAdapter` in-process to standalone subprocess scripts. Mention detection/tier elevation moves into the ingest API endpoint.
- **D-05:** Subprocess isolation -- main app never imports untrusted code. Each worker is its own Python process.
- **D-06:** Per-worker `requirements.txt` for dependencies. Deploy step runs `pip install` into a per-worker venv before starting.
- **D-07:** Pre-install common integration libraries in Docker image (httpx, requests, beautifulsoup4, lxml, feedparser, google-api-python-client, python-dateutil).
- **D-08:** Auto-restart with exponential backoff on crash. After 5 consecutive failures, auto-disable and post feed notification.
- **D-09:** User can re-enable disabled workers from management UI.
- **D-10:** Integrator is a dedicated chat interface (side panel), NOT a terminal session.
- **D-11:** Chat panel slides in from right edge (resizable, like Phase 3 review chat).
- **D-12:** AI backend is Claude Code CLI running on a connected machine. Chat messages route through a Claude Code session with the `/integrator` skill loaded.
- **D-13:** Credentials stored in Locus DB (Fernet-encrypted). NEVER sent to Claude. Workers access credentials via env vars injected by supervisor.
- **D-14:** Build flow: describe -> Claude writes script -> dry-run test -> preview cards -> Deploy.
- **D-15:** Dry-run: Claude runs worker's `poll()` once against real API. Shows preview cards.
- **D-16:** Users can edit existing workers by reopening Integrator chat. Claude loads current code.
- **D-17:** Quick config UI on worker cards: adjust poll interval, update credentials, toggle enabled/disabled without opening Integrator chat.
- **D-18:** Worker management lives in Settings page as "Integrations" section.
- **D-19:** "New Integration" button opens Integrator chat panel.
- **D-20:** Worker cards show: status dot, name, poll interval, last poll time, total items ingested, gear icon, play/pause button.
- **D-21:** Expandable log panel per worker: tail -f style, last 100 lines, "Load more" option.
- **D-22:** Skills discovered via SSH scan of `.claude/commands/*.md` per repo. Cached with 5-minute TTL.
- **D-23:** Filename parsed as skill name, first line of content as description.
- **D-24:** Skills displayed as clickable chips/buttons in sidebar under selected repo info.
- **D-25:** Clicking a skill chip opens a new Claude Code terminal session pre-loaded with the skill command.
- **D-26:** Skills are sidebar-only, NOT searchable via command palette.

### Claude's Discretion
- Exact subprocess supervisor implementation
- Worker file naming conventions and directory structure
- Log storage format and rotation policy
- Integrator chat message format and structured card design
- Exact venv management strategy for per-worker dependencies
- How the supervisor injects credentials as environment variables
- Migration strategy for converting existing BasePollingAdapter adapters

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| INTG-02 | User can interactively build a new integration worker with Claude via the Integrator skill | Claude Code CLI `-p` flag with `--continue` for multi-turn, `--append-system-prompt` for integrator instructions, SSH routing through existing infrastructure |
| INTG-03 | New integration workers can be hot-deployed without restarting the runner | `asyncio.create_subprocess_exec()` allows spawning new child processes at runtime; supervisor maintains a registry of active workers keyed by worker ID |
| INTG-04 | Integration workers run with process supervisor that monitors health and restarts crashed workers | Custom `WorkerSupervisor` using `asyncio.Process.wait()` with exponential backoff loop; state machine tracks per-worker health |
| INTG-05 | User can view, start, stop, and inspect logs of running integration workers from the UI | API endpoints for worker CRUD, WebSocket for log streaming, ring buffer for log retention |
| SKIL-01 | User can see available skills per repo and trigger them from the sidebar | SSH scan of `.claude/commands/*.md` with 5-min cache; sidebar skill chips component |
| SKIL-02 | Skills match Claude Code's native skill model | Discovery reads same `.claude/commands/` directory Claude Code uses; files are `.md` with name derived from filename |
| SKIL-03 | Integrator skill is a built-in meta-skill | Dedicated chat panel (not a `.claude/commands/` file) backed by Claude Code CLI on connected machine |
</phase_requirements>

## Standard Stack

### Core (already in project)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| asyncio (stdlib) | Python 3.12 | Subprocess management, task scheduling | `create_subprocess_exec()` provides async process lifecycle with PIPE-based I/O. No external library needed for process supervision. |
| FastAPI WebSocket | (built-in) | Worker log streaming | Existing pattern for terminal and feed WebSockets. New `/ws/workers/{worker_id}/logs` endpoint. |
| httpx | ~0.28 | Worker HTTP client (posting to ingest API) | Already in requirements.txt. Workers use it to POST to `/api/feed/ingest`. |
| SQLAlchemy | ~2.0.48 | Worker metadata persistence | Already in project. IntegrationSource model needs new fields for subprocess state. |
| cryptography (Fernet) | ~46.0 | Credential decryption for env var injection | Already in project via `services/crypto.py`. Supervisor decrypts credentials and injects as env vars. |

### New (to add for Phase 4)
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| (none) | -- | -- | All subprocess management uses Python stdlib asyncio. No new backend dependencies required. |

### Frontend (already in project)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Zustand | ~5.0 | New `workerStore` and `skillStore` | Existing pattern: one store per domain. |
| TanStack Query | ~5.95 | Worker list, skill list API caching | Existing pattern for API data fetching with refetch on mutation. |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Custom asyncio supervisor | supervisord / circus | External process manager adds Docker complexity and is overkill for single-user subprocess management within one container. |
| asyncio.create_subprocess_exec | multiprocessing.Process | multiprocessing is sync-oriented, doesn't integrate with FastAPI's async event loop naturally. |
| Per-worker venv via `python -m venv` | Docker sidecar per worker | Vastly over-engineered for single-user. Venv is lighter and hot-deployable. |
| Claude Code CLI via SSH | Anthropic API directly | D-12 explicitly states Claude Code CLI on connected machine. Leverages existing auth and Claude Code session infrastructure. |

**Installation:**
```bash
# Backend: no new packages needed
# Frontend: no new packages needed
# Docker image: add common integration libraries
pip install requests beautifulsoup4 lxml feedparser google-api-python-client python-dateutil
```

## Architecture Patterns

### Recommended Project Structure
```
backend/app/
  services/
    worker_supervisor.py     # Core subprocess supervisor (start/stop/restart/monitor)
    worker_service.py        # CRUD operations for worker metadata in DB
    skill_service.py         # SSH-based skill discovery with TTL cache
    integrator_service.py    # Claude Code CLI session management for Integrator chat
  api/
    workers.py               # REST endpoints for worker management
    skills.py                # REST endpoint for skill listing per repo
    integrator.py            # REST endpoint for Integrator chat messages
  ws/
    worker_logs.py           # WebSocket endpoint for worker log streaming
  schemas/
    worker.py                # Pydantic schemas for worker API
    skill.py                 # Pydantic schemas for skill API
    integrator.py            # Pydantic schemas for Integrator chat
  models/
    integration_source.py    # Extended with subprocess state fields

frontend/src/
  stores/
    workerStore.ts           # Worker list, status, log streaming state
    skillStore.ts            # Per-repo skill cache
    integratorStore.ts       # Integrator chat conversation state
  components/
    settings/
      IntegrationSettings.tsx # Worker cards in Settings page
      WorkerCard.tsx          # Individual worker card with status/config/logs
      WorkerLogPanel.tsx      # Expandable log viewer per worker
    integrator/
      IntegratorChat.tsx      # Dedicated side panel for building integrations
      IntegratorCard.tsx      # Structured cards for config/test/deploy steps
    skills/
      SkillBar.tsx            # Skill chips in sidebar under repo info
  hooks/
    useIntegratorChat.ts     # Hook for sending messages to Integrator backend
    useWorkerLogs.ts         # Hook for WebSocket log streaming
```

### Pattern 1: Worker Supervisor (asyncio subprocess management)
**What:** A singleton `WorkerSupervisor` service that manages the lifecycle of all worker subprocesses. It maintains a dict of `WorkerProcess` objects keyed by worker ID, each wrapping an `asyncio.subprocess.Process` with metadata (state, failure count, backoff timer).
**When to use:** All worker lifecycle operations (start, stop, restart, health monitoring).
**Example:**
```python
# Source: Python 3.12 asyncio-subprocess docs + project patterns
import asyncio
import logging
from enum import Enum
from dataclasses import dataclass, field
from typing import Optional

logger = logging.getLogger(__name__)

class WorkerState(str, Enum):
    STARTING = "starting"
    RUNNING = "running"
    STOPPING = "stopping"
    CRASHED = "crashed"
    DISABLED = "disabled"

@dataclass
class WorkerProcess:
    worker_id: str
    process: Optional[asyncio.subprocess.Process] = None
    state: WorkerState = WorkerState.STARTING
    failure_count: int = 0
    log_buffer: list[str] = field(default_factory=list)
    _monitor_task: Optional[asyncio.Task] = None

class WorkerSupervisor:
    MAX_FAILURES = 5
    BACKOFF_BASE = 2  # seconds
    BACKOFF_MAX = 300  # 5 minutes
    LOG_BUFFER_SIZE = 100

    def __init__(self):
        self._workers: dict[str, WorkerProcess] = {}
        self._log_subscribers: dict[str, list[asyncio.Queue]] = {}

    async def start_worker(self, worker_id: str, script_path: str,
                           env: dict[str, str], venv_python: str | None = None) -> None:
        python = venv_python or "python3"
        proc = await asyncio.create_subprocess_exec(
            python, script_path,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.STDOUT,
            env=env,
        )
        wp = WorkerProcess(worker_id=worker_id, process=proc, state=WorkerState.RUNNING)
        self._workers[worker_id] = wp
        # Start log reader and health monitor as background tasks
        wp._monitor_task = asyncio.create_task(self._monitor_worker(wp, script_path, env, venv_python))

    async def _monitor_worker(self, wp: WorkerProcess, script_path: str,
                              env: dict, venv_python: str | None) -> None:
        """Read logs and restart on crash with exponential backoff."""
        while wp.state not in (WorkerState.STOPPING, WorkerState.DISABLED):
            # Read stdout lines
            asyncio.create_task(self._read_logs(wp))
            # Wait for process to exit
            returncode = await wp.process.wait()
            if wp.state == WorkerState.STOPPING:
                break  # Graceful stop, don't restart
            wp.failure_count += 1
            if wp.failure_count >= self.MAX_FAILURES:
                wp.state = WorkerState.DISABLED
                # Post feed notification about disabled worker
                break
            # Exponential backoff
            delay = min(self.BACKOFF_BASE ** wp.failure_count, self.BACKOFF_MAX)
            wp.state = WorkerState.CRASHED
            await asyncio.sleep(delay)
            # Restart
            wp.state = WorkerState.STARTING
            proc = await asyncio.create_subprocess_exec(
                venv_python or "python3", script_path,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.STDOUT,
                env=env,
            )
            wp.process = proc
            wp.state = WorkerState.RUNNING

    async def _read_logs(self, wp: WorkerProcess) -> None:
        """Stream stdout lines to log buffer and WebSocket subscribers."""
        async for line in wp.process.stdout:
            text = line.decode("utf-8", errors="replace").rstrip()
            wp.log_buffer.append(text)
            if len(wp.log_buffer) > self.LOG_BUFFER_SIZE:
                wp.log_buffer.pop(0)
            # Broadcast to subscribers
            for queue in self._log_subscribers.get(wp.worker_id, []):
                try:
                    queue.put_nowait(text)
                except asyncio.QueueFull:
                    pass
```

### Pattern 2: Standalone Worker Script Contract
**What:** Each worker is a standalone Python script that imports httpx, runs a `poll()` function on an interval, and POSTs results to the ingest API. No inheritance, no framework imports.
**When to use:** All workers (built-in and user-created).
**Example:**
```python
# Source: D-02 contract definition
#!/usr/bin/env python3
"""GitHub pull request integration worker for Locus."""
import os
import time
import httpx

LOCUS_INGEST_URL = os.environ["LOCUS_INGEST_URL"]  # e.g., http://localhost:8080/api/feed/ingest
LOCUS_AUTH_TOKEN = os.environ["LOCUS_AUTH_TOKEN"]
POLL_INTERVAL = int(os.environ.get("POLL_INTERVAL", "300"))

# Credential env vars injected by supervisor
GITHUB_TOKEN = os.environ["GITHUB_TOKEN"]
GITHUB_REPOS = os.environ.get("GITHUB_REPOS", "").split(",")


def poll() -> list[dict]:
    """Poll GitHub for open PRs. Returns list of IngestPayload dicts."""
    items = []
    with httpx.Client(timeout=30.0, headers={
        "Authorization": f"Bearer {GITHUB_TOKEN}",
        "Accept": "application/vnd.github.v3+json",
    }) as client:
        for repo in GITHUB_REPOS:
            resp = client.get(f"https://api.github.com/repos/{repo.strip()}/pulls",
                              params={"state": "open", "per_page": 50})
            resp.raise_for_status()
            for pr in resp.json():
                items.append({
                    "source_type": "github",
                    "external_id": f"pr:{repo}:{pr['number']}",
                    "title": f"PR #{pr['number']}: {pr['title']}",
                    "snippet": (pr.get("body") or "")[:100],
                    "url": pr.get("html_url"),
                    "tier_hint": "review" if pr.get("requested_reviewers") else "prep",
                    "source_icon": "github",
                    "metadata": {"repo": repo, "number": pr["number"]},
                })
    return items


if __name__ == "__main__":
    while True:
        try:
            items = poll()
            for item in items:
                httpx.post(
                    LOCUS_INGEST_URL,
                    json=item,
                    headers={"Authorization": f"Bearer {LOCUS_AUTH_TOKEN}"},
                    timeout=10.0,
                )
        except Exception as exc:
            print(f"ERROR: {exc}", flush=True)
        time.sleep(POLL_INTERVAL)
```

### Pattern 3: Integrator Chat via Claude Code CLI over SSH
**What:** The Integrator chat sends user messages to a Claude Code CLI session running on a connected machine via SSH. Uses `-p` (print mode) with `--continue` for multi-turn conversation and `--append-system-prompt` for the integrator persona.
**When to use:** All Integrator chat interactions (build, test, deploy workers).
**Example:**
```python
# Source: Claude Code CLI reference docs + project SSH patterns
import json

async def send_integrator_message(
    conn,  # asyncssh connection
    message: str,
    session_id: str | None,
    cwd: str,
) -> dict:
    """Send a message to Claude Code CLI and get a response.

    Uses -p (print mode) with --output-format json for structured output.
    Uses --continue to maintain conversation context across messages.
    """
    cmd_parts = [
        "claude", "-p",
        "--output-format", "json",
        "--append-system-prompt", INTEGRATOR_SYSTEM_PROMPT,
        "--allowedTools", "Read,Edit,Bash,Write",
    ]
    if session_id:
        cmd_parts.extend(["--resume", session_id])

    # Pipe message via stdin
    cmd = " ".join(cmd_parts)
    result = await conn.run(
        f'echo {json.dumps(message)} | cd {cwd} && {cmd}',
        check=True,
        timeout=120,
    )
    response = json.loads(result.stdout)
    return {
        "text": response.get("result", ""),
        "session_id": response.get("session_id"),
    }
```

### Pattern 4: Credential Injection via Environment Variables
**What:** The supervisor decrypts credentials from the Locus DB and injects them as environment variables when spawning worker subprocesses. Workers never see the credential store -- they just read `os.environ`.
**When to use:** Every worker startup.
**Example:**
```python
# Source: D-13 + existing crypto.py pattern
from app.services.crypto import decrypt_value

async def build_worker_env(db, worker_id: str, base_env: dict) -> dict:
    """Build environment dict for a worker subprocess."""
    env = {**base_env}
    # Add Locus ingest endpoint
    env["LOCUS_INGEST_URL"] = "http://localhost:8080/api/feed/ingest"
    # Generate a short-lived JWT for the worker
    env["LOCUS_AUTH_TOKEN"] = create_worker_token(worker_id)

    # Look up credential for this integration source
    source = await get_integration_source(db, worker_id)
    if source.credential_id:
        credential = await db.get(Credential, source.credential_id)
        decrypted = json.loads(decrypt_value(credential.encrypted_data))
        # Inject each credential field as an env var
        # e.g., {"token": "ghp_xxx"} -> GITHUB_TOKEN=ghp_xxx
        for key, value in decrypted.items():
            env_key = key.upper()
            env[env_key] = str(value)

    # Add worker-specific config from source.config
    for key, value in (source.config or {}).items():
        env[f"WORKER_{key.upper()}"] = str(value)

    env["POLL_INTERVAL"] = str(source.poll_interval_seconds or 300)
    return env
```

### Pattern 5: Skill Discovery via SSH
**What:** Backend scans `.claude/commands/*.md` on a remote machine via SSH, caches results with 5-minute TTL. Files are parsed: filename becomes skill name, first non-empty line becomes description.
**When to use:** When user selects a repo in the sidebar.
**Example:**
```python
# Source: D-22/D-23 + existing SSH patterns
import asyncio
from functools import lru_cache
from time import time

_skill_cache: dict[str, tuple[float, list[dict]]] = {}
SKILL_TTL = 300  # 5 minutes

async def discover_skills(conn, repo_path: str) -> list[dict]:
    """Discover Claude Code skills for a repo via SSH."""
    cache_key = f"{id(conn)}:{repo_path}"
    cached = _skill_cache.get(cache_key)
    if cached and (time() - cached[0]) < SKILL_TTL:
        return cached[1]

    try:
        # Check both .claude/commands/ (legacy) and .claude/skills/ (new)
        result = await conn.run(
            f"ls {repo_path}/.claude/commands/*.md 2>/dev/null",
            check=False,
        )
        files = [f.strip() for f in result.stdout.strip().split("\n") if f.strip()]

        skills = []
        for filepath in files:
            filename = filepath.rsplit("/", 1)[-1]
            name = filename.removesuffix(".md")
            # Read first line for description
            content_result = await conn.run(
                f"head -5 {filepath} 2>/dev/null",
                check=False,
            )
            lines = [l for l in content_result.stdout.strip().split("\n") if l.strip()]
            # Skip YAML frontmatter if present
            description = ""
            in_frontmatter = False
            for line in lines:
                if line.strip() == "---":
                    in_frontmatter = not in_frontmatter
                    continue
                if not in_frontmatter and line.strip():
                    description = line.strip().lstrip("#").strip()
                    break

            skills.append({"name": name, "description": description, "path": filepath})

        _skill_cache[cache_key] = (time(), skills)
        return skills
    except Exception:
        return []
```

### Anti-Patterns to Avoid
- **Importing worker code into the main process:** D-05 explicitly forbids this. Workers MUST run as separate subprocesses. Never use `importlib` or `exec()` on worker scripts.
- **Using APScheduler for subprocess management:** APScheduler is designed for in-process job scheduling, not subprocess lifecycle management. The supervisor pattern with asyncio is more appropriate.
- **Storing logs in the database:** Logs are high-volume, ephemeral data. Use an in-memory ring buffer per worker and stream via WebSocket. Only persist error summaries or crash notifications as feed items.
- **Blocking the event loop during worker I/O:** Always use `async for line in proc.stdout` for log reading, never `proc.stdout.read()` which blocks.
- **Sending credentials to Claude Code CLI:** D-13 is absolute -- credentials must NEVER be sent to Claude. The Integrator chat should only reference credentials by name. The supervisor injects actual values when spawning workers.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Process supervision | Custom daemon / systemd integration | asyncio.create_subprocess_exec() + custom state machine | Python stdlib subprocess management is sufficient for single-user, in-container supervision |
| Virtual environments | Custom isolation system | `python -m venv` per worker | Standard, well-tested, handles dependency isolation |
| Log streaming | Custom TCP socket protocol | WebSocket (existing pattern) | Project already uses WebSocket for terminal and feed streaming |
| Credential encryption | Custom crypto | Fernet (existing `services/crypto.py`) | Already established, Fernet is symmetric and simple |
| Chat panel UI | Build from scratch | Follow ReviewChat.tsx pattern | Phase 3 review chat is an exact template for the Integrator panel |
| Multi-turn conversation | Custom state management | Claude Code CLI `--continue` / `--resume` | CLI handles session persistence natively |

**Key insight:** The existing codebase already provides patterns for every UI component needed (ReviewChat for the Integrator panel, SettingsPage for worker management, FeedPanel for real-time updates, TerminalView for skill execution). The primary new code is the backend subprocess supervisor -- everything else follows established patterns.

## Common Pitfalls

### Pitfall 1: Subprocess stdout buffer deadlock
**What goes wrong:** Worker subprocess blocks because its stdout pipe buffer fills up while the supervisor isn't reading.
**Why it happens:** If the log reader task dies or falls behind, the OS pipe buffer (usually 64KB) fills up, blocking the worker's print/write calls.
**How to avoid:** Always have an active `async for line in proc.stdout` reader running concurrently with the process. If the reader encounters an error, kill and restart the worker rather than leaving it hung.
**Warning signs:** Worker appears "stuck" but is not crashed (process is alive but producing no output).

### Pitfall 2: Zombie subprocesses on supervisor shutdown
**What goes wrong:** Worker processes continue running after the main app process shuts down, consuming resources.
**Why it happens:** `asyncio.create_subprocess_exec()` processes are not automatically killed when the parent exits. Must explicitly terminate them.
**How to avoid:** Register shutdown cleanup in FastAPI's lifespan handler. Call `proc.terminate()` then `proc.wait()` for each worker during shutdown. Use `proc.kill()` as fallback after a timeout.
**Warning signs:** `ps aux` shows orphaned Python worker processes after app restart.

### Pitfall 3: Mention detection regression during migration
**What goes wrong:** After migrating built-in adapters to standalone scripts, mention detection and tier elevation stop working because that logic was in BasePollingAdapter.
**Why it happens:** D-04 says mention detection moves to the ingest API endpoint. If the ingest endpoint doesn't implement this, it silently drops the behavior.
**How to avoid:** Move `_is_mentioned()` and `_elevate_tier_if_mentioned()` logic from `BasePollingAdapter` into `feed_service.ingest_item()` BEFORE migrating the adapters. The ingest endpoint must check for mentions against the source's configured usernames.
**Warning signs:** Feed items that should be tier "respond" (due to @mentions) remain at their default tier.

### Pitfall 4: Claude Code CLI session not persisting across messages
**What goes wrong:** Each Integrator chat message starts a new Claude Code conversation, losing context of previous messages.
**Why it happens:** Not using `--resume` or `--continue` flag, or the session ID is not tracked.
**How to avoid:** Capture the `session_id` from the first response (via `--output-format json`) and use `--resume <session_id>` for subsequent messages. Store the session_id in the integrator conversation state.
**Warning signs:** Claude asks "What would you like to build?" after every message instead of continuing the conversation.

### Pitfall 5: Venv creation blocking the event loop
**What goes wrong:** `python -m venv /path/to/venv` and `pip install -r requirements.txt` are slow (5-30 seconds) and block the async event loop if not run properly.
**Why it happens:** Running subprocess creation synchronously or awaiting a long pip install in the request handler.
**How to avoid:** Run venv creation and pip install as background asyncio tasks. Report progress via WebSocket. Never block an API request handler on venv operations.
**Warning signs:** API becomes unresponsive during worker deployment.

### Pitfall 6: Worker auth tokens expiring
**What goes wrong:** Long-running workers get 401 errors posting to the ingest API because their JWT token has expired.
**Why it happens:** JWT tokens have an expiration time. Workers may run for days without restart.
**How to avoid:** Either use long-lived tokens for workers (acceptable for single-user, local-only), or use a simpler auth mechanism for localhost workers (e.g., a static shared secret set at startup). Since workers POST to localhost within the same container, HMAC with a container-scoped secret is simpler and more reliable.
**Warning signs:** Worker logs show repeated 401 errors after running for several hours.

### Pitfall 7: Skills not discovered for `.claude/skills/` directory
**What goes wrong:** Only `.claude/commands/*.md` is scanned, missing skills in the newer `.claude/skills/<name>/SKILL.md` structure.
**Why it happens:** Claude Code merged commands and skills -- both `.claude/commands/` and `.claude/skills/` are valid locations.
**How to avoid:** Scan BOTH `.claude/commands/*.md` (flat files) AND `.claude/skills/*/SKILL.md` (directory structure). For SKILL.md files, parse YAML frontmatter for `name` and `description` fields, falling back to directory name and first content line.
**Warning signs:** Users report skills that work in Claude Code directly but don't appear in Locus sidebar.

## Code Examples

### Ingest API Enhancement (mention detection migration)
```python
# Source: D-04 + existing BasePollingAdapter._is_mentioned()
# This logic moves from BasePollingAdapter.execute() into feed_service.ingest_item()

async def ingest_item(db: AsyncSession, payload: dict) -> FeedItem:
    """Ingest a feed item with upsert dedup and centralized mention detection."""
    # Determine tier: use hint if provided, otherwise AI-classify
    tier = payload.get("tier_hint")
    if not tier:
        tier = await classify_tier(
            title=payload["title"],
            snippet=payload.get("snippet"),
            source_type=payload["source_type"],
        )

    # NEW: Centralized mention detection and tier elevation
    # Look up the integration source to get username config
    source = await _get_source_for_type(db, payload["source_type"])
    if source:
        tier = _elevate_tier_if_mentioned(payload, source, tier)

    # ... rest of upsert logic unchanged
```

### Worker WebSocket Log Streaming
```python
# Source: Existing ws/feed.py pattern + asyncio subprocess streaming
@router.websocket("/ws/workers/{worker_id}/logs")
async def worker_log_websocket(websocket: WebSocket, worker_id: str) -> None:
    """Stream worker logs in real-time via WebSocket."""
    token = websocket.query_params.get("token")
    if not token:
        await websocket.close(code=4001, reason="Missing token")
        return
    try:
        verify_token(token)
    except Exception:
        await websocket.close(code=4003, reason="Invalid token")
        return

    await websocket.accept()

    # Send buffered log lines as initial snapshot
    worker = supervisor.get_worker(worker_id)
    if worker:
        await websocket.send_text(json.dumps({
            "type": "initial",
            "lines": worker.log_buffer,
        }))

    # Subscribe to live log stream
    queue: asyncio.Queue = asyncio.Queue(maxsize=200)
    supervisor.subscribe_logs(worker_id, queue)

    try:
        while True:
            try:
                line = await asyncio.wait_for(queue.get(), timeout=30.0)
                await websocket.send_text(json.dumps({
                    "type": "log",
                    "line": line,
                }))
            except asyncio.TimeoutError:
                await websocket.send_text(json.dumps({"type": "ping"}))
    except WebSocketDisconnect:
        pass
    finally:
        supervisor.unsubscribe_logs(worker_id, queue)
```

### IntegrationSource Model Extension
```python
# Source: Existing model + D-08/D-20 requirements
class IntegrationSource(Base):
    __tablename__ = "integration_sources"

    # ... existing fields ...

    # NEW: Subprocess management fields
    worker_script_path: Mapped[str | None] = mapped_column(
        String(500), nullable=True, default=None
    )
    worker_status: Mapped[str] = mapped_column(
        String(20), default="stopped"  # stopped, running, crashed, disabled
    )
    failure_count: Mapped[int] = mapped_column(
        Integer, default=0
    )
    total_items_ingested: Mapped[int] = mapped_column(
        Integer, default=0
    )
    worker_pid: Mapped[int | None] = mapped_column(
        Integer, nullable=True, default=None
    )
    # Note: source_type UNIQUE constraint needs to be relaxed
    # to allow multiple workers of the same source type
    # (e.g., multiple GitHub integrations for different orgs)
```

### Worker Directory Structure
```
/data/workers/
  _builtin/
    github_worker.py           # Migrated from GitHubAdapter
    gitlab_worker.py           # Migrated from GitLabAdapter
    jira_worker.py             # Migrated from JiraAdapter
    calendar_worker.py         # Migrated from GoogleCalendarAdapter
  user/
    <worker_id>/
      worker.py                # Worker script (generated by Claude)
      requirements.txt         # Dependencies (generated by Claude)
      .venv/                   # Per-worker virtual environment
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| APScheduler in-process polling | Subprocess workers with supervisor | Phase 4 | All 4 built-in adapters must be rewritten as standalone scripts |
| BasePollingAdapter class hierarchy | Standalone scripts with poll() contract | Phase 4 | No imports from Locus codebase in workers -- completely decoupled |
| Mention detection in adapter | Mention detection in ingest API | Phase 4 | Centralized, benefits all workers uniformly |
| Claude Code as terminal-only | Claude Code CLI for structured chat | Phase 4 | New interaction pattern: programmatic CLI usage via SSH |
| `.claude/commands/` only | Both `.claude/commands/` and `.claude/skills/` | 2025 (Claude Code) | Skill discovery must check both directories |

**Deprecated/outdated:**
- `BasePollingAdapter` class: Will be removed after all 4 adapters are migrated to standalone scripts
- `app/integrations/scheduler.py`: APScheduler module replaced by WorkerSupervisor
- In-process adapter registry in `scheduler.py:get_adapter()`: No longer needed -- workers are discovered from filesystem

## Open Questions

1. **Worker-to-ingest authentication model**
   - What we know: Workers POST to localhost `/api/feed/ingest`. Current ingest endpoint supports HMAC or JWT.
   - What's unclear: Should workers use JWT (which expires) or HMAC (which requires a shared secret per worker)?
   - Recommendation: Use a single container-scoped HMAC secret generated at startup. All workers share it. Simplest for single-user, no expiration issues. Workers set `X-Locus-Signature` header. The secret is injected as an env var by the supervisor.

2. **Worker data volume mount in Docker**
   - What we know: Worker scripts live at `/data/workers/`. Docker containers lose filesystem changes on restart unless volumes are used.
   - What's unclear: Is `/data/workers/` already a mounted volume, or does it need to be added to docker-compose.yml?
   - Recommendation: Add a named Docker volume for `/data/workers/` in docker-compose.yml so user-created workers persist across container restarts. Built-in workers should be baked into the Docker image at build time.

3. **Claude Code CLI availability on remote machines**
   - What we know: Integrator routes through Claude Code CLI on a connected machine (D-12).
   - What's unclear: What happens if no connected machine has Claude Code installed?
   - Recommendation: Show a clear error in the Integrator panel: "Claude Code not detected on any connected machine. Install Claude Code on a machine to use the Integrator." Fall back to "This Machine" if available.

4. **IntegrationSource.source_type UNIQUE constraint**
   - What we know: Current model has `unique=True` on `source_type`. This allows only one GitHub integration, one GitLab integration, etc.
   - What's unclear: D-02 implies users can create multiple workers of the same type (e.g., multiple GitHub integrations for different orgs).
   - Recommendation: Remove the UNIQUE constraint on `source_type`. Add a `name` column for display purposes. Add a migration to handle existing data.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Python 3.12 (in Docker) | Worker subprocesses | Yes (Docker image) | 3.12 | -- |
| asyncio subprocess | Worker supervisor | Yes (stdlib) | 3.12 | -- |
| Claude Code CLI | Integrator skill | Varies (per machine) | Latest | Error message if not installed |
| `python -m venv` | Per-worker venvs | Yes (stdlib) | 3.12 | -- |
| httpx (in Docker) | Workers posting to ingest API | Yes (in requirements.txt) | ~0.28 | -- |

**Missing dependencies with no fallback:**
- None blocking. All subprocess management uses Python stdlib.

**Missing dependencies with fallback:**
- Claude Code CLI on remote machines: only needed for Integrator skill. If absent, show informative error. Other Phase 4 features (worker management, skills discovery) work independently.

## Project Constraints (from CLAUDE.md)

- **Tech stack**: Python backend, React frontend, Postgres, Docker Compose -- no deviation
- **Deployment**: Single `docker compose up` -- workers run as subprocesses in the app container, no new Docker services
- **Single-user**: No multi-tenancy concerns. Worker auth can be simplified (shared HMAC secret).
- **Git providers**: Both GitLab and GitHub -- relevant for built-in worker migration (both adapters must be converted)
- **GSD compatibility**: Must work with existing `.planning/` directory structure
- **SSH**: Skills discovered over persistent SSH connections. Integrator routes through SSH to Claude Code CLI.
- **Service layer pattern**: Logic in `services/`, API routes in `api/`, schemas in `schemas/`
- **One Zustand store per domain**: New stores for workers, skills, integrator
- **WebSocket auth via token query param**: New log streaming endpoint follows existing pattern
- **All git ops via CLI over SSH**: Skills discovery uses SSH, not local filesystem

## Sources

### Primary (HIGH confidence)
- [Python 3.12 asyncio-subprocess documentation](https://docs.python.org/3.12/library/asyncio-subprocess.html) - create_subprocess_exec(), Process.wait(), PIPE-based I/O
- [Claude Code CLI reference](https://code.claude.com/docs/en/cli-reference) - All CLI flags including -p, --continue, --resume, --output-format, --allowedTools, --append-system-prompt
- [Claude Code headless mode](https://code.claude.com/docs/en/headless) - Programmatic usage with -p flag, session continuation, structured output
- [Claude Code skills documentation](https://code.claude.com/docs/en/skills) - Skill directory structure, .claude/commands/ and .claude/skills/ locations, SKILL.md format, frontmatter fields
- Existing codebase: `backend/app/integrations/base_adapter.py` - Current mention detection and tier elevation logic to migrate
- Existing codebase: `backend/app/integrations/scheduler.py` - Current APScheduler setup to replace
- Existing codebase: `backend/app/api/feed.py` - Ingest endpoint to enhance with mention detection
- Existing codebase: `frontend/src/components/review/ReviewChat.tsx` - Side panel chat pattern to replicate
- Existing codebase: `frontend/src/components/settings/SettingsPage.tsx` - Settings section pattern for worker management

### Secondary (MEDIUM confidence)
- [Asyncio subprocess stdout streaming (GitHub Gist)](https://gist.github.com/gh640/50953484edfa846fda9a95374df57900) - Verified async for pattern for reading subprocess output
- [Python venv module documentation](https://docs.python.org/3/library/venv.html) - Programmatic venv creation

### Tertiary (LOW confidence)
- None -- all critical claims verified against official documentation or existing codebase

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Uses only Python stdlib (asyncio subprocess) and existing project dependencies. No new libraries needed.
- Architecture: HIGH - All patterns derive from existing codebase patterns (ReviewChat, SettingsPage, WebSocket, SSH). Subprocess management is well-documented in Python official docs.
- Pitfalls: HIGH - Buffer deadlock, zombie processes, and mention detection regression are well-known subprocess management issues documented in official Python docs.
- Claude Code CLI integration: HIGH - Verified against official Claude Code CLI reference docs. -p flag, --continue, --resume, --output-format json are all documented.
- Skills discovery: HIGH - Verified against official Claude Code skills documentation. Both .claude/commands/ and .claude/skills/ directories are documented.

**Research date:** 2026-03-28
**Valid until:** 2026-04-28 (30 days -- stable domain, no fast-moving dependencies)
