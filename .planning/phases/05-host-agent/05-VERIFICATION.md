---
phase: 05-host-agent
verified: 2026-04-03T11:15:22Z
status: passed
score: 10/10 must-haves verified
re_verification:
  previous_status: human_needed
  previous_score: 6/6
  gaps_closed:
    - "Remote agent auto-deploys on SSH connect and is registered in machine_registry (plan 05-08)"
    - "Claude sessions on VPS now route through agent when deployed, falling back to SSH (plan 05-08)"
    - "Settings UI allows configuring local repo scan paths; setting persists in DB (plan 05-09)"
    - "File content search (grep/ripgrep) across all repos in command palette with click-to-open (plan 05-10)"
  gaps_remaining: []
  regressions: []
human_verification:
  - test: "Start locus-agent on a VPS that has Claude running in tmux, open the Claude overview in Locus."
    expected: "Claude session appears; detection routes through agent HTTP API (not SSH exec)."
    why_human: "Requires live agent + VPS + tmux session. Cannot verify agent-routing vs SSH-routing statically."
  - test: "Open Settings, add a directory path under General, click Save, open command palette."
    expected: "Repos in that directory appear in search results immediately without page reload."
    why_human: "Requires running DB and frontend. Verifies DB persistence and live repo scan trigger."
  - test: "Type a 3+ character code search in command palette."
    expected: "File Contents group appears with file:line titles and matching-text subtitles; clicking opens editor tab."
    why_human: "Requires running backend with repos configured. Content search behavior cannot be verified statically."
---

# Phase 5: Host Agent Verification Report

**Phase Goal:** A lightweight universal agent process deployed to every connected machine, replacing SSH as the primary communication channel with an HTTP/WebSocket API for terminals, tmux, Claude detection, file operations, and git operations
**Verified:** 2026-04-03T11:15:22Z
**Status:** passed
**Re-verification:** Yes — after gap closure (plans 05-08, 05-09, 05-10 committed 2026-04-03)

## Goal Achievement

### Observable Truths (Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | User can start the host agent with `locus-agent start` and Locus auto-detects it from Docker | ✓ VERIFIED | CenterPanel.tsx line 149: `locus-agent start` in code block; line 151: "Runs on port 7700 by default. Locus auto-detects the agent from Docker." Backend `probe_agent` in deployer.py unchanged. |
| 2 | User can open terminal sessions on the host machine from Locus with full terminal UX (colors, mouse, resize) | ✓ VERIFIED | `ws/terminal.py` proxies to agent; `UnixSessionManager` uses `pty.openpty()` + `TIOCSWINSZ`; WindowsSessionManager uses ConPTY. Human UAT passed (result: pass). |
| 3 | Terminal sessions survive browser disconnects and Docker restarts | ✓ VERIFIED | `session_pool.detach()` on disconnect; `get_scrollback()` replays on reconnect; tmux survives via `rediscover()`. Human UAT passed. |
| 4 | On Unix agent uses real tmux; on Windows (no WSL) agent manages sessions directly | ✓ VERIFIED | `session_pool.py` dispatches via `if sys.platform == "win32"` to `WindowsSessionManager` or `UnixSessionManager`. |
| 5 | Local Claude Code sessions on the host are detected and shown in the Claude overview | ✓ VERIFIED | `agent/locus_agent/api/claude.py` scans tmux panes; `backend/app/services/claude.py:286-288` routes through `get_agent_client_for_machine()` with SSH fallback. |
| 6 | "This Machine" shows as "needs_setup" with clear instructions when agent is not running | ✓ VERIFIED | `local/manager.py:200` returns `"needs_setup"`; CenterPanel.tsx:141-153 shows Option A "(Recommended)" + `pip install ./agent` + `locus-agent start` + port 7700 note. Human UAT passed (result: pass). |
| 7 | Remote machines auto-deploy agent on SSH connect and route operations through it | ✓ VERIFIED | `machines.py:78-88` `_try_deploy_agent` wraps `ensure_agent`; called at lines 138, 287. `main.py:144-152` deploys agents on startup. `machine_registry.py:92` `get_agent_client_for_machine` returns remote client. Commits 015f0d1, 2100b3b. |
| 8 | Claude sessions on VPS (remote machines) are detected via agent when deployed | ✓ VERIFIED | `claude.py:252` `detect_claude_sessions_via_agent`; line 282-288 calls `get_agent_client_for_machine` and routes through agent when available. Plan 05-08 removed "not yet implemented" placeholder. |
| 9 | User can configure local repo scan paths from Settings UI; setting persists across restarts | ✓ VERIFIED | `models/app_setting.py` AppSetting model; `api/settings.py:105-144` GET/PUT `/api/settings/general`; `GeneralSettings.tsx` TanStack Query fetch/mutate; `SettingsPage.tsx` General section as first section. Commits 7886923, fb4baa0. |
| 10 | File content search (grep) across repos is available in command palette with click-to-open | ✓ VERIFIED | `agent/client.py` `search_files()` method; `api/search.py:128` `_search_file_contents()` called at line 64; `CommandPalette.tsx:30` `file_content` type; click handler calls `openEditorTab`. Commits 0d5c794, 6a51559, 503b03d. |

