---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: verifying
stopped_at: Completed 04-05-PLAN.md
last_updated: "2026-03-28T20:03:40.164Z"
last_activity: 2026-03-28
progress:
  total_phases: 6
  completed_phases: 4
  total_plans: 40
  completed_plans: 35
  percent: 100
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-23)

**Core value:** Open one tool and immediately know what needs attention, across every repo, machine, agent session, and work stream -- then act on it without switching context.
**Current focus:** Phase 02 complete — ready for Phase 03

## Current Position

Phase: 05
Plan: Not started
Status: Phase complete — ready for verification
Last activity: 2026-03-28

Progress: [██████████] 100% (11/11 plans)

## Performance Metrics

**Velocity:**

- Total plans completed: 10
- Average duration: ~4min
- Total execution time: ~40 min

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| Phase 01 | 7 | ~21min | ~3min |
| Phase 01.1 | 3 | 19min | ~6.3min |

**Recent Trend:**

- Last 5 plans: 4min, 6min, 5min, 8min
- Trend: stable (Phase 01.1 slightly longer due to checkpoint interaction)

*Updated after each plan completion*
| Phase 01 P01 | 3min | 2 tasks | 27 files |
| Phase 01 P02 | 2min | 2 tasks | 8 files |
| Phase 01 P03 | 3min | 2 tasks | 7 files |
| Phase 01 P04 | 3min | 2 tasks | 15 files |
| Phase 01 P05 | 2min | 2 tasks | 6 files |
| Phase 01 P06 | 4min | 2 tasks | 13 files |
| Phase 01 P07 | 4min | 2 tasks | 14 files |
| Phase 01.1 P01 | 6min | 2 tasks | 9 files |
| Phase 01.1 P02 | 5min | 2 tasks | 6 files |
| Phase 01.1 P03 | 8min | 2 tasks | 11 files |
| Phase 02 P01 | 2min | 2 tasks | 8 files |
| Phase 02 P02 | 5min | 2 tasks | 8 files |
| Phase 02 P03 | 5min | 2 tasks | 9 files |
| Phase 02 P04 | 2min | 2 tasks | 3 files |
| Phase 02 P08 | 5min | 2 tasks | 9 files |
| Phase 03 P09 | 7min | 2 tasks | 9 files |
| Phase 04 P05 | 5min | 2 tasks | 10 files |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- [Roadmap]: Coarse granularity -- 4 phases compressing 44 requirements. Phases 3 and 4 both depend on Phase 2 and can potentially overlap.
- [Phase 01]: Used AliasChoices for LOCUS_DB_URL env var mapping (pydantic-settings v2 pattern)
- [Phase 01]: Tailwind v4 CSS-based @theme block for design tokens instead of JS config
- [Phase 01]: Service layer pattern: auth logic in services/, API routes in api/, schemas in schemas/
- [Phase 01]: One Zustand store per domain (auth, machines, sessions, panels) for clean separation
- [Phase 01]: Panel ref synced bidirectionally with Zustand store for programmatic and drag collapse
- [Phase 01]: Always wrap terminal sessions in tmux -- no bare PTY sessions
- [Phase 01]: WebSocket auth via token query param; JWT validation deferred to auth service
- [Phase 01]: Raw bytes mode (encoding=None) for binary transparency in SSH terminal I/O
- [Phase 01]: Inline schemas in settings.py -- credential/claude-code schemas co-located with routes
- [Phase 01]: Dynamic credential fields per service type for Phase 4 extensibility
- [Phase 01]: TmuxPicker auto-creates session when none exist (per D-14)
- [Phase 01]: Custom binary WebSocket handler instead of addon-attach for terminal I/O
- [Phase 01]: Status WebSocket with 30s polling and immediate push via ssh_manager callbacks
- [Phase 01.1]: AliasChoices + raw string property for local_repo_scan_paths (pydantic-settings v2 JSON-parses list fields before validators)
- [Phase 01.1]: Transport abstraction: LocalMachineManager mirrors SSHManager interface (Docker=SSH, native=subprocess)
- [Phase 01.1]: Machine registry pattern: all machine lookups route through services/machine_registry.py
- [Phase 01.1]: Inline startup migration for UUID->VARCHAR schema evolution (no Alembic needed)
- [Phase 01.1]: CRUD/connect/disconnect endpoints keep machine_id: UUID -- "local" correctly fails validation for remote-only operations
- [Phase 01.1]: Subprocess Claude detection mirrors SSH version for consistent native-mode status parsing
- [Phase 01.1]: conn=None sentinel from LocalMachineManager triggers subprocess code path in native mode only
- [Phase 01.1]: is_usable property gates all host operations -- Docker mode without SSH returns "needs_setup" status
- [Phase 01.1]: 409 Conflict for needs_setup operations (consistent with "not connected" pattern for remote machines)
- [Phase 01.1]: CenterPanel shows setup instructions panel instead of SessionTabBar when machine needs_setup
- [Phase 02]: FeedItem uses JSON column for raw_payload; Task.feed_item_id nullable for manual tasks; IntegrationSource.source_type unique per type; selectin loading for Task->FeedItem relationship
- [Phase 02]: All git ops via CLI over SSH, not GitPython (requires local filesystem)
- [Phase 02]: AI tier classification calls Anthropic API with source-type heuristic fallback
- [Phase 02]: HMAC webhook auth with JWT fallback on feed ingest endpoint
- [Phase 02]: broadcast_feed_update uses synchronous put_nowait to avoid blocking API routes
- [Phase 02]: Search repos by scan path name matching (not live scanning) for faster command palette
- [Phase 02]: Explicit typed arrays for task grouping instead of Record indexing for TypeScript strictness
- [Phase 02]: Inline picker pattern for StartFlowPicker: multi-step selection rendered below triggering card in 340px panel
- [Phase 03]: Custom events for cross-component tab switching (command palette -> sidebar)
- [Phase 03]: Command palette sub-modes (goto-line) via commandPaletteStore mode state
- [Phase 04]: Heuristic structured card extraction from Claude response text (regex patterns for credentials, test results, deploy readiness)
- [Phase 04]: Lazy import of worker_supervisor in deploy endpoint for optional dependency handling
- [Phase 04]: Custom event open-integrator for cross-component communication from Settings to Integrator

### Pending Todos

None yet.

### Roadmap Evolution

- Phase 1.1 inserted after Phase 1: Local Machine Support (URGENT) -- Phase 1 built everything SSH-only; local dev (repos, terminals, Claude sessions on the host machine) has no support. "This Machine" must be first-class before Phase 2 builds the git sidebar on top of it.
- Phase 5 added: Host Agent -- lightweight host-side process bridging Docker-to-host for "This Machine" terminals, session persistence, and Claude detection without SSH. Discovered during Phase 1.1 verification: Docker containers can't access the host without SSH or an agent, and the subprocess fallback incorrectly gives a container shell. Agent handles Windows (no tmux) and Unix (real tmux) hosts.

### Blockers/Concerns

- Research flags from SUMMARY.md: Phase 4 (integrations runner, Integrator skill) needs dedicated research during planning -- dynamic worker hot-loading and Claude-generated worker code have no reference implementations.

## Session Continuity

Last session: 2026-03-28T20:03:40.156Z
Stopped at: Completed 04-05-PLAN.md
Resume file: None
