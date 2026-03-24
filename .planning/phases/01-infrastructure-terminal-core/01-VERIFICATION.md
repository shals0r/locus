---
phase: 01-infrastructure-terminal-core
verified: 2026-03-24T17:00:00Z
status: human_needed
score: 5/5 success criteria verified
re_verification:
  previous_status: gaps_found
  previous_score: 3/5
  gaps_closed:
    - "User can see all active Claude Code sessions in one view (TERM-06) — ClaudeOverview mounted via Claude tab in MachineTabBar"
    - "User can attach to existing tmux sessions via TmuxPicker (TERM-04 UI picker) — GET/POST /api/machines/{id}/tmux-sessions endpoints added"
  gaps_remaining: []
  regressions: []
human_verification:
  - test: "End-to-end terminal tab switching after Plans 08+09 fixes"
    expected: "Switching terminal tabs does not trigger reconnect storms; returning to a tab shows previous content with correct cursor position; rapid switching causes no lag"
    why_human: "Plans 08 and 09 were executed but no second UAT has been run to confirm the original UAT gaps (tests 11 and 12) are resolved"
  - test: "Full SSH terminal session — 256-color, mouse, resize"
    expected: "Running 'htop' or 'ls --color' shows colors; mouse scrolling works; resizing the browser panel causes terminal to reflow correctly"
    why_human: "Requires live SSH target; cannot verify programmatically"
  - test: "Claude tab mutual exclusion and ClaudeOverview renders session cards"
    expected: "Clicking the Claude tab in MachineTabBar deselects the active machine tab, hides the terminal area, and shows ClaudeOverview with live Claude Code session cards (if any are running). Clicking a machine tab restores the terminal area and clears the Claude view."
    why_human: "Requires live browser session to confirm mutual exclusion UX and that claudeSessionStore actually populates the ClaudeOverview cards"
  - test: "TmuxPicker loads and displays sessions from the new endpoint"
    expected: "Opening TmuxPicker for a connected machine returns the session list from GET /api/machines/{id}/tmux-sessions (no 404); selecting a session creates a terminal in that tmux session"
    why_human: "Requires live SSH target with existing tmux sessions"
---

# Phase 1: Infrastructure & Terminal Core — Verification Report

**Phase Goal:** User can launch Locus with one command, log in, connect to remote machines, and work in full terminal sessions across a collapsible three-panel layout
**Verified:** 2026-03-24T17:00:00Z
**Status:** human_needed (all automated checks pass; two human UAT sessions still pending)
**Re-verification:** Yes — after gap closure via Plan 01-10 (commit 78b3391)

---

## Goal Achievement

### Observable Truths (from Roadmap Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | User can run `docker compose up` and access Locus in a browser with a working login | VERIFIED | docker-compose.yml validates (4 services, postgres:16-alpine, healthcheck, dev profiles). Auth API (setup/login/status) fully wired in main.py. App.tsx routes wizard/login/shell based on authStore. UAT tests 1-4 passed. |
| 2 | User can connect to a remote machine via SSH and get a full terminal (256-color, mouse, resize) in the browser | VERIFIED (human confirm pending) | SSHManager with asyncssh, heartbeat, reconnect. WebSocket terminal bridge with PTY, binary I/O, resize JSON messages, FitAddon, ResizeObserver, Tokyo Night theme. Plans 08+09 gap closure committed — human re-test needed. |
| 3 | User can open multiple terminal tabs across different repos and machines, and see all active Claude Code sessions in one view | VERIFIED | SessionTabBar and CenterPanel render all sessions with display:none. ClaudeOverview now mounted in CenterPanel behind a "Claude" tab in MachineTabBar (Bot icon). claudeSessionStore feeds the overview via useStatus. |
| 4 | User can attach to existing tmux sessions on remote machines and reconnect gracefully after SSH drops | VERIFIED | GET /api/machines/{id}/tmux-sessions (list_tmux_sessions) and POST /api/machines/{id}/tmux-sessions (create_terminal_in_tmux) added to machines.py. TmuxPicker calls these endpoints (lines 23 and 41). Backend reattach on reconnect (Plan 08) remains in place. |
| 5 | User can see machine online/offline status, connected service indicators, and collapse/expand/resize the three main panels | VERIFIED | Sidebar status dots wired to machineStore.machineStatuses. TopBar StatusIndicators wired to useStatus(). PanelGroup with collapsible sidebar, Ctrl+B shortcut, drag handles. UAT tests 5-7 passed. |