**Score:** 10/10 truths verified

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `backend/app/services/machine_registry.py` | Remote agent client storage with register/unregister | ✓ VERIFIED | `_remote_agent_clients` dict at module level; `register_agent_client`, `unregister_agent_client` functions; `get_agent_client_for_machine` checks remote dict at line 92. |
| `backend/app/api/machines.py` | Agent auto-deploy on SSH connect | ✓ VERIFIED | `_try_deploy_agent` at line 78; called in `create_machine` (line 138) and `connect_machine` (line 287); `unregister_agent_client` in `disconnect_machine` (line 303). |
| `backend/app/main.py` | Agent auto-deploy on startup for connected machines | ✓ VERIFIED | Lines 144-152: `ensure_agent` + `register_agent_client` loop after SSH reconnect; lines 189-195: `_remote_agent_clients` cleanup on shutdown. |
| `backend/app/services/claude.py` | Agent-first Claude detection for remote machines | ✓ VERIFIED | `detect_claude_sessions_via_agent` at line 252; `get_agent_client_for_machine` call at line 282-288; debug log at line 301 for SSH fallback. |
| `backend/app/models/app_setting.py` | AppSetting key-value model | ✓ VERIFIED | `class AppSetting(Base)` with `__tablename__ = "app_settings"`, `key` (String(255), primary_key), `value` (Text). |
| `backend/app/models/__init__.py` | AppSetting exported | ✓ VERIFIED | `from app.models.app_setting import AppSetting` and "AppSetting" in `__all__`. |
| `backend/app/api/settings.py` | GET/PUT /api/settings/general endpoints | ✓ VERIFIED | `GET /general` at line 105 and `PUT /general` at line 123; both return `GeneralSettingsResponse` with `local_repo_scan_paths`. |
| `backend/app/config.py` | DB-backed scan path helper | ✓ VERIFIED | `async def get_local_scan_paths_from_db` present; called by `search.py` (lines 84, 143) and `machines.py` (line 325). |
| `frontend/src/components/settings/GeneralSettings.tsx` | Settings UI for scan path configuration | ✓ VERIFIED | `export function GeneralSettings`; `useQuery` fetches `/api/settings/general`; `useMutation` PUTs on save; `dirty` state tracking; add/remove path buttons. |
| `frontend/src/components/settings/SettingsPage.tsx` | General section as first section | ✓ VERIFIED | `import { GeneralSettings }` and `<GeneralSettings />` inside "General" section; rendered before Machines section. |
| `backend/app/agent/client.py` | `search_files()` public method | ✓ VERIFIED | `async def search_files(self, path, pattern, max_results, glob)` wrapping `POST /files/search`. |
| `backend/app/api/search.py` | `_search_file_contents()` with agent-first + SSH fallback | ✓ VERIFIED | Function at line 128; agent path at ~line 155; SSH grep fallback at ~line 185; called from main `search()` at line 64; `get_local_scan_paths_from_db` used. |
| `frontend/src/components/palette/CommandPalette.tsx` | `file_content` type rendering with click-to-open | ✓ VERIFIED | `"file_content"` in `SearchResult` type union (line 30); `FileText` icon in `typeIcons` (line 64); `"File Contents"` group label (line 72); click handler with `openEditorTab` (line 191-197); monospace font for `file_content` titles (line 467). |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `machines.py` | `agent/deployer.py` | `ensure_agent` call after ssh_manager.connect | ✓ WIRED | Line 85: `ensure_agent(ssh_conn, host=host, port=7700)` inside `_try_deploy_agent`; called at lines 138, 287. |
| `machine_registry.py` | `agent/client.py` | `_remote_agent_clients` dict lookup | ✓ WIRED | Line 92: `return _remote_agent_clients.get(machine_id)`; dict populated by `register_agent_client` at line ~70. |
| `claude.py` | `machine_registry.py` | `get_agent_client_for_machine` for remote machines | ✓ WIRED | Line 282: `from app.services.machine_registry import get_agent_client_for_machine`; line 286: `agent_client = await get_agent_client_for_machine(machine_id)`. |
| `GeneralSettings.tsx` | `/api/settings/general` | `apiGet` and `apiPut` | ✓ WIRED | Lines 17-19: `useQuery` with `apiGet("/api/settings/general")`; lines 29-33: `useMutation` with `apiPut("/api/settings/general", ...)`. |
| `api/settings.py` | `models/app_setting.py` | SQLAlchemy query on `AppSetting` | ✓ WIRED | Lines 105-144 use `await db.get(AppSetting, "local_repo_scan_paths")` and `await db.merge(AppSetting(...))`. |
| `config.py` | `models/app_setting.py` | `get_local_scan_paths_from_db` reads DB setting | ✓ WIRED | `async_session_factory` + `await db.get(AppSetting, "local_repo_scan_paths")`; called by `search.py` and `machines.py`. |
| `CommandPalette.tsx` | `/api/search` | fetch with query param | ✓ WIRED | Existing wiring from earlier plans; unchanged. |
| `api/search.py` | `agent/client.py` | `agent.search_files()` for ripgrep-based search | ✓ WIRED | Line 64 calls `_search_file_contents`; inside that function `agent.search_files(path=..., pattern=..., max_results=5)` called when agent available. |
| `api/search.py` | `machine_registry.py` | `run_command_on_machine` for grep fallback | ✓ WIRED | `from app.services.machine_registry import get_agent_client_for_machine, run_command_on_machine` imported; `run_command_on_machine` called in SSH fallback path. |
| `api/search.py` | `config.py` | `get_local_scan_paths_from_db` for local repo paths | ✓ WIRED | Lines 84, 143: `from app.config import get_local_scan_paths_from_db`; result used with env var fallback. |

