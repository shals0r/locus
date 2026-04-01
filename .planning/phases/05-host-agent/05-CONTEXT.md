# Phase 5: Host Agent - Context

**Gathered:** 2026-04-01
**Status:** Ready for planning

<domain>
## Phase Boundary

Deliver a lightweight, cross-platform agent process that runs on every connected machine (local host and remotes), bridging Docker-to-host and Locus-to-machine communication. SSH becomes the bootstrap transport only — used to deploy and manage the agent, which then handles all ongoing operations.

**Scope change from original roadmap:** The agent is not just for "This Machine" (local host). It is deployed to ALL machines, similar to VS Code's SSH remote server. This is a universal agent architecture.

**Phased delivery:**
- **Phase 5a (Core Agent):** Agent process, deploy pipeline, terminals, tmux/session management, Claude detection, session persistence. This is the must-have that makes "This Machine" and all remote machines work through the agent.
- **Phase 5b (Performance APIs):** File operations API, git operations API, event pushing via filesystem watchers. These are speed optimizations — everything works via SSH exec today, just slower. Ships after 5a since the agent infrastructure is already in place.

</domain>

<decisions>
## Implementation Decisions

### Communication Protocol
- **D-01:** Agent exposes HTTP REST + WebSocket API on a single port (default 7700, configurable via LOCUS_AGENT_PORT env var)
- **D-02:** Shared secret authentication — agent generates a token on first start, stored at ~/.locus-agent/agent.token. Docker mounts the local token file; remote tokens are retrieved during deployment.
- **D-03:** Terminal I/O uses WebSocket upgrade on the same port (/ws/terminal/{session_id}), not a separate port
- **D-04:** Agent exposes a /ws/logs streaming endpoint for diagnostics — Locus can show agent health/logs in UI
- **D-05:** Agent written in Python + FastAPI — same stack as Locus backend, shared schemas and patterns
- **D-06:** Docker container discovers agent via environment variable (LOCUS_AGENT_URL=http://host.docker.internal:7700)

### Agent API Surface (Phase 5b — ships after core agent)
- **D-07:** Full file operations API — read, write, list directory, stat, search (ripgrep). Git sidebar, file tree, and Monaco editor talk directly to agent instead of SSH exec.
- **D-08:** Full git operations API — status, diff, branch, pull, push. Runs git commands locally on the machine. Much faster than SSH exec per-command.
- **D-09:** Claude detection endpoint — agent detects Claude Code sessions via tmux pane scanning + marker files
- **D-10:** tmux session management endpoints — list, create, attach, detach
- **D-11:** Health endpoint with version reporting — used for auto-update detection

### Agent Lifecycle & Packaging
- **D-12:** Universal agent — deployed to ALL machines, not just local host. SSH is the bootstrap transport only.
- **D-13:** Auto-deploy via SCP + SSH exec on first connect: probe :7700, if no agent, upload tarball, extract, start. Same flow for all machines including Windows.
- **D-14:** Agent installs to ~/.locus-agent/ on each machine (same pattern as ~/.vscode-server/)
- **D-15:** Agent packaged as a Python zipapp (.pyz) using shiv — single self-contained file that runs with any compatible Python 3.12+ interpreter. All pure-Python deps (uvicorn, fastapi) are bundled inside. For the one native dep (pywinpty on Windows), the agent pip-installs just that package into ~/.locus-agent/venv/ on first run. This avoids the portability nightmare of shipping pre-built virtualenvs across platforms.
- **D-16:** One .pyz file per platform (linux-x64, darwin-arm64, win-x64) — ~2-5MB each. Docker image bundles all three. Deploy logic detects remote OS via SSH and sends correct file.
- **D-17:** Auto-update on version mismatch — agent reports version via /health, Locus re-deploys automatically if versions differ. Zero user action.
- **D-18:** SSH connection kept alive as fallback control channel — if agent crashes, Locus can restart it via SSH. Also used for agent updates.
- **D-19:** Minimal CLI on each machine: `locus-agent status`, `locus-agent stop`, `locus-agent logs` for manual debugging.
- **D-20:** Local host agent: Docker entrypoint extracts agent to a host-mounted volume and starts it automatically on docker compose up. Zero user setup.

### Session Persistence
- **D-21:** Unix: agent proxies to system tmux. Creates sessions in a "locus-" prefixed group. User can manually attach via `tmux attach` outside Locus.
- **D-22:** Windows: agent manages sessions directly with its own process pool (no tmux available).
- **D-23:** Scrollback: tmux scrollback on Unix (no agent-side duplication), agent-side 64KB ring buffer on Windows only.
- **D-24:** Agent restart survival: Unix — tmux sessions survive, agent re-discovers locus-* sessions on restart. Windows — sessions do not survive agent crashes (no tmux equivalent). UI shows "Session ended — agent restarted" and user opens a new terminal. Windows users who need crash survival should use WSL + tmux (agent supports that path automatically).
- **D-25:** Hybrid event model: agent pushes state changes (file changes, git status, Claude sessions) via filesystem watchers (inotify/FSEvents/ReadDirectoryChanges) as best-effort. Locus can always call GET endpoints to refresh on demand. If watchers hit limits or fail silently, nothing breaks — UI updates on next manual action or periodic heartbeat. Graceful degradation, not hard dependency on watchers.

### Windows Support
- **D-26:** Full Windows support in v1 — not deferred.
- **D-27:** Default shell on Windows: PowerShell. Users can switch to cmd or WSL bash from within a session.
- **D-28:** PTY on Windows via ConPTY (pywinpty package) — full color, mouse, resize support. Same API Windows Terminal and VS Code use.
- **D-29:** Same SCP + SSH exec deploy flow on Windows. Requires OpenSSH Server (built into Windows 10+) and Python 3.12+.

### Claude's Discretion
- Agent startup timeout and retry logic
- Filesystem watcher debounce intervals and fallback heartbeat frequency
- Zipapp build tooling (shiv vs zipapp stdlib vs custom)
- Agent process supervision details (PID file management, signal handling)
- Scrollback buffer size on Windows (64KB default, can tune)
- Exact split of work between Phase 5a and 5b plans

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Existing Local Machine Implementation (being replaced/upgraded)
- `backend/app/local/manager.py` — Current LocalMachineManager with is_usable, Docker detection, SSH-to-host fallback
- `backend/app/local/terminal.py` — LocalTerminalProcess PTY wrapper (Unix-only currently)
- `backend/app/local/tmux.py` — Local tmux commands via subprocess
- `backend/app/services/machine_registry.py` — Unified machine routing (local vs remote)

### Terminal & Session Patterns
- `backend/app/ws/terminal.py` — WebSocket handler + SessionProcess pool (reconnect, scrollback buffer pattern)
- `backend/app/ssh/terminal.py` — SSH PTY creation (will be replaced by agent API calls)

### Claude Detection
- `backend/app/services/claude.py` — Claude session detection (tmux scanning + marker file approach)

### Docker Configuration
- `docker-compose.yml` — Current host.docker.internal setup, volume mounts, env vars

### Technology Stack
- `CLAUDE.md` §Recommended Stack — AsyncSSH, FastAPI, xterm.js choices and rationale

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **SessionProcess pool** (`ws/terminal.py`): Pattern for long-lived terminal sessions that survive WebSocket disconnects — agent will implement similar internally
- **Machine registry** (`services/machine_registry.py`): Routing abstraction that currently dispatches to SSHManager or LocalMachineManager — will be updated to dispatch to agent API client
- **Claude detection logic** (`services/claude.py`): tmux pane scanning + marker file approach — will move into the agent

### Established Patterns
- **Transport abstraction**: LocalMachineManager already mirrors SSHManager interface. Agent client will become a third transport.
- **WebSocket auth**: Token query param pattern used throughout Locus
- **Binary WebSocket**: Raw bytes for terminal I/O, text frames for control messages

### Integration Points
- **machine_registry.py**: Must be updated to route through agent HTTP client instead of SSH exec
- **ws/terminal.py**: Must proxy to agent's /ws/terminal/ instead of creating SSH channels or local PTY
- **Docker Compose**: Must add volume mount for local agent extraction, LOCUS_AGENT_URL env var
- **SSH connection flow**: Must add agent deployment step after successful SSH connect
- **All git operations** (services/git_service.py): Must route through agent /git/* endpoints
- **File operations** (services/file_service.py): Must route through agent /files/* endpoints

</code_context>

<specifics>
## Specific Ideas

- VS Code's SSH remote server is the reference model — auto-deploy, invisible to user, manages everything on the remote
- Zero setup is non-negotiable — user adds a machine, everything else happens automatically
- Agent .pyz must be self-contained (zipapp with bundled deps) so it works on airgapped machines with no internet (only exception: pywinpty on Windows, pip-installed once on first run)
- SSH becomes bootstrap-only — fast path is always through the agent's HTTP/WS API
- Don't over-engineer Windows session survival — be honest that sessions don't survive crashes without tmux. WSL is the answer for Windows users who need that.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 05-host-agent*
*Context gathered: 2026-04-01*
