---
status: partial
phase: 01-infrastructure-terminal-core
source: [01-VERIFICATION.md]
started: 2026-03-24T17:05:00Z
updated: 2026-03-24T17:05:00Z
---

## Current Test

[awaiting human testing]

## Tests

### 1. Terminal tab switching after Plans 08+09 gap closure
expected: Switching terminal tabs does not trigger reconnect storms; returning to a tab shows previous content with correct cursor position; rapid switching causes no lag
result: [pending]

### 2. Full 256-color terminal with mouse and resize
expected: Running 'htop' or 'ls --color=always' shows colors; mouse scrolling works; resizing the browser panel causes terminal to reflow correctly
result: [pending]

### 3. Claude tab mutual exclusion and ClaudeOverview renders session cards
expected: Clicking the Claude tab in MachineTabBar deselects the active machine tab, hides the terminal area, and shows ClaudeOverview with live Claude Code session cards. Clicking a machine tab restores the terminal area and hides ClaudeOverview.
result: [pending]

### 4. TmuxPicker loads sessions from new endpoint
expected: TmuxPicker receives a session list from GET /api/machines/{id}/tmux-sessions (HTTP 200, not 404); selecting a session creates a terminal in that tmux session
result: [pending]

## Summary

total: 4
passed: 0
issues: 0
pending: 4
skipped: 0
blocked: 0

## Gaps