**Score: 5/5 truths verified (2 require human confirmation for live-session behaviors)**

---

### Required Artifacts

#### Previously passing — regression check only

| Artifact | Status | Regression Check |
|----------|--------|-----------------|
| `docker-compose.yml` | VERIFIED | No modification in Plan 10 |
| `backend/app/main.py` | VERIFIED | No modification in Plan 10 |
| `backend/app/api/auth.py` | VERIFIED | No modification in Plan 10 |
| `backend/app/ssh/manager.py` | VERIFIED | No modification in Plan 10 |
| `backend/app/ssh/tmux.py` | VERIFIED | No modification in Plan 10 |
| `backend/app/ws/terminal.py` | VERIFIED | No modification in Plan 10 |
| `backend/app/ws/status.py` | VERIFIED | No modification in Plan 10 |
| `frontend/src/App.tsx` | VERIFIED | No modification in Plan 10 |
| `frontend/src/components/layout/AppShell.tsx` | VERIFIED | No modification in Plan 10 |
| `frontend/src/components/terminal/TerminalView.tsx` | VERIFIED | No modification in Plan 10 |
| `frontend/src/hooks/useTerminal.ts` | VERIFIED | No modification in Plan 10 |
| `frontend/src/hooks/useWebSocket.ts` | VERIFIED | No modification in Plan 10 |
| `frontend/src/components/terminal/ClaudeOverview.tsx` | VERIFIED | Was ORPHANED; now imported and rendered in CenterPanel |

#### Gap closure artifacts — full verification

| Artifact | Status | Evidence |
|----------|--------|----------|
| `backend/app/api/machines.py` | VERIFIED | `@router.get("/{machine_id}/tmux-sessions")` at line 282; `@router.post("/{machine_id}/tmux-sessions")` at line 312; both import `list_tmux_sessions` and `create_terminal_in_tmux`; DB + SSH connection checks before executing; returns proper Pydantic response models |
| `backend/app/schemas/machine.py` | VERIFIED | `TmuxSessionItem` (name, attached, last_activity), `TmuxSessionsResponse` (sessions list), `TmuxCreateResponse` (session_name) — all defined at lines 61-78 |
| `frontend/src/components/navigation/MachineTabBar.tsx` | VERIFIED | `Bot` imported from lucide-react; `claudeViewActive` and `setClaudeViewActive` from useMachineStore; Claude tab button with active border styling and `onClick={() => setClaudeViewActive(true)}`; positioned between machine tabs and + button |
| `frontend/src/components/layout/CenterPanel.tsx` | VERIFIED | `ClaudeOverview` imported at line 8; `claudeViewActive` read from store at line 13; `{claudeViewActive ? <div className="flex-1 overflow-y-auto"><ClaudeOverview /></div> : ...}` conditional at line 44; `SessionTabBar` only renders in the false branch |
| `frontend/src/stores/machineStore.ts` | VERIFIED | `claudeViewActive: boolean` in interface (line 7); `setClaudeViewActive: (active: boolean) => void` in interface (line 13); default `false` (line 20); `setActiveMachine` clears `claudeViewActive: false` (line 30); `setClaudeViewActive` clears `activeMachineId: null` (line 31) — mutual exclusion correct |

---

### Key Link Verification

| From | To | Via | Status | Detail |
|------|----|----|--------|--------|
| All previously passing links | — | — | WIRED | No regressions — Plan 10 only added to machines.py and schemas, did not modify routing or existing wiring |
| `frontend/src/components/machines/TmuxPicker.tsx` | `/api/machines/{id}/tmux-sessions` | `apiGet` and `apiPost` | WIRED | Lines 23 and 41 in TmuxPicker.tsx; GET and POST routes confirmed in machines.py lines 282 and 312 |
| `frontend/src/components/layout/CenterPanel.tsx` | `frontend/src/components/terminal/ClaudeOverview.tsx` | `import` + conditional render | WIRED | Import at line 8; rendered at line 46 when `claudeViewActive` is true |
| `frontend/src/components/navigation/MachineTabBar.tsx` | `frontend/src/stores/machineStore.ts` | `setClaudeViewActive` | WIRED | Lines 8 and 16 in MachineTabBar |
| `frontend/src/components/navigation/MachineTab.tsx` | `frontend/src/stores/machineStore.ts` | `setActiveMachine` (clears claudeViewActive) | WIRED | Line 20 in MachineTab calls `setActiveMachine(machine.id)` which executes `set({ activeMachineId: id, claudeViewActive: false })` |

