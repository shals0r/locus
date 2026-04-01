---
status: complete
phase: 05-host-agent
source: [05-VERIFICATION.md]
started: 2026-04-01T13:00:00Z
updated: 2026-04-02T12:00:00Z
---

## Current Test

[testing complete]

## Tests

### 1. needs_setup panel visual rendering
expected: Panel shows Option A "Locus Host Agent (Recommended)" with `pip install ./agent` and `locus-agent start` in a code block, and "Runs on port 7700 by default. Locus auto-detects the agent from Docker."
result: pass

### 2. Full agent-to-browser terminal flow
expected: Full terminal renders with colors; resize works; closing the tab and reopening reconnects to the same tmux session; scrollback visible
result: pass
notes: |
  Terminal renders and works on Windows via ConPTY agent proxy. VPS tmux terminals work as before.
  Two observations:
  - Shell does not persist page reloads on Windows (expected: no tmux, ConPTY sessions are ephemeral)
  - No repos detected on local Windows machine (user wants configurable default projects directory)

### 3. Claude session detection
expected: Running Claude session appears with correct tmux_session, window_index, window_name, and status
result: issue
reported: "Dont see it — Claude session running on VPS in tmux but not appearing in UI"
severity: major

## Summary

total: 3
passed: 2
issues: 1
pending: 0
skipped: 0
blocked: 0

## Gaps

- truth: "Running Claude session appears with correct tmux_session, window_index, window_name, and status"
  status: failed
  reason: "User reported: Claude session running on VPS in tmux but not appearing in UI"
  severity: major
  test: 3
  root_cause: ""
  artifacts: []
  missing: []
  debug_session: ""
