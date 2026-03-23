# Phase 1: Infrastructure & Terminal Core - Context

**Gathered:** 2026-03-23
**Status:** Ready for planning

<domain>
## Phase Boundary

Deliver the foundational Docker stack, single-user authentication, SSH terminal management with tmux support, and the three-panel layout shell. After this phase, a user can `docker compose up`, log in, connect to remote machines, and work in full terminal sessions across a collapsible three-panel layout.

Requirements covered: TERM-01 through TERM-07, AUTH-01 through AUTH-04, DEPL-01 through DEPL-03, UI-03, UI-04.

</domain>

<decisions>
## Implementation Decisions

### Terminal Session Model
- **D-01:** Tab-per-machine organization — each machine gets a top-level tab, with sub-tabs for individual sessions (shell or Claude Code) within that machine
- **D-02:** Claude Code sessions appear mixed in the sub-tab bar alongside regular shell tabs, distinguished by a visual indicator (icon/color)
- **D-03:** A dedicated Claude Code sessions overview (feed-style list) shows all active sessions across all machines with status (idle/running/waiting), last activity, and repo name. Click to jump to that session's tab.
- **D-04:** New terminal tab opens a quick repo picker (repos known to that machine), with option to open a plain shell instead

### Panel Layout & Shell
- **D-05:** Left sidebar shows machine list in Phase 1 — connected machines with online/offline status, expandable to show active sessions. This tree becomes the machine/repo navigator in Phase 2.
- **D-06:** Right panel (future work feed) starts collapsed by default in Phase 1. Panel infrastructure is built but not shown until Phase 2.
- **D-07:** Drag handles between panels for resizing. Click panel header to collapse/expand. Double-click handle to reset to default width.
- **D-08:** Top bar contains: left — Locus logo/name; center — connected service status indicators (SSH, DB, Claude Code); right — user menu (settings, logout). Machine tabs live below the top bar.

### Auth & First-Run Setup
- **D-09:** First-run setup wizard: create password → add first machine (SSH host/key) → optionally add service credentials. Optional steps can be skipped and configured later via settings.
- **D-10:** Service credentials managed via a settings page with per-credential "Test connection" button. Stored encrypted in Postgres with a per-instance encryption key from env var. UI should be extensible for future service types added via the Integrator skill.
- **D-11:** Claude Code auth (API key or OAuth) stored centrally in Locus settings. When connecting to a machine, Locus pushes the auth config to that machine via SSH (writes to ~/.claude/ or sets env vars).

### SSH & Machine Management
- **D-12:** Machines added via a form in settings: name, host, port, username, SSH key path. Test connection button. Also accessible from sidebar "+ Add machine" shortcut.
- **D-13:** SSH reconnection: auto-reconnect with exponential backoff up to a set max retries. On max retries exhausted, show "Connection lost" banner with manual "Reconnect" button. On successful reconnect, auto-reattach to tmux session.
- **D-14:** Tmux session handling on connect: auto-detect existing tmux sessions, show picker to attach to one or create new. If none found, create new tmux session automatically.
- **D-15:** Machine status via periodic heartbeat (e.g., every 30s). Sidebar shows green/red dot. Keeps SSH control connection alive for fast terminal opens.

### Repo Discovery
- **D-16:** User configures 1-2 root directories per machine (e.g., ~/projects, ~/work). Locus scans those paths for git repos on connect. New repos auto-discovered on subsequent scans.

### Theme
- **D-17:** Dark theme only for v1. Terminal-heavy UI looks best dark, avoids theming complexity.

### Docker Compose
- **D-18:** Single docker-compose.yml with Docker Compose profiles for dev vs prod. `docker compose --profile dev up` enables hot-reload volumes, Vite dev server, and debug mode.

### Claude's Discretion
- Panel default proportions and breakpoints
- Heartbeat interval tuning
- Terminal color scheme specifics within dark theme
- Reconnection backoff parameters (initial delay, max delay, max retries)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project Specification
- `.planning/PROJECT.md` — Core architecture, constraints, key decisions
- `.planning/REQUIREMENTS.md` — Full v1 requirements with traceability matrix
- `.planning/ROADMAP.md` — Phase breakdown, success criteria, dependency chain

### Technology Stack
- `CLAUDE.md` §Recommended Stack — Complete technology choices with versions, rationale, and alternatives considered

No external specs — requirements fully captured in decisions above and project documents.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- None — greenfield project, no existing code

### Established Patterns
- None yet — patterns will be established in this phase

### Integration Points
- Docker Compose is the entry point — app, db, and integrations runner containers
- FastAPI serves both the API and WebSocket endpoints
- xterm.js in the browser connects to AsyncSSH on the backend via WebSocket

</code_context>

<specifics>
## Specific Ideas

- Credential settings UI must be extensible for future service types — when the Integrator skill (Phase 4) builds new integrations, their credential inputs should follow the same pattern with test connectivity buttons
- Auto-reconnect → manual fallback pattern for SSH: exponential backoff with a cap, then surface a manual reconnect button rather than retrying forever

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 01-infrastructure-terminal-core*
*Context gathered: 2026-03-23*
