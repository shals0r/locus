# Project Research Summary

**Project:** Locus — Engineering Control Plane
**Domain:** Engineering cockpit / developer control plane (SSH terminals, multi-repo state, real-time work feed)
**Researched:** 2026-03-23
**Confidence:** HIGH

## Executive Summary

Locus is an engineering control plane — a single-user, self-hosted web app that aggregates SSH terminal access, multi-repo git state, a unified work feed, and AI agent session visibility into a three-panel browser UI. Research confirms this is a well-understood product category (developer portals, internal developer platforms) but with a genuinely novel combination: real-time SSH terminals in the browser, AI coding session orchestration, and a self-building integrations system driven by Claude. The recommended implementation is a FastAPI async backend (Python 3.12) with AsyncSSH for connection management, xterm.js for terminal emulation, React 19 + Zustand + TanStack Query on the frontend, PostgreSQL for persistence, and a separate Docker Compose service for the integrations runner. All components communicate over a Docker internal network; the API server is the sole external gateway.

The recommended approach prioritizes infrastructure reliability over feature breadth. SSH connection management, WebSocket transport, and the terminal embedding layer are foundational — every feature above them (git state, feed, GSD integration, AI review) depends on them working correctly. Research strongly recommends building the SSH pool with proper heartbeat detection, the WebSocket layer with sequence-numbered message replay, and the terminal layer with canvas renderer and bounded scrollback buffers before any application-layer features. The feed ingest architecture (universal `POST /api/feed/ingest` endpoint, async processing, idempotency) should be established in Phase 2 before any integration workers are built.

The key risks are in the infrastructure plumbing: SSH connections dying silently, WebSocket state divergence after reconnection, browser memory exhaustion from unbounded terminal scrollback, and git polling storms across many remote repos. All four are well-documented in the research with concrete prevention strategies. The integrations runner pattern (multiple polling workers in one container) also requires proper process supervision from the start, or worker failures will be invisible. Security requires credential column encryption with Fernet from the first database migration — this cannot be retrofitted cleanly.

## Key Findings

### Recommended Stack

