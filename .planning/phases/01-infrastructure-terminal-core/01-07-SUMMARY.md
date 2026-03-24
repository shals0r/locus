---
phase: 01-infrastructure-terminal-core
plan: 07
subsystem: terminal, ui
tags: [xterm.js, websocket, terminal, claude-code, status-indicators, zustand, react]

requires:
  - phase: 01-infrastructure-terminal-core
    plan: 03
    provides: "SSH bridge with WebSocket terminal endpoint /ws/terminal/{session_id}"
  - phase: 01-infrastructure-terminal-core
    plan: 04
    provides: "Zustand stores (machineStore, sessionStore, panelStore) and layout components"
  - phase: 01-infrastructure-terminal-core
    plan: 05
    provides: "Backend API endpoints for machines, sessions, settings/status"
provides:
  - "xterm.js terminal rendering with Tokyo Night theme in browser"
  - "Reconnecting WebSocket hook with exponential backoff"
  - "Terminal resize propagation with debounced WebSocket messages"
  - "Connection banner overlay for SSH disconnect/reconnect UI"
  - "Claude Code session detection via tmux on remote machines"
  - "/ws/status WebSocket for live machine and Claude session updates"
  - "Claude Code overview panel with session cards"
  - "Live status indicators in top bar (SSH, DB, Claude)"
  - "Machine status dots and text in sidebar"
affects: [phase-02, phase-03]

tech-stack:
  added: ["@xterm/xterm", "@xterm/addon-fit", "@xterm/addon-web-links"]
  patterns: ["Custom binary WebSocket handler (no addon-attach)", "ResizeObserver -> FitAddon for panel resize", "Debounced resize messages (150ms)", "Status WebSocket with initial snapshot + periodic polling"]

key-files:
  created:
    - frontend/src/hooks/useWebSocket.ts
    - frontend/src/hooks/useTerminal.ts
    - frontend/src/hooks/useStatus.ts
    - frontend/src/components/terminal/TerminalView.tsx
    - frontend/src/components/terminal/ConnectionBanner.tsx
    - frontend/src/components/terminal/ClaudeOverview.tsx
    - frontend/src/components/terminal/ClaudeSessionCard.tsx
    - frontend/src/stores/claudeSessionStore.ts
    - backend/app/services/claude.py
    - backend/app/ws/status.py
  modified:
    - frontend/src/components/layout/CenterPanel.tsx
    - frontend/src/components/layout/TopBar.tsx
    - frontend/src/components/layout/Sidebar.tsx
    - backend/app/main.py

key-decisions:
  - "Custom binary WebSocket handler instead of addon-attach per RESEARCH.md recommendation"
  - "ResizeObserver pattern for panel resize detection feeding into FitAddon"
  - "Status WebSocket with 30s polling interval and immediate push via ssh_manager callbacks"
  - "Zustand store per domain: separate claudeSessionStore for Claude Code sessions"

patterns-established:
  - "useWebSocket: generic reconnecting WebSocket hook reusable across the app"
  - "Binary + text frame protocol: binary for terminal I/O, text JSON for control messages"
  - "Status polling: initial snapshot on connect, periodic deltas, immediate push on status change"

requirements-completed: [TERM-02, TERM-03, TERM-05, TERM-06, TERM-07, DEPL-03]

duration: 4min
completed: 2026-03-24
---

# Phase 01 Plan 07: Terminal Rendering and Status Summary

**xterm.js terminal with Tokyo Night theme, reconnecting WebSocket, Claude Code session detection via tmux, and live status indicators in sidebar/top bar**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-24T00:32:29Z
- **Completed:** 2026-03-24T00:36:31Z
- **Tasks:** 2 of 2 auto tasks completed (+ 1 checkpoint pending)
- **Files modified:** 14

## Accomplishments
- Full xterm.js terminal rendering with Tokyo Night 256-color theme, font, cursor, mouse support
- Reconnecting WebSocket with exponential backoff (1s to 30s, 10 retries) and manual fallback
- Terminal resize handling via ResizeObserver + FitAddon with 150ms debounced resize messages
- Connection banner overlay showing reconnecting spinner or failed state with Reconnect button
- Claude Code session detection via tmux list-windows and waiting-for-input via capture-pane
- Live /ws/status WebSocket pushing machine status changes and Claude session updates
- Top bar indicators wired to live data: SSH (green/amber/red), DB (always green), Claude (green/amber)
- Sidebar machine items with status text (Connected/Offline/Reconnecting) and online count

## Task Commits

Each task was committed atomically:

1. **Task 1: Terminal hooks + TerminalView + ConnectionBanner** - `8a0aa66` (feat)
2. **Task 2: Claude Code detection + overview + Status indicators** - `36bfeda` (feat)

**Plan metadata:** pending (checkpoint)

## Files Created/Modified

- `frontend/src/hooks/useWebSocket.ts` - Reconnecting WebSocket hook with exponential backoff
- `frontend/src/hooks/useTerminal.ts` - xterm.js lifecycle, Tokyo Night theme, FitAddon, custom binary WS handler
- `frontend/src/hooks/useStatus.ts` - /ws/status WebSocket consumer updating machine and Claude stores
- `frontend/src/components/terminal/TerminalView.tsx` - Full-height terminal with ConnectionBanner overlay
- `frontend/src/components/terminal/ConnectionBanner.tsx` - Reconnecting/failed overlay with Reconnect button
- `frontend/src/components/terminal/ClaudeOverview.tsx` - Feed-style Claude session list with empty state
- `frontend/src/components/terminal/ClaudeSessionCard.tsx` - Session card with pulsing amber for waiting status
- `frontend/src/stores/claudeSessionStore.ts` - Zustand store for Claude sessions with getWaitingSessions
- `backend/app/services/claude.py` - detect_claude_sessions and detect_waiting_for_input via tmux
- `backend/app/ws/status.py` - /ws/status WebSocket with initial snapshot and 30s polling
- `frontend/src/components/layout/CenterPanel.tsx` - Integrated TerminalView when activeSessionId is set
- `frontend/src/components/layout/TopBar.tsx` - Wired status indicators to live useStatus data
- `frontend/src/components/layout/Sidebar.tsx` - Machine status text and online count header
- `backend/app/main.py` - Added status WebSocket router

## Decisions Made
- Used custom binary WebSocket handler instead of @xterm/addon-attach per RESEARCH.md recommendation for binary transparency
- ResizeObserver on terminal container triggers FitAddon.fit() for panel resize handling
- Status WebSocket uses 30s polling interval with immediate push via ssh_manager.on_status_change callback
- Separate claudeSessionStore (not merged into machineStore) for clean domain separation

## Deviations from Plan

None - plan executed exactly as written.

## Known Stubs

None - all components are wired to real data sources via WebSocket connections.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Terminal rendering layer complete, ready for end-to-end testing with real SSH connections
- Checkpoint task (Task 3) requires manual verification with Docker Compose running
- All Phase 1 infrastructure is now in place

## Self-Check: PASSED

All 10 created files verified present. Both task commits (8a0aa66, 36bfeda) verified in git log.

---
*Phase: 01-infrastructure-terminal-core*
*Completed: 2026-03-24*