---

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| `GeneralSettings.tsx` | `paths` (local_repo_scan_paths) | `GET /api/settings/general` → AppSetting DB row | Yes — DB query `await db.get(AppSetting, "local_repo_scan_paths")`; env var fallback if no DB row | ✓ FLOWING |
| `CommandPalette.tsx` file_content results | `results` array from `/api/search` | `_search_file_contents()` → `agent.search_files()` or `run_command_on_machine` grep | Yes — real file system search via ripgrep or grep | ✓ FLOWING |
| `api/settings.py` general endpoint | `AppSetting` row | `await db.get(AppSetting, ...)` + `await db.merge(AppSetting(...))` | Yes — SQLAlchemy query against `app_settings` table | ✓ FLOWING |
| `machines.py` connect flow | `base_url, token` from `ensure_agent` | `deployer.py ensure_agent` → SSH + agent health check | Yes — real SSH exec to deploy + HTTP probe to verify | ✓ FLOWING |

---

### Behavioral Spot-Checks

| Behavior | Check | Status |
|----------|-------|--------|
| `_remote_agent_clients` dict exists in machine_registry | `'_remote_agent_clients' in open(...).read()` | ✓ PASS |
| `register_agent_client` and `unregister_agent_client` functions exist | `ast.parse` function name check | ✓ PASS |
| `ensure_agent` imported in machines.py | grep | ✓ PASS |
| `_try_deploy_agent` defined and called at connect site | grep lines 78, 138, 287 | ✓ PASS |
| `AppSetting` class in models | `ast.parse` class check | ✓ PASS |
| `AppSetting` exported from `models/__init__.py` | string check | ✓ PASS |
| GET/PUT `/general` routes in settings.py | grep lines 105, 123 | ✓ PASS |
| `get_local_scan_paths_from_db` in config.py | string check | ✓ PASS |
| `get_local_scan_paths_from_db` called in search.py | grep lines 84, 143 | ✓ PASS |
| `export function GeneralSettings` in GeneralSettings.tsx | string check | ✓ PASS |
| `GeneralSettings` imported and rendered in SettingsPage.tsx | string check | ✓ PASS |
| `async def search_files` in agent/client.py | string check | ✓ PASS |
| `_search_file_contents` called from main `search()` | grep line 64 | ✓ PASS |
| `file_content` in CommandPalette type union and icons map | string check | ✓ PASS |
| `openEditorTab` in CommandPalette click handler for file_content | string check + grep lines 191-197 | ✓ PASS |
| Commits 015f0d1, 2100b3b, 7886923, fb4baa0, 0d5c794, 6a51559, 503b03d exist | `git log --oneline` | ✓ PASS |
| "Coming in Phase 5" absent from CenterPanel.tsx | grep returned no matches | ✓ PASS |
| "agent support not yet implemented" absent from machine_registry.py | grep returned no matches | ✓ PASS |