The stack is async-native Python on the backend and modern React on the frontend, with no unnecessary infrastructure dependencies. FastAPI 0.135 + asyncpg + AsyncSSH gives a clean async event loop that handles WebSocket connections, SSH multiplexing, and background polling without thread executors. The frontend uses React 19 + Vite 8 + Zustand 5 + TanStack Query 5 — the 2026 standard for a data-heavy SPA. The most uncertain choice is `@git-diff-view/react` (~25K weekly downloads vs competitors' ~73K); `react-diff-view` is the documented fallback.

**Core technologies:**
- **FastAPI 0.135 + Uvicorn**: API server and WebSocket host — async-native, Pydantic validation built in, no other Python framework is competitive for this use case
- **AsyncSSH 2.22**: SSH connection management — async-native (critical), supports channel multiplexing over a single connection, 2x faster than Paramiko
- **asyncpg + SQLAlchemy 2.0 + Alembic**: Async Postgres access + migrations — fastest Python Postgres driver, first-class async ORM, standard migrations
- **@xterm/xterm 6.0**: Browser terminal emulator — industry standard (powers VS Code, Hyper), no real competitor
- **React 19 + TypeScript 5.7 + Vite 8**: Frontend foundation — required by constraints, Vite 8 is a major build performance improvement
- **Zustand 5 + TanStack Query 5**: Client state + server state — lightweight, no boilerplate, right separation of concerns for a real-time app
- **APScheduler 3.11**: Integration polling scheduler — no broker dependency (no Redis/RabbitMQ), runs in-process, right scale for single-user
- **Tailwind CSS 4.0**: Styling — zero-runtime, fast iteration, good for custom three-panel layouts
- **react-resizable-panels 2.x**: Three-panel layout — purpose-built for collapsible/resizable panels

### Expected Features

**Must have (table stakes):**
- SSH connection to remote machines with auto-reconnect — core premise, nothing works without this
- Terminal emulation with xterm.js (256-color, mouse events, resize) — users need real shell access
- tmux session attach/reconnect — target users are heavy tmux users
- Multi-tab terminal sessions — every modern terminal has this, users will revolt without it
- Machine connection status indicators — green/yellow/red, shows what's alive
- Current branch + clean/dirty/ahead/behind status per repo — absolute baseline for any git UI
- Basic git operations (fetch, pull, push, checkout) — if you show state, users expect to act on it
- Unified work feed with categorization — core value prop, without this Locus is just a terminal app
- Feed item read/dismiss/snooze — feed is unusable in days without state management
- Command palette with fuzzy search — keyboard power users demand this, it's table stakes in 2026
- Collapsible/resizable panels — focus modes require this
- Single-user auth + credential encryption — security baseline

**Should have (differentiators):**
- Claude Code session visibility across repos — strongest differentiator, no tool aggregates AI sessions cross-repo
- AI session "needs attention" notifications — surfaces when Claude is blocked waiting for input
- GSD phase state display per repo — unique to Locus, reads `.planning/` directory
- Diff viewer for local changes — see what Claude Code changed
- Universal ingest API with webhook support — feeds all integrations
- Self-building integrations via Integrator skill — Claude generates polling workers, eliminates plugin marketplace
- Local AI-assisted MR review with comment promotion — novel "review locally, promote" workflow
- Skills system with UI triggers — visual management beyond CLI

**Defer (v2+):**
- Morning brief / daily action plan — needs feed data volume first
- Multi-agent orchestration view — industry patterns still forming
- Session context carry-over across Claude Code sessions — high complexity, low v1 urgency
- Full-text search across feed — needs data volume and adds infrastructure
- Mobile UI — separate product milestone
- Smart ML-based feed prioritization — heuristics sufficient for v1

**Anti-features (explicitly excluded):**
- Full IDE / code editor (compete with VS Code/Cursor)
- Plugin marketplace (self-building integrations via Claude is the answer)
- Multi-user collaboration (single-user is a strength, not a limitation)
- Autonomous AI actions (human-in-the-loop always)
- CI/CD pipeline management UI (surface status in feed, link to CI UI)

### Architecture Approach

Locus is a four-service Docker Compose stack: `app` (FastAPI API server + built frontend), `db` (Postgres 16), `integrations-runner` (polling workers), plus shared volumes for worker scripts and SSH keys. The API server is the sole external gateway — all SSH, git, WebSocket, and REST traffic flows through it. An in-process event bus (asyncio queues, no Redis) broadcasts state changes to WebSocket clients. The integrations runner is intentionally isolated, communicating only via the feed ingest REST API, so integration bugs cannot crash the core system. Git operations run as CLI subprocess (not via GitPython ORM) to share a single code path for both local and remote-over-SSH execution.

**Major components:**
1. **SSH Pool** — persistent AsyncSSH connections per machine, channel multiplexing, heartbeat health monitoring
2. **Terminal Manager** — WebSocket-to-PTY bridge, session rebinding on reconnect, resize handling
3. **Feed Engine** — universal ingest API, async processing queue, categorization (Now/Respond/Review/Prep/Follow up), Postgres persistence
4. **Event Bus** — in-process asyncio pub/sub, broadcasts repo state, feed items, GSD transitions to all WebSocket clients
5. **Git Ops Layer** — CLI-based git commands over SSH for remote repos, adaptive polling with backoff
6. **GSD Reader** — parses `.planning/` directories on local and remote repos, surfaces phase state
7. **Integrations Runner** — supervised polling workers generated by Claude, isolated container, stateless design

### Critical Pitfalls

1. **SSH connections die silently** — implement application-level heartbeats (30s no-op, 3 misses = dead), TCP keepalive as safety net, connection state machine surfaced in UI; this must be in Phase 1 or everything above it is unreliable
2. **WebSocket state divergence on reconnect** — sequence-number every server-to-client message, maintain a per-connection replay buffer (5 min TTL), session IDs survive reconnection, exponential backoff with jitter; must be designed in from Phase 1, retrofitting is painful
3. **xterm.js WebGL context exhaustion** — use canvas renderer (`@xterm/addon-canvas`) as default (no context limit), dispose hidden terminal instances, only render visible terminals; decide renderer strategy before building multi-terminal UI
4. **Browser memory from unbounded scrollback** — cap scrollback at 1,000 lines, dispose terminals when tabs are hidden, implement "scrollback on demand" from backend for older output
5. **Git polling storms on remote machines** — event-driven state detection (`inotifywait`/`fswatch`) + adaptive intervals (active=10s, inactive=60s, no terminal=5min) + `--untracked-files=no` flag; must be designed in Phase 2, not bolted on later
6. **Credential plaintext in Postgres** — Fernet symmetric encryption from the first migration, key only in environment, column-level encryption abstraction layer; cannot be retrofitted cleanly
7. **Integration worker process chaos** — supervisord or Python multiprocessing supervisor, per-worker health checks, stateless design, dead-letter handling to feed; required before Claude starts generating workers
8. **Docker startup race conditions** — `depends_on: condition: service_healthy` for all services, proper health checks for Postgres and API, migrations in entrypoint after health check passes

## Implications for Roadmap

Based on research, the architecture's dependency chain suggests six phases. Infrastructure reliability must come before application features — every phase builds on the layer below it.

### Phase 1: Infrastructure Foundation

**Rationale:** SSH pool, WebSocket transport, database schema, and Docker Compose health checks are load-bearing for everything else. Pitfalls research confirms these are the highest-risk layers — silent SSH death, WebSocket state divergence, and Docker startup races must all be addressed here. Getting this wrong requires expensive retrofitting.

**Delivers:** Working Docker Compose stack, single-user auth, Postgres with encrypted credential schema, SSH connection pool with heartbeat monitoring, multiplexed event WebSocket with sequence numbers and replay, health check infrastructure.

**Addresses:** Auth, SSH connection status indicators, single-user access control.

**Avoids:** SSH silent death (Pitfall 1), WebSocket state divergence (Pitfall 3), credential plaintext storage (Pitfall 6), Docker startup races (Pitfall 8).

**Research flag:** Standard patterns — well-documented. Skip research-phase. FastAPI + AsyncSSH + Postgres are all mature with high-quality docs.

### Phase 2: Terminal and Multi-Repo Sidebar

**Rationale:** Terminal emulation is the product's core interactive surface. Must be built on top of the SSH pool from Phase 1. Renderer strategy (canvas, not WebGL) and scrollback limits must be decided before any multi-terminal UI is built, per pitfalls research.

**Delivers:** Working xterm.js terminal with SSH PTY bridge, tmux attach/reconnect, multi-tab terminal sessions, machine connection status indicators, multi-repo sidebar with branch state and dirty/ahead/behind indicators, basic git operations (fetch/pull/push/checkout), command palette.

**Addresses:** SSH terminal emulation, tmux support, multi-tab, git status, git ops, command palette (all table stakes).

**Avoids:** WebGL context exhaustion (Pitfall 2), browser memory exhaustion (Pitfall 4).

**Research flag:** xterm.js multi-terminal patterns may benefit from a focused research pass — specifically the canvas renderer addon and terminal disposal patterns. Otherwise standard.

### Phase 3: Work Feed and Ingest Architecture

**Rationale:** Feed ingest API must exist before any integration workers can be useful. The async processing pattern (verify-enqueue-ACK) must be established before webhooks arrive in volume. This phase can proceed in parallel with Phase 2 for the backend, but the UI depends on Phase 2's layout foundation.

**Delivers:** Universal `POST /api/feed/ingest` endpoint, async processing queue (Postgres-backed), feed panel UI with categorization (Now/Respond/Review/Prep/Follow up), read/dismiss/snooze, real-time WebSocket push via event bus, idempotency for duplicate webhooks, first integration (GitLab/GitHub webhooks).

**Addresses:** Unified feed, feed categorization, read/dismiss/snooze, webhook ingest, first real integration.

**Avoids:** Feed ingestion blocking (Pitfall 9), duplicate events from webhook retries.

**Research flag:** Feed categorization heuristics are not well-documented in the literature — this may need iteration based on usage. Flag for validation during implementation. GitLab/GitHub webhook shapes are well-documented.

### Phase 4: Git Intelligence and Diff Viewing

**Rationale:** Full git ops layer (beyond basic fetch/pull from Phase 2) and diff viewing depend on the SSH pool and repo sidebar from Phase 2. This phase adds the adaptive polling system to prevent remote machine load, adds the diff viewer component, and builds GSD directory reading.

**Delivers:** Adaptive git polling with `inotifywait`/`fswatch` events, diff viewer for local changes (pre-commit, Claude Code diffs), GSD phase state display in sidebar, GSD events surfacing in work feed, git CLI over SSH for remote repo ops.

**Addresses:** Local diff viewing, GSD phase visibility, git polling that doesn't hammer remote machines.

**Avoids:** Git polling storms (Pitfall 5).

**Research flag:** `inotifywait` on remote machines via SSH is a moderately niche pattern — may benefit from a focused research pass on reliable remote filesystem event watching over SSH.

### Phase 5: AI Session Visibility and Claude Code Integration

**Rationale:** Claude Code session management is Locus's primary differentiator. It depends on the terminal layer (Phase 2), feed system (Phase 3), and diff viewer (Phase 4). This phase is where Locus diverges from a plain terminal/git tool.

**Delivers:** Claude Code terminal session tracking per repo, AI session status indicators (active/waiting/completed), "needs attention" notifications when Claude blocks for input, session history display, diff viewer for Claude-produced changes.

**Addresses:** AI session visibility (key differentiator), AI session "needs attention" notifications.

**Research flag:** Claude Code session detection patterns are nascent — no established library or protocol. Needs a dedicated research pass. Industry is still defining how to surface AI agent state externally.

### Phase 6: Integrations Runner and Advanced Features

**Rationale:** Integrations runner requires the feed ingest API (Phase 3) and should not be built until the worker lifecycle management problem is understood. AI-assisted MR review requires the diff viewer (Phase 4). Skills system is the enabling infrastructure for self-building integrations.

**Delivers:** Integrations runner container with supervisord-managed workers, worker deployment API, health monitoring with dead-letter to feed, Integrator skill (Claude builds polling workers), AI-assisted MR review with comment promotion to GitLab/GitHub, skills system with UI triggers.

**Addresses:** Self-building integrations (key differentiator), AI-assisted review (differentiator), skills system.

**Avoids:** Integration worker process chaos (Pitfall 7).

**Research flag:** Dynamic worker hot-loading in an asyncio loop is a non-trivial pattern. The Integrator skill (Claude generating polling worker code) has no established reference implementation. This phase needs a dedicated research pass before planning.

### Phase Ordering Rationale

- SSH Pool is strictly foundational — terminals, git ops, GSD reading, and diff viewing on remote machines all depend on it, so it anchors Phase 1.
- WebSocket transport (with sequence numbers) underpins every real-time UI update; it must be solid before any panel feature is built.
- Feed ingest API must precede integrations runner — workers need somewhere to POST results.
- Git Ops layer must precede GSD reader — GSD state lives in git repositories.
- AI session visibility needs terminal layer + feed + diff viewer, so it lands in Phase 5.
- Integrations runner is last because it builds on the most other components and carries the most novel engineering risk.

### Research Flags

Needs `research-phase` during planning:
- **Phase 5** (AI session visibility): Claude Code session state detection has no established patterns. Industry nascent. Needs dedicated API/protocol research.
- **Phase 6** (Integrations runner + Integrator skill): Dynamic Python worker loading in asyncio, Claude-generated worker code deployment — no reference implementation. High novelty.
- **Phase 4** (remote filesystem events via SSH): `inotifywait` reliability over SSH multiplexed connection is moderately undocumented. Focused research recommended.

Standard patterns, skip research-phase:
- **Phase 1** (infrastructure): FastAPI + AsyncSSH + Postgres + Alembic are all mature with excellent docs.
- **Phase 2** (terminal): xterm.js + canvas renderer patterns are well-documented; canvas renderer is the recommended default.
- **Phase 3** (feed): Webhook ingest, Postgres-backed queues, GitLab/GitHub webhook shapes are well-documented.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All primary choices are mature, well-documented. Only risk is `@git-diff-view/react` maturity (~25K downloads). Fallback documented. |
| Features | MEDIUM-HIGH | Table stakes and differentiators well-researched against competitive landscape (Warp, VS Code, Linear, GitKraken, Backstage). Feed categories (Now/Respond/Review/Prep/Follow up) need usage validation. |
| Architecture | HIGH | Component boundaries and data flows are well-validated. In-process event bus (no Redis) and SSH channel multiplexing are explicitly documented patterns in upstream sources. Git CLI over SSH for remote ops is a pragmatic MEDIUM-confidence decision that trades GitPython abstraction for consistency between local and remote code paths. |
| Pitfalls | HIGH | All pitfalls verified against upstream issue trackers and official documentation, not just blog posts. Prevention strategies are specific and actionable. |

**Overall confidence:** HIGH

### Gaps to Address

- **Feed categorization heuristics**: The Now/Respond/Review/Prep/Follow up categories are designed but not validated against real usage. Build with easy reconfiguration in mind; expect to tune during early usage.
- **`@git-diff-view/react` maturity**: Only ~25K weekly downloads. Evaluate at integration time; `react-diff-view` is the documented fallback. Do not block on this — decide at Phase 4 start.
- **Claude Code session detection**: No established protocol for detecting Claude Code session state externally (blocked/active/complete). Research needed in Phase 5 planning. May require parsing terminal output or relying on file-based state in `.planning/`.
- **Remote filesystem event watching**: Running `inotifywait` on remote machines via SSH multiplexed channel is not heavily documented. May need to fall back to adaptive polling if event-driven approach proves unreliable. Adaptive polling is well-understood as a fallback.
- **Worker hot-loading pattern**: Dynamically loading Python worker modules into a running asyncio loop without restart has edge cases (module state, exception handling). Research in Phase 6 planning.

## Sources

### Primary (HIGH confidence)
- [FastAPI official docs](https://fastapi.tiangolo.com/) — WebSocket endpoints, async patterns
- [AsyncSSH documentation](https://asyncssh.readthedocs.io/) — connection multiplexing, channel reuse
- [xterm.js GitHub](https://github.com/xtermjs/xterm.js/) — renderer options, buffer limits, issue tracker
- [SQLAlchemy 2.0 docs](https://docs.sqlalchemy.org/) — async engine, Core vs ORM patterns
- [Alembic docs](https://alembic.sqlalchemy.org/) — migration patterns
- [Vite 8 announcement](https://vite.dev/blog/announcing-vite8) — Rolldown bundler performance
- [Docker Compose health checks guide](https://www.tvaidyan.com/2025/02/13/health-checks-in-docker-compose-a-practical-guide/) — `condition: service_healthy` pattern

### Secondary (MEDIUM confidence)
- [Warp 2025 Year in Review](https://www.warp.dev/blog/2025-in-review) — multi-agent, session sharing patterns
- [VS Code 1.107 Agent HQ](https://visualstudiomagazine.com/articles/2025/12/12/vs-code-1-107-november-2025-update-expands-multi-agent-orchestration-model-management.aspx) — background agent patterns
- [GitKraken Multi-Repo Workspaces](https://www.gitkraken.com/features/workspaces) — multi-repo feature expectations
- [Linear project management](https://linear.app/) — keyboard-first UX benchmark
- [pyxtermjs reference implementation](https://github.com/cs01/pyxtermjs) — Python + xterm.js integration patterns
- [WebSocket reconnection guide](https://websocket.org/guides/reconnection/) — sequence numbers, state sync

### Tertiary (LOW confidence)
- [Google Antigravity](https://www.marktechpost.com/2025/11/19/google-antigravity-makes-the-ide-a-control-plane-for-agentic-coding/) — IDE as agent control plane concept (validates direction)
- [@git-diff-view/react npm](https://www.npmjs.com/package/@git-diff-view/react) — diff viewer choice (low download count, needs validation at integration time)

---
*Research completed: 2026-03-23*
*Ready for roadmap: yes*
