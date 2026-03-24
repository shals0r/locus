---
status: complete
phase: 01-infrastructure-terminal-core
source: 01-01-SUMMARY.md, 01-02-SUMMARY.md, 01-03-SUMMARY.md, 01-04-SUMMARY.md, 01-05-SUMMARY.md, 01-06-SUMMARY.md, 01-07-SUMMARY.md
started: 2026-03-24T13:10:00Z
updated: 2026-03-24T14:00:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Cold Start Smoke Test
expected: All containers start cleanly with `docker compose --profile dev up -d`. No errors in logs. Health endpoint returns 200. Frontend loads in browser.
result: pass

### 2. Setup Wizard — Password Creation
expected: On first visit, you see a 3-step wizard. Step 1 asks for password (min 8 chars) with confirm field. Submitting advances to step 2.
result: pass

### 3. Setup Wizard — Skip Machine & Credentials
expected: Steps 2 and 3 have "Skip for now" links. Clicking skip on both takes you to the main app.
result: pass

### 4. Login Page
expected: After logging out (user menu → Logout), you see a login form. Entering correct password logs you in and shows the main app.
result: pass

### 5. Three-Panel Layout
expected: Main app shows a left sidebar (machines), center panel (terminal area), and a top bar with "Locus" branding. Sidebar shows "No machines connected" with an "Add Machine" button.
result: pass

### 6. Sidebar Collapse (Ctrl+B)
expected: Pressing Ctrl+B collapses the sidebar. Pressing again expands it. The resize handle between sidebar and center can be dragged.
result: pass

### 7. Top Bar Status Indicators
expected: Top bar shows SSH (red dot — no machines), DB (green dot — connected), Claude (red dot — unconfigured). Each has an icon and label.
result: pass

### 8. User Menu
expected: Clicking the user icon in top bar shows a dropdown with "Settings" and "Logout" options.
result: pass

### 9. Machine CRUD via API
expected: GET /api/machines returns empty list. POST creates machine. DELETE removes it.
result: pass

### 10. Credential Storage via API
expected: POST stores encrypted credential. GET returns list without exposing encrypted_data. DELETE removes.
result: pass

### 11. Terminal Rendering (xterm.js)
expected: When a terminal session is active, xterm.js renders with dark theme (Tokyo Night colors), monospace font, and blinking cursor. Terminal fills available space.
result: issue
reported: "Terminal connects and renders initially, but is laggy. Cursor appears several lines below the last command with blank space above. After switching tabs and coming back, terminal becomes unresponsive."
severity: major

### 12. WebSocket Terminal Bridge
expected: Terminal input is sent to remote machine via WebSocket. Output streams back in real-time. Typing commands produces expected shell output. Switching between session tabs preserves state.
result: issue
reported: "Terminal I/O works initially but tab switching causes WebSocket reconnect storms. Sessions don't persist across tab switches — tmux sessions are killed on WS disconnect instead of detached. Multiple rapid open/close cycles cause lag and eventual unresponsiveness."
severity: major

## Summary

total: 12
passed: 10
issues: 2
pending: 0
skipped: 0
blocked: 0

## Gaps

- truth: "Terminal renders smoothly with correct cursor positioning"
  status: failed
  reason: "User reported: laggy, cursor positioned below last command with blank space, unresponsive after tab switch"
  severity: major
  test: 11
  root_cause: "Terminal resize/fit miscalculation on reattach; no scrollback restore when reconnecting to existing tmux session"
  artifacts:
    - path: "frontend/src/hooks/useTerminal.ts"
      issue: "FitAddon.fit() runs before terminal has content, causing size mismatch"
    - path: "frontend/src/components/terminal/TerminalView.tsx"
      issue: "Component fully remounts on tab switch, losing terminal instance"
  missing:
    - "Keep terminal instances alive when switching tabs (display:none instead of unmount)"
    - "Proper resize sequence on reattach"

- truth: "WebSocket terminal bridge maintains stable connection and session state across tab switches"
  status: failed
  reason: "User reported: WS reconnect storms on tab switch, sessions killed instead of detached, lag and unresponsiveness"
  severity: major
  test: 12
  root_cause: "Backend kills tmux process in finally block on WS disconnect; frontend useWebSocket auto-reconnects aggressively; CenterPanel useEffect re-fetches sessions causing cascade"
  artifacts:
    - path: "backend/app/ws/terminal.py"
      issue: "process.close() in finally kills tmux instead of detaching"
    - path: "frontend/src/hooks/useWebSocket.ts"
      issue: "Auto-reconnect with exponential backoff fires even for intentional disconnects (tab switch)"
    - path: "frontend/src/components/layout/CenterPanel.tsx"
      issue: "useEffect refetches sessions on activeMachineId change, causing unnecessary remounts"
  missing:
    - "Backend: detach from tmux on WS close, reattach on reconnect"
    - "Frontend: distinguish intentional disconnect (tab switch) from network failure"
    - "Frontend: keep terminal instances alive across tab switches"
    - "Backend: auto-reconnect SSH on startup so terminals survive hot-reload"
