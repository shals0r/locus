---
phase: 01-infrastructure-terminal-core
plan: 04
subsystem: ui
tags: [react, zustand, react-resizable-panels, lucide-react, tailwind, layout]

# Dependency graph
requires:
  - phase: 01-infrastructure-terminal-core/01
    provides: "TypeScript types (Machine, TerminalSession, MachineStatus, ClaudeStatus), API client, Tailwind design tokens, Vite config"
provides:
  - "Three-panel resizable layout shell (AppShell with PanelGroup)"
  - "Zustand stores for auth, machine, session, and panel state"
  - "TopBar with status indicators and user menu"
  - "Sidebar with machine list and empty state"
  - "MachineTabBar and SessionTabBar navigation components"
  - "Ctrl+B keyboard shortcut for sidebar collapse"
affects: [01-05-auth-setup, 01-06-terminal-ssh, 01-07-settings]

# Tech tracking
tech-stack:
  added: [zustand, react-resizable-panels, lucide-react]
  patterns: [zustand-store-per-domain, panel-ref-sync-with-store, keyboard-shortcut-via-window-listener]

key-files:
  created:
    - frontend/src/stores/authStore.ts
    - frontend/src/stores/machineStore.ts
    - frontend/src/stores/sessionStore.ts
    - frontend/src/stores/panelStore.ts
    - frontend/src/components/layout/AppShell.tsx
    - frontend/src/components/layout/TopBar.tsx
    - frontend/src/components/layout/Sidebar.tsx
    - frontend/src/components/layout/CenterPanel.tsx
    - frontend/src/components/layout/RightPanel.tsx
    - frontend/src/components/machines/MachineItem.tsx
    - frontend/src/components/navigation/MachineTabBar.tsx
    - frontend/src/components/navigation/MachineTab.tsx
    - frontend/src/components/navigation/SessionTabBar.tsx
    - frontend/src/components/navigation/SessionTab.tsx
  modified:
    - frontend/src/App.tsx

key-decisions:
  - "One Zustand store per domain (auth, machines, sessions, panels) instead of a single monolithic store"
  - "Panel ref synced bidirectionally with Zustand store for programmatic collapse and drag collapse"
  - "Right panel present in DOM but collapsed at 0% for Phase 2 readiness"

patterns-established:
  - "Zustand store pattern: create<Interface>((set, get) => ({...})) with typed state and actions"
  - "Panel sync pattern: useRef<ImperativePanelHandle> + useEffect to sync store state with panel API"
  - "Keyboard shortcut pattern: window keydown listener in useEffect with cleanup"
  - "Status dot pattern: colored rounded-full span with semantic color classes (bg-success/error/warning)"

requirements-completed: [UI-03, UI-04]

# Metrics
duration: 3min
completed: 2026-03-24
---

# Phase 01 Plan 04: Frontend Layout Shell Summary

**Three-panel resizable layout with Zustand state management, collapsible sidebar (Ctrl+B), machine/session tab bars, and TopBar with status indicators**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-24T00:21:44Z
- **Completed:** 2026-03-24T00:24:18Z
- **Tasks:** 2
- **Files modified:** 15

## Accomplishments
- Four Zustand stores covering auth, machine, session, and panel state with typed interfaces
- Three-panel layout using react-resizable-panels with collapsible sidebar, resizable drag handles, and double-click reset
- TopBar with Locus logo, SSH/DB/Claude status indicators, and user menu dropdown with logout
- Sidebar with machine list, status dots, empty state copywriting, and Add Machine button
- MachineTabBar and SessionTabBar with active indicators, session type icons (shell/claude), and claude waiting pulse

## Task Commits

Each task was committed atomically:

1. **Task 1: Zustand stores for auth, machines, sessions, and panels** - `1b1744e` (feat)
2. **Task 2: Three-panel layout shell with TopBar, Sidebar, tabs, and keyboard shortcuts** - `d643c97` (feat)

## Files Created/Modified
- `frontend/src/stores/authStore.ts` - Auth state: token, isSetup, isAuthenticated, login/logout actions
- `frontend/src/stores/machineStore.ts` - Machine list, active machine, per-machine status tracking
- `frontend/src/stores/sessionStore.ts` - Session list, active session, per-machine session filtering
- `frontend/src/stores/panelStore.ts` - Sidebar/right-panel collapse state, toggle action
- `frontend/src/components/layout/AppShell.tsx` - PanelGroup with three panels, Ctrl+B shortcut, panel ref sync
- `frontend/src/components/layout/TopBar.tsx` - Logo, status indicators (SSH/DB/Claude), user menu dropdown
- `frontend/src/components/layout/Sidebar.tsx` - Machine list with MachineItem, empty state, Add Machine
- `frontend/src/components/layout/CenterPanel.tsx` - MachineTabBar + SessionTabBar + terminal placeholder
- `frontend/src/components/layout/RightPanel.tsx` - Phase 2 work feed placeholder
- `frontend/src/components/machines/MachineItem.tsx` - Sidebar machine row with status dot and active highlight
- `frontend/src/components/navigation/MachineTabBar.tsx` - Horizontal scrollable machine tabs
- `frontend/src/components/navigation/MachineTab.tsx` - Machine tab with accent active border
- `frontend/src/components/navigation/SessionTabBar.tsx` - Session sub-tabs for active machine
- `frontend/src/components/navigation/SessionTab.tsx` - Session tab with shell/claude icons and close button
- `frontend/src/App.tsx` - Conditional AppShell vs login placeholder based on auth state

## Decisions Made
- One Zustand store per domain (auth, machines, sessions, panels) for clean separation of concerns
- Panel ref synced bidirectionally with Zustand store to support both programmatic and drag-based collapse
- Right panel present in DOM at 0% width for Phase 2 readiness (avoids future layout refactor)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Layout shell ready for terminal view mounting in Plan 06
- Auth store ready for login/setup wizard in Plan 05
- Machine/session stores ready for API wiring in Plans 05-06
- All empty states display proper UI-SPEC copywriting

## Self-Check: PASSED

All 15 files verified present. Both task commits (1b1744e, d643c97) verified in git log.

---
*Phase: 01-infrastructure-terminal-core*
*Completed: 2026-03-24*