---

### Requirements Coverage

AGENT-xx IDs are defined in ROADMAP.md (line 150). REQUIREMENTS.md has no AGENT-xx rows — these are phase-internal IDs not cross-referenced to the global requirements table. This is consistent and unchanged from prior verification.

| ID | Claimed by Plans | Key Capability | Verified |
|----|-----------------|----------------|---------|
| AGENT-01 | 01, 04, 05, 07, 08 | Agent process start/stop, HTTP/WS API, backend auto-detect, setup instructions, remote agent deploy lifecycle | ✓ |
| AGENT-02 | 02, 06, 09, 10 | Terminal sessions (PTY/tmux/ConPTY), file operations API, settings UI for repo scan paths, file content search | ✓ |
| AGENT-03 | 02, 10 | Session persistence across disconnects, file content search in command palette | ✓ |
| AGENT-04 | 02, 03, 10 | Tmux management, WS terminal/logs endpoints, command palette file search | ✓ |
| AGENT-05 | 03, 05, 06, 08 | Claude detection, git operations API, agent-first detection for remote machines | ✓ |
| AGENT-06 | 01, 04, 05, 07, 08, 09 | SCP deploy pipeline, version check, Docker Compose wiring, setup instructions clarity, remote agent connect, DB-backed settings | ✓ |

---

### Anti-Patterns Found

No blockers or warnings found in any of the gap-closure files.

