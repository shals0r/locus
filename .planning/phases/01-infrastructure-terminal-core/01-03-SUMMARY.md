---
phase: 01-infrastructure-terminal-core
plan: 03
subsystem: ssh
tags: [asyncssh, websocket, tmux, ssh, terminal, pty]

requires:
  - phase: 01-infrastructure-terminal-core/01
    provides: "FastAPI app, Settings with heartbeat/reconnect config, Machine model, TerminalSession model, database engine"
provides:
  - "SSHManager connection pool with heartbeat and reconnection"
  - "Tmux session detection and creation"
  - "PTY process creation for terminal sessions"
  - "WebSocket /ws/terminal/{session_id} endpoint for bidirectional terminal I/O"
affects: [frontend-terminal, session-management, machine-management]

tech-stack:
  added: [asyncssh]
  patterns: [singleton-manager, websocket-binary-bridge, exponential-backoff-reconnect]

key-files:
  created:
    - backend/app/ssh/__init__.py
    - backend/app/ssh/manager.py
    - backend/app/ssh/tmux.py
    - backend/app/ssh/terminal.py
    - backend/app/ws/__init__.py
    - backend/app/ws/terminal.py
  modified:
    - backend/app/main.py

key-decisions:
  - "Always wrap terminal sessions in tmux per anti-pattern guidance -- no bare PTY sessions"
  - "Token auth via query param for WebSocket (JWT validation deferred to auth service implementation)"
  - "Raw bytes mode (encoding=None) for binary transparency in terminal I/O"

patterns-established:
  - "Singleton manager pattern: module-level instance (ssh_manager = SSHManager())"
  - "WebSocket binary bridge: binary frames for I/O, text frames for JSON control messages"
  - "Process cleanup in try/finally to prevent orphaned SSH processes"

requirements-completed: [TERM-01, TERM-02, TERM-04]

duration: 3min
completed: 2026-03-24
---

# Phase 01 Plan 03: SSH + Terminal Summary

**AsyncSSH connection pool with heartbeat monitoring, tmux session detection, and WebSocket-SSH binary bridge for browser terminals**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-24T00:21:41Z
- **Completed:** 2026-03-24T00:24:33Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments
- SSHManager with persistent connection pool, 30s heartbeat, and exponential backoff reconnection (1s-30s, 10 retries)
- Tmux session listing and creation with auto-generated session names
- WebSocket endpoint streaming raw bytes bidirectionally with JSON resize control messages
- Guaranteed process cleanup on disconnect via try/finally

## Task Commits

Each task was committed atomically:

1. **Task 1: SSH Manager with connection pool and heartbeat** - `656a616` (feat)
2. **Task 2: Tmux detection + Terminal PTY + WebSocket-SSH bridge** - `89b6d1e` (feat)

## Files Created/Modified
- `backend/app/ssh/__init__.py` - Package exports for SSHManager and ssh_manager singleton
- `backend/app/ssh/manager.py` - SSH connection pool with heartbeat loop and exponential backoff reconnection
- `backend/app/ssh/tmux.py` - Tmux session listing and creation via SSH commands
- `backend/app/ssh/terminal.py` - Raw PTY process creation (non-tmux fallback)
- `backend/app/ws/__init__.py` - WebSocket handlers package
- `backend/app/ws/terminal.py` - WebSocket-SSH bridge with binary I/O and resize support
- `backend/app/main.py` - Added WebSocket router and SSH shutdown to lifespan

## Decisions Made
- Always wrap terminal sessions in tmux (even without explicit session name) per anti-pattern guidance from research
- WebSocket auth uses token query parameter; JWT validation deferred until auth service exists (TODO marker in code)
- Raw bytes mode (encoding=None) for binary transparency -- xterm.js sends/receives raw bytes
- Status callbacks are synchronous (not async) since they just update in-memory state

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Fixed async_session import name mismatch**
- **Found during:** Task 2 (WebSocket terminal endpoint)
- **Issue:** Plan referenced `async_session` but database.py exports `async_session_factory`
- **Fix:** Updated import to use `async_session_factory` matching the actual export name
- **Files modified:** backend/app/ws/terminal.py
- **Verification:** File parses without error
- **Committed in:** 89b6d1e (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Import name correction required for code to function. No scope creep.

## Issues Encountered
- No auth service exists yet (backend/app/services/auth.py not created by Plan 01). WebSocket endpoint accepts any non-empty token with a TODO for JWT validation. This will be wired up when auth is implemented.

## Known Stubs
- `backend/app/ws/terminal.py` line ~48: JWT token validation is a TODO -- accepts any non-empty token. Will be resolved when auth service is implemented in a future plan.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- SSH connection infrastructure ready for frontend terminal integration
- WebSocket endpoint registered and available at /ws/terminal/{session_id}
- SSHManager singleton available for import by any backend module
- Auth service needed before production use (token validation is stubbed)

---
*Phase: 01-infrastructure-terminal-core*
*Completed: 2026-03-24*
