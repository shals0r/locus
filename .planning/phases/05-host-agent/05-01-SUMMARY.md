---
phase: 05-host-agent
plan: 01
subsystem: agent
tags: [fastapi, pydantic-settings, shiv, zipapp, cli, auth]

requires: []
provides:
  - "Agent Python package skeleton with FastAPI app factory"
  - "Bearer token auth for HTTP and WebSocket endpoints"
  - "Health endpoint with version, uptime, platform info"
  - "CLI with start/stop/status/logs subcommands"
  - "Secure token generation with 0o600 file permissions"
  - "Shiv build script for .pyz zipapp packaging"
affects: [05-host-agent]

tech-stack:
  added: [fastapi, pydantic-settings, uvicorn, shiv]
  patterns: [agent-app-factory, bearer-token-auth, pydantic-settings-config, pid-file-management]

key-files:
  created:
    - agent/locus_agent/__init__.py
    - agent/locus_agent/app.py
    - agent/locus_agent/auth.py
    - agent/locus_agent/config.py
    - agent/locus_agent/cli.py
    - agent/locus_agent/__main__.py
    - agent/locus_agent/api/__init__.py
    - agent/locus_agent/api/health.py
    - agent/pyproject.toml
    - agent/requirements.txt
    - agent/build.sh
  modified: []

key-decisions:
  - "AgentSettings uses LOCUS_AGENT_ env prefix matching backend LOCUS_ pattern"
  - "Token generated with secrets.token_urlsafe(32) and stored with os.open 0o600"
  - "Health endpoint has no auth dependency for monitoring accessibility"
  - "CLI uses argparse (stdlib) to avoid extra dependencies in zipapp"

patterns-established:
  - "Agent app factory: create_app() returns configured FastAPI instance"
  - "Agent auth: verify_token for HTTP (Depends), verify_ws_token for WebSocket (query param)"
  - "Agent config: pydantic-settings with LOCUS_AGENT_ prefix and ~/.locus-agent dir"

requirements-completed: [AGENT-01, AGENT-06]

duration: 2min
completed: 2026-04-01
---

# Phase 05 Plan 01: Agent Package Skeleton Summary

**FastAPI agent package with bearer token auth, health endpoint, CLI (start/stop/status/logs), and shiv build script**

## Performance

- **Duration:** 2 min
- **Started:** 2026-04-01T11:29:31Z
- **Completed:** 2026-04-01T11:31:45Z
- **Tasks:** 2
- **Files modified:** 11

## Accomplishments
- Agent Python package with FastAPI app factory and lifespan management
- Bearer token authentication for HTTP (Authorization header) and WebSocket (query param)
- Health endpoint returning version, uptime, platform, hostname without auth
- CLI with argparse subcommands: start (with --daemon), stop, status, logs
- Secure token generation using secrets.token_urlsafe with 0o600 file permissions
- Shiv build script for .pyz zipapp packaging

## Task Commits

Each task was committed atomically:

1. **Task 1: Agent package skeleton with FastAPI app, auth, config, and health endpoint** - `f39dd8c` (feat)
2. **Task 2: CLI entry point, token management, PID file, build script, and pyproject.toml** - `91d79fa` (feat)

## Files Created/Modified
- `agent/locus_agent/__init__.py` - Package init with version
- `agent/locus_agent/app.py` - FastAPI app factory with lifespan
- `agent/locus_agent/auth.py` - Bearer token verification for HTTP and WebSocket
- `agent/locus_agent/config.py` - AgentSettings with pydantic-settings
- `agent/locus_agent/cli.py` - CLI commands: start, stop, status, logs with PID/token management
- `agent/locus_agent/__main__.py` - argparse entry point dispatching to CLI commands
- `agent/locus_agent/api/__init__.py` - API package init
- `agent/locus_agent/api/health.py` - Health endpoint with version, uptime, platform
- `agent/pyproject.toml` - Package metadata with setuptools backend
- `agent/requirements.txt` - Pure-Python dependencies (no C extensions)
- `agent/build.sh` - Shiv build script for .pyz zipapp

## Decisions Made
- AgentSettings uses LOCUS_AGENT_ env prefix, consistent with backend LOCUS_ pattern
- Token generated with secrets.token_urlsafe(32) and stored via os.open with 0o600 permissions
- Health endpoint has no auth dependency so it remains accessible for monitoring
- CLI uses argparse (stdlib) to avoid adding extra dependencies to the zipapp

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Installed fastapi and pydantic-settings system-wide**
- **Found during:** Task 1 verification
- **Issue:** Python packages not installed on host, import verification failed
- **Fix:** Installed via pip3 --break-system-packages
- **Verification:** All imports succeed after installation

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Minor -- system package needed for verification only.

## Issues Encountered
None beyond the pip installation noted above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Agent package ready for PTY/terminal session management (Plan 02)
- Auth module ready for WebSocket token verification (Plan 03)
- Build script ready for shiv packaging (Plan 06)

---
*Phase: 05-host-agent*
*Completed: 2026-04-01*
