---
phase: 05-host-agent
verified: 2026-04-01T14:10:00Z
status: human_needed
score: 6/6 success criteria verified
re_verification:
  previous_status: gaps_found
  previous_score: 5/6
  gaps_closed:
    - "CenterPanel.tsx needs_setup panel now shows actual locus-agent start instructions — 'Coming in Phase 5' removed, '(Recommended)' label added, pip install ./agent + locus-agent start code block added, port 7700 and auto-detection note added"
  gaps_remaining: []
  regressions: []
human_verification:
  - test: "Start Locus in Docker without the agent running. Navigate to 'This Machine'."
    expected: "Panel shows Option A: 'Locus Host Agent (Recommended)' with 'pip install ./agent' and 'locus-agent start' in a code block, and the note 'Runs on port 7700 by default. Locus auto-detects the agent from Docker.'"
    why_human: "Visual UI rendering cannot be verified statically. Confirms the code change actually renders correctly in the browser."
  - test: "Start the Locus Agent on the host (locus-agent start), open Locus in a browser, navigate to 'This Machine', open a terminal session."
    expected: "Full terminal renders with colors; resize works; closing the tab and reopening reconnects to the same tmux session; scrollback visible."
    why_human: "Requires running agent + Docker stack; PTY rendering and mouse support cannot be verified statically."
  - test: "Start a claude process in a tmux session on the host, open the Claude Overview panel in Locus."
    expected: "The running Claude session appears with correct tmux_session, window_index, window_name, and status."
    why_human: "Requires live tmux session and running agent."
---

# Phase 5: Host Agent Verification Report

**Phase Goal:** A lightweight universal agent process deployed to every connected machine, replacing SSH as the primary communication channel with an HTTP/WebSocket API for terminals, tmux, Claude detection, file operations, and git operations
**Verified:** 2026-04-01T14:10:00Z
**Status:** human_needed
**Re-verification:** Yes — after gap closure (plan 05-07, commit f20bfd6)

## Goal Achievement

### Observable Truths (Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | User can start the host agent with `locus-agent start` and Locus auto-detects it from Docker | ✓ VERIFIED | CenterPanel.tsx lines 141-153: Option A heading reads "Locus Host Agent (Recommended)"; code block shows `pip install ./agent` + `locus-agent start`; note "Runs on port 7700 by default. Locus auto-detects the agent from Docker." Backend auto-detection via `probe_agent` unchanged and verified in initial pass. |
| 2 | User can open terminal sessions on the host machine from Locus with full terminal UX (colors, mouse, resize) | ✓ VERIFIED | (Unchanged from initial verification) `ws/terminal.py` proxies to agent; agent `UnixSessionManager` uses `pty.openpty()` + `TIOCSWINSZ`. |
| 3 | Terminal sessions survive browser disconnects and Docker restarts — agent keeps processes alive and replays scrollback on reconnect | ✓ VERIFIED | (Unchanged) `session_pool.detach()` on disconnect; `get_scrollback()` replays on reconnect; tmux survives via `rediscover()`. |
| 4 | On Unix, agent uses real tmux; on Windows (no WSL), agent manages sessions directly | ✓ VERIFIED | (Unchanged) `session_pool.py` dispatches via `if sys.platform == "win32"` to `WindowsSessionManager` or `UnixSessionManager`. |
| 5 | Local Claude Code sessions on the host are detected and shown in the Claude overview | ✓ VERIFIED | (Unchanged) `agent/locus_agent/api/claude.py` scans tmux panes; `backend/app/services/claude.py` routes through `AgentClient.detect_claude_sessions()`. |
| 6 | "This Machine" shows as "needs_setup" with clear instructions when agent is not running | ✓ VERIFIED | `local/manager.py` returns `"needs_setup"` status (unchanged); CenterPanel.tsx now shows actual setup commands. "Coming in Phase 5" removed. All four required elements confirmed present: `(Recommended)`, `pip install ./agent`, `locus-agent start`, port 7700 + auto-detect note. |

**Score:** 6/6 success criteria verified

---

### Gap Closure Verification

The single gap from the initial verification was:

> CenterPanel.tsx line 146: "Coming in Phase 5." — stale placeholder. Does not tell the user to run `locus-agent start`.

Checks performed against the actual file:

| Check | Expected | Result |
|-------|----------|--------|
| "Coming in Phase 5" absent | No match | No matches found |
| "locus-agent start" present | Line 149 | `locus-agent start</code></pre>` at line 149 |
| "(Recommended)" label present | Line 142 | `Option A: Locus Host Agent (Recommended)` |
| "pip install ./agent" present | Line 148 | `<pre ...><code>pip install ./agent` |
| Port 7700 note present | Line 151 | `Runs on port 7700 by default. Locus auto-detects the agent from Docker.` |
| Commit f20bfd6 exists and modifies CenterPanel.tsx | Confirmed | `frontend/src/components/layout/CenterPanel.tsx | 9 +++++++--` |

