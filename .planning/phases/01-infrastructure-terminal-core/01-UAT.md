---
status: partial
phase: 01-infrastructure-terminal-core
source: 01-01-SUMMARY.md, 01-02-SUMMARY.md, 01-03-SUMMARY.md, 01-04-SUMMARY.md, 01-05-SUMMARY.md, 01-06-SUMMARY.md, 01-07-SUMMARY.md
started: 2026-03-24T13:10:00Z
updated: 2026-03-24T13:18:00Z
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
expected: Run `curl -s -H "Authorization: Bearer <token>" http://localhost:8000/api/machines` returns empty list `[]`. POST to create a machine returns the machine object.
result: pass

### 10. Credential Storage via API
expected: POST to `/api/settings/credentials` with service_type/name/data stores encrypted credential. GET `/api/settings/credentials` returns list without exposing encrypted_data.
result: pass

### 11. Terminal Rendering (xterm.js)
expected: When a terminal session is active, xterm.js renders with dark theme (Tokyo Night colors), monospace font, and blinking cursor. Terminal fills available space.
result: blocked
blocked_by: server
reason: "No SSH key configured for localhost — cannot establish terminal session"

### 12. WebSocket Terminal Bridge
expected: Terminal input is sent to remote machine via WebSocket. Output streams back in real-time. Typing commands produces expected shell output.
result: blocked
blocked_by: server
reason: "No SSH key configured for localhost — cannot establish terminal session"

## Summary

total: 12
passed: 10
issues: 0
pending: 0
skipped: 0
blocked: 2

## Gaps

[none yet]