| File | Pattern Checked | Result |
|------|-----------------|--------|
| `backend/app/services/machine_registry.py` | TODO/FIXME/placeholder/return empty | None found |
| `backend/app/api/machines.py` | TODO/FIXME/placeholder | None found |
| `backend/app/main.py` | TODO/FIXME/placeholder | None found |
| `backend/app/services/claude.py` | TODO/FIXME/placeholder | None found |
| `backend/app/models/app_setting.py` | TODO/FIXME/placeholder | None found |
| `backend/app/api/settings.py` | TODO/FIXME/placeholder | None found |
| `backend/app/config.py` | TODO/FIXME/placeholder | None found |
| `backend/app/api/search.py` | TODO/FIXME/not implemented | None found |
| `backend/app/agent/client.py` | TODO/FIXME/placeholder | None found |
| `frontend/src/components/settings/GeneralSettings.tsx` | TODO/FIXME/placeholder/return null | `placeholder=` attribute is a UI input hint — not a code stub. No code stubs found. |
| `frontend/src/components/settings/SettingsPage.tsx` | TODO/FIXME/placeholder | None found |
| `frontend/src/components/palette/CommandPalette.tsx` | TODO/FIXME/return null | None found |

---

### Plan 05-10 Deviation: get_local_scan_paths_from_db

The plan 05-10 SUMMARY documented a deviation: "used `settings.local_repo_scan_paths` directly because `get_local_scan_paths_from_db` did not exist." However, commit `503b03d` (`fix(05-10): use get_local_scan_paths_from_db in file content search`) corrects this, and the actual `search.py` code at lines 84 and 143 calls `get_local_scan_paths_from_db`. The deviation was self-corrected before the phase was complete. No residual issue.

---

### Human Verification Required

#### 1. Agent-first Claude detection on VPS (runtime path)

**Test:** SSH to a VPS machine from Locus (so agent auto-deploys), start `claude` in a tmux session on the VPS, open the Claude Overview panel.
**Expected:** Claude session appears; the path taken should be agent HTTP API, not SSH exec.
**Why human:** Requires live VPS + running agent + tmux session. The code path is wired (claude.py line 286-288 tries agent first) but actual agent-routing vs SSH-routing cannot be verified without a running stack.

#### 2. Settings UI — scan path persistence and live repo discovery

**Test:** Open Settings in a running Locus instance, add an absolute directory path under "General", click Save. Then open the command palette.
**Expected:** Repos in that directory appear in search results immediately; the setting persists across a container restart (DB-backed, not env var).
**Why human:** Requires running DB + frontend. Verifies that `PUT /api/settings/general` writes to DB, `Base.metadata.create_all` creates the `app_settings` table, and the scan path is picked up by `_search_repos`.

#### 3. File content search in command palette

**Test:** With repos configured, type a 3+ character string that appears in source code into the command palette.
**Expected:** A "File Contents" group appears with entries showing `relative/path.ts:42` titles and matching-text subtitles; clicking a result opens the file in the Monaco editor at the correct line.
**Why human:** Requires running backend with configured repos. Content search behavior and editor open cannot be verified statically.

---

### Summary

Plans 05-08, 05-09, and 05-10 close all four gaps discovered during human UAT:

1. **Remote agent deploy** (05-08): `_remote_agent_clients` dict + `register_agent_client`/`unregister_agent_client` lifecycle; `_try_deploy_agent` wired into SSH connect/disconnect/startup. Remote machines now get an agent on SSH connect with non-blocking SSH fallback.

2. **Remote Claude detection** (05-08): `detect_claude_sessions_via_agent` path now reachable for remote machines because `get_agent_client_for_machine` returns the registered remote client instead of always returning None.

3. **Settings UI for scan paths** (05-09): `AppSetting` model, `GET/PUT /api/settings/general`, `GeneralSettings.tsx`, DB-backed path resolution with env var fallback. Repo scan paths are now configurable without env var or container restart.

4. **File content search** (05-10): `AgentClient.search_files()` wraps the agent's POST /files/search; `_search_file_contents()` in search.py tries ripgrep via agent first, SSH grep as fallback; `CommandPalette.tsx` renders file_content results with monospace file:line titles and click-to-open.

All 10 observable truths (6 original success criteria + 4 UAT gaps) are verified at the code level. Three items require human runtime verification — all are "does the correct runtime behavior occur" questions that cannot be answered statically.

---

_Verified: 2026-04-03T11:15:22Z_
_Verifier: Claude (gsd-verifier)_
