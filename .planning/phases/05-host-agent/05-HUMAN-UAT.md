---
status: partial
phase: 05-host-agent
source: [05-VERIFICATION.md]
started: 2026-04-01T13:00:00Z
updated: 2026-04-01T13:00:00Z
---

## Current Test

[awaiting human testing]

## Tests

### 1. needs_setup panel visual rendering
expected: Panel shows Option A "Locus Host Agent (Recommended)" with `pip install ./agent` and `locus-agent start` in a code block, and "Runs on port 7700 by default. Locus auto-detects the agent from Docker."
result: [pending]

### 2. Full agent-to-browser terminal flow
expected: Full terminal renders with colors; resize works; closing the tab and reopening reconnects to the same tmux session; scrollback visible
result: [pending]

### 3. Claude session detection
expected: Running Claude session appears with correct tmux_session, window_index, window_name, and status
result: [pending]

## Summary

total: 3
passed: 0
issues: 0
pending: 3
skipped: 0
blocked: 0

## Gaps
