---
phase: 05-host-agent
plan: 02
subsystem: terminal
tags: [pty, tmux, conpty, websocket, fastapi, asyncio]

requires:
  - phase: 05-host-agent-01
    provides: "Agent package skeleton with FastAPI app, auth, config"
provides:
  - "Unix PTY + tmux terminal session manager"
  - "Windows ConPTY terminal session manager"
  - "Cross-platform SessionPool with background read loops"
  - "WebSocket endpoint for terminal I/O (/ws/terminal/{session_id})"
  - "WebSocket endpoint for log streaming (/ws/logs)"
  - "REST endpoints for terminal CRUD (POST/DELETE/GET /terminal)"
affects: [05-host-agent-03, 05-host-agent-04, 05-host-agent-05]

tech-stack:
  added: [pty, fcntl, termios, asyncio.create_task]
  patterns: [platform-divergent managers, session pool singleton, binary WS frames for PTY I/O]

key-files:
  created:
    - agent/locus_agent/terminal/unix.py
    - agent/locus_agent/terminal/windows.py
    - agent/locus_agent/terminal/session_pool.py
    - agent/locus_agent/ws/terminal.py
    - agent/locus_agent/ws/logs.py
    - agent/locus_agent/api/terminal.py
    - agent/locus_agent/app.py
  modified: []

key-decisions:
  - "No agent-side scrollback on Unix -- tmux handles it natively"
  - "Windows uses 64KB ring buffer scrollback per session"
  - "Binary WS frames for PTY I/O, text JSON frames for resize control"
  - "Session pool singleton pattern matching backend/app/ws/terminal.py"
  - "AgentLogHandler broadcasts to WS subscribers via asyncio.create_task"

patterns-established:
  - "Platform dispatch: if sys.platform == 'win32' for Unix/Windows manager selection"
  - "Session pool background read loop with WS forwarding and scrollback buffering"
  - "WS auth via query param token before accept"

requirements-completed: [AGENT-02, AGENT-03, AGENT-04]

duration: 3min
completed: 2026-04-01
---

# Phase 5 Plan 02: Terminal Sessions and WebSocket Endpoints Summary

**Unix tmux PTY and Windows ConPTY session managers with WebSocket terminal I/O and log streaming endpoints**

## Performance

- **Duration:** 3 min
- **Started:** 2026-04-01T11:29:43Z
- **Completed:** 2026-04-01T11:32:52Z
- **Tasks:** 2
- **Files modified:** 14

## Accomplishments
- Platform-divergent terminal session managers: Unix (tmux + PTY) and Windows (ConPTY + ring buffer)
- Cross-platform SessionPool with background read loops, WS attachment, and scrollback replay
- WebSocket /ws/terminal/{session_id} streaming binary PTY I/O with JSON resize control
- WebSocket /ws/logs streaming agent diagnostics with AgentLogHandler
- REST POST/DELETE/GET /terminal for session CRUD
- app.py wiring all routers with session_pool.close_all() on shutdown

## Task Commits

Each task was committed atomically:

1. **Task 1: Platform-divergent terminal session managers and session pool** - `94da3a5` (feat)
2. **Task 2: WebSocket endpoints for terminal I/O and agent log streaming** - `3256114` (feat)

## Files Created/Modified
- `agent/locus_agent/terminal/__init__.py` - Terminal package init
- `agent/locus_agent/terminal/unix.py` - Unix PTY + tmux session manager with rediscover
- `agent/locus_agent/terminal/windows.py` - Windows ConPTY session manager with 64KB scrollback
- `agent/locus_agent/terminal/session_pool.py` - Cross-platform session pool dispatcher singleton
- `agent/locus_agent/ws/__init__.py` - WebSocket package init
- `agent/locus_agent/ws/terminal.py` - WebSocket endpoint for terminal I/O
- `agent/locus_agent/ws/logs.py` - WebSocket endpoint for log streaming with AgentLogHandler
- `agent/locus_agent/api/terminal.py` - REST endpoints for terminal CRUD
- `agent/locus_agent/api/health.py` - Health endpoint (foundation for app.py)
- `agent/locus_agent/app.py` - FastAPI app factory wiring all routers
- `agent/locus_agent/__init__.py` - Package version
- `agent/locus_agent/config.py` - Agent settings (foundation)
- `agent/locus_agent/auth.py` - Token auth (foundation)
- `agent/locus_agent/api/__init__.py` - API package init

## Decisions Made
- No agent-side scrollback on Unix -- tmux handles it natively (per D-23)
- Windows uses 64KB ring buffer scrollback per session (per D-23)
- Binary WS frames for PTY I/O, text JSON for resize control (matches backend pattern)
- AgentLogHandler uses asyncio.create_task for non-blocking broadcast
- Created minimal foundation files (config, auth, health) since Plan 01 runs in parallel

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Created foundation files for parallel execution**
- **Found during:** Task 1 (before starting)
- **Issue:** Plan 01 (agent skeleton) runs in parallel wave 1 but creates files this plan imports
- **Fix:** Created minimal versions of __init__.py, config.py, auth.py, api/__init__.py, api/health.py
- **Files modified:** agent/locus_agent/__init__.py, config.py, auth.py, api/__init__.py, api/health.py
- **Verification:** All imports succeed
- **Committed in:** 94da3a5 (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Foundation files necessary for parallel execution. Plan 01 will create authoritative versions in its worktree; merge will reconcile.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Terminal session management complete, ready for Plans 03-06 to build file ops, Claude detection, and Docker bridge
- SessionPool singleton exported for use by other agent modules

---
*Phase: 05-host-agent*
*Completed: 2026-04-01*