Gap is fully closed.

---

### Required Artifacts

All artifacts verified in initial pass. Re-verification targets only the previously-failed artifact.

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `frontend/src/components/layout/CenterPanel.tsx` | needs_setup panel shows actual agent start instructions | ✓ VERIFIED | "Coming in Phase 5" removed; code block with `pip install ./agent` + `locus-agent start`; "(Recommended)" label; port 7700 + auto-detect note. All required content confirmed at lines 141-153. |

All other artifacts remain VERIFIED from initial pass (see initial verification for full artifact table).

---

### Key Link Verification

All 10 key links remain WIRED from initial verification. No files were modified that affect wiring. The only change was frontend UI text in CenterPanel.tsx.

---

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| `frontend/src/components/layout/CenterPanel.tsx` | needs_setup instructions | Static instructional text | N/A — static instructions, not data rendering | ✓ CORRECT (static instructions are correct by design) |

All other data-flow paths remain FLOWING from initial verification.

---

### Behavioral Spot-Checks

| Behavior | Check | Status |
|----------|-------|--------|
| "Coming in Phase 5" absent from CenterPanel.tsx | grep returned no matches | ✓ PASS |
| `locus-agent start` present in CenterPanel.tsx | grep found line 149 | ✓ PASS |
| "(Recommended)" label present | grep found line 142 | ✓ PASS |
| `pip install ./agent` present | grep found line 148 | ✓ PASS |
| Port 7700 auto-detect note present | grep found line 151 | ✓ PASS |
| Commit f20bfd6 exists | git show f20bfd6 --stat confirmed | ✓ PASS |

---

### Requirements Coverage

AGENT-01 through AGENT-06 are scoped IDs in ROADMAP.md and plan frontmatter. REQUIREMENTS.md has no AGENT-xx rows (unchanged finding from initial pass). Plan 05-07 SUMMARY frontmatter lists `requirements-completed: [AGENT-01, AGENT-06]`, consistent with the gap closure restoring full coverage of the start/setup path (AGENT-01) and Docker wiring + user setup clarity (AGENT-06).

| ID | Claimed by Plans | Key Capability | Verified |
|----|-----------------|----------------|---------|
| AGENT-01 | 01, 04, 05, 07 | Agent process start/stop, HTTP/WS API foundation, backend auto-detect, setup instructions | ✓ |
| AGENT-02 | 02, 06 | Terminal sessions (PTY/tmux/ConPTY), file operations API | ✓ |
| AGENT-03 | 02 | Session persistence across disconnects | ✓ |
| AGENT-04 | 02, 03 | Tmux management, WS terminal/logs endpoints | ✓ |
| AGENT-05 | 03, 05, 06 | Claude detection, git operations API | ✓ |
| AGENT-06 | 01, 04, 05, 07 | SCP deploy pipeline, version check, Docker Compose wiring, setup instructions clarity | ✓ |

---

### Anti-Patterns Found

No anti-patterns. The previously flagged "Coming in Phase 5" placeholder has been removed. No new TODO/FIXME/placeholder patterns introduced by the gap-closure commit.

---

### Human Verification Required

#### 1. needs_setup panel visual rendering

**Test:** Start Locus in Docker without the agent running. Navigate to "This Machine".
**Expected:** Panel shows Option A: "Locus Host Agent (Recommended)" with `pip install ./agent` and `locus-agent start` in a code block, and the note "Runs on port 7700 by default. Locus auto-detects the agent from Docker."
**Why human:** Visual UI rendering cannot be verified statically. Confirms the code change renders correctly in the browser without regressions.

#### 2. Full agent-to-browser terminal flow

**Test:** Start the Locus Agent on the host (`locus-agent start`), open Locus in a browser, navigate to "This Machine", open a terminal session.
**Expected:** Full terminal renders with colors; resize works; closing the tab and reopening reconnects to the same tmux session; scrollback visible.
**Why human:** Requires running agent + Docker stack; PTY rendering and mouse support cannot be verified statically.

#### 3. Claude session detection

**Test:** Start a `claude` process in a tmux session on the host, open the Claude Overview panel in Locus.
**Expected:** The running Claude session appears with correct tmux_session, window_index, window_name, and status.
**Why human:** Requires live tmux session and running agent.

---

### Summary

The single gap from the initial verification is closed. Commit f20bfd6 removed the stale "Coming in Phase 5" placeholder and replaced it with actionable setup instructions: `(Recommended)` label, `pip install ./agent` + `locus-agent start` code block, and the port 7700 / auto-detection note.

All 6 success criteria are now fully verified in static analysis. Phase 5 goal achievement is confirmed at the code level. Three items remain for human runtime verification (visual rendering, terminal flow, Claude detection) — none of these are regressions or new concerns; they are the same runtime items flagged in the initial verification and cannot be verified without a running stack.

---

_Verified: 2026-04-01T14:10:00Z_
_Verifier: Claude (gsd-verifier)_