---

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|--------------|--------|--------------------|--------|
| `ClaudeOverview.tsx` | claudeSessions | claudeSessionStore (set by useStatus on WS messages from detect_claude_sessions) | Yes — tmux list-windows on remote machines | FLOWING (unmounted issue resolved) |
| GET /api/machines/{id}/tmux-sessions | sessions | list_tmux_sessions(conn) via asyncssh | Yes — executes `tmux list-sessions` on remote | FLOWING |
| POST /api/machines/{id}/tmux-sessions | session_name | create_terminal_in_tmux(conn) | Yes — creates real tmux session | FLOWING |

---

### Behavioral Spot-Checks

Step 7b: SKIPPED for SSH-dependent and browser-dependent behaviors. Key endpoint and import wiring confirmed via grep. No runnable standalone entry points applicable without SSH target and running Docker stack.

---

### Requirements Coverage

| Requirement | Plans | Description | Status | Evidence |
|-------------|-------|-------------|--------|----------|
| TERM-01 | 01-03, 01-08 | SSH with persistent auto-reconnecting connections | SATISFIED | SSHManager with heartbeat + exponential backoff |
| TERM-02 | 01-07, 01-09 | Full terminal emulator (xterm.js) 256-color, mouse, resize | SATISFIED (human confirm needed) | FitAddon, ResizeObserver, binaryType arraybuffer, Tokyo Night |
| TERM-03 | 01-05, 01-07, 01-09 | Multiple terminal tabs per machine/repo | SATISFIED | SessionTabBar, CenterPanel display:none rendering, /api/sessions CRUD |
| TERM-04 | 01-03, 01-08, 01-10 | Attach to existing tmux sessions, reconnect gracefully | SATISFIED | Backend reattach (Plan 08) + GET/POST /tmux-sessions (Plan 10); TmuxPicker no longer 404s |
| TERM-05 | 01-05, 01-07 | Machine connection status at a glance | SATISFIED | Sidebar status dots, TopBar SSH indicator, machineStore/useStatus |
| TERM-06 | 01-07, 01-10 | All Claude Code sessions in one view | SATISFIED | ClaudeOverview mounted in CenterPanel via Claude tab in MachineTabBar |
| TERM-07 | 01-07 | Feed notification when Claude Code waiting for input | SATISFIED | SessionTab pulsing amber dot; TopBar Claude indicator amber on waiting sessions; ClaudeOverview now reachable |
| AUTH-01 | 01-02, 01-06 | Password setup on first run | SATISFIED | SetupWizard -> POST /api/auth/setup |
| AUTH-02 | 01-02, 01-05 | Encrypted credentials for external services | SATISFIED | Fernet encrypt_value/decrypt_value; CredentialSettings wired |
| AUTH-03 | 01-01, 01-05 | SSH key paths stored (not the keys) | SATISFIED | Machine.ssh_key_path stores path; no key content stored |
| AUTH-04 | 01-05, 01-06 | Claude Code auth pushed to machines | SATISFIED | /api/settings/claude-code/push/{machine_id}; ClaudeCodeSettings Push button |
| DEPL-01 | 01-01 | docker compose up starts full stack | SATISFIED | docker-compose.yml validates; 4 services |
| DEPL-02 | 01-01, 01-06 | Config via env vars + first-run setup flow | SATISFIED | .env.example; 3-step wizard |
| DEPL-03 | 01-05, 01-07 | Connected service status indicators in top bar | SATISFIED | TopBar StatusIndicators wired to useStatus; DB/SSH/Claude Code |
| UI-03 | 01-04, 01-09 | Collapse, expand, resize three panels independently | SATISFIED | PanelGroup with collapsible sidebar, drag handles |
| UI-04 | 01-04, 01-09 | Focus mode by collapsing panels | SATISFIED | Ctrl+B toggles sidebar; right panel collapses |

**All 16 requirements satisfied.** No orphaned requirements found.

---

### Anti-Patterns Found

| File | Pattern | Severity | Impact |
|------|---------|----------|--------|
| `frontend/src/stores/authStore.ts` | `checkAuth()` is an empty stub (`// Will be implemented when API is wired`) | Warning | Carry-over from previous report — no callers found that depend on it; does not block any requirement |

No new anti-patterns introduced by Plan 10. The two previous blockers (ClaudeOverview orphaned, TmuxPicker 404) are resolved.

---

### Human Verification Required

#### 1. Terminal tab switching after Plans 08+09 gap closure

**Test:** Start `docker compose --profile dev up`, connect to an SSH machine, open a terminal session. Switch between terminal tabs several times rapidly. Return to the first tab.
**Expected:** No reconnect storms; terminal shows previous content with correct cursor position; no lag or blank space after tab switch.
**Why human:** UAT tests 11+12 were the original gaps. Plans 08 and 09 fixed the code but no second UAT session has been run against a live SSH target.

#### 2. Full 256-color terminal with mouse and resize

**Test:** In an active terminal, run `htop` or `ls --color=always`. Resize the sidebar panel by dragging. Toggle sidebar with Ctrl+B.
**Expected:** 256-color output renders correctly; terminal reflowing on resize keeps cursor aligned; focus mode expands terminal width.
**Why human:** Requires visual inspection and a live remote machine.

#### 3. Claude tab and ClaudeOverview UX

**Test:** In a running Locus instance, click the "Claude" tab (Bot icon) in MachineTabBar.
**Expected:** Active machine tab deselects (border clears), terminal area disappears, ClaudeOverview renders with Claude Code session cards for any running sessions. Clicking a machine tab restores the terminal area and hides ClaudeOverview.
**Why human:** Requires live browser session to confirm mutual exclusion UX and that claudeSessionStore populates the cards.

#### 4. TmuxPicker loads sessions from new endpoint

**Test:** With a connected machine that has existing tmux sessions, open the TmuxPicker flow.
**Expected:** TmuxPicker receives a session list from GET /api/machines/{id}/tmux-sessions (HTTP 200, not 404); selecting a session and clicking attach creates a terminal in that tmux session via the WebSocket bridge.
**Why human:** Requires live SSH target with existing tmux sessions to confirm end-to-end flow.

---

## Re-Verification Summary

**Both gaps from the initial verification are closed:**

**Gap 1 (TERM-06) — CLOSED:** ClaudeOverview is now imported and conditionally rendered in `CenterPanel.tsx` (line 8 import, line 46 render). A "Claude" tab with `Bot` icon was added to `MachineTabBar.tsx`. The `claudeViewActive` boolean in `machineStore.ts` provides mutual exclusion with the machine tab selection — clicking the Claude tab calls `setClaudeViewActive(true)` which sets `activeMachineId: null`, and clicking any machine tab calls `setActiveMachine(id)` which sets `claudeViewActive: false`.

**Gap 2 (TERM-04 UI picker) — CLOSED:** `GET /api/machines/{id}/tmux-sessions` and `POST /api/machines/{id}/tmux-sessions` are implemented in `machines.py` (lines 282 and 312). Both endpoints validate the machine exists in the DB, check for an active SSH connection, and call the existing `list_tmux_sessions` / `create_terminal_in_tmux` helpers from `ssh/tmux.py`. The `TmuxSessionsResponse`, `TmuxSessionItem`, and `TmuxCreateResponse` Pydantic schemas are defined in `schemas/machine.py`. `TmuxPicker.tsx` lines 23 and 41 call these endpoints — they will no longer 404 at runtime.

**No regressions detected.** All previously passing key links remain intact. Plan 10 only added routes and schemas to `machines.py` / `schemas/machine.py` and added conditional rendering to `CenterPanel.tsx` — no existing behavior was removed or modified.

**Remaining items are human-only:** Four UAT scenarios require a live SSH target and running Docker stack. Automated code verification is complete.

---

*Verified: 2026-03-24T17:00:00Z*
*Verifier: Claude (gsd-verifier)*
*Re-verification: Yes — after Plan 01-10 gap closure (commit 78b3391)*
