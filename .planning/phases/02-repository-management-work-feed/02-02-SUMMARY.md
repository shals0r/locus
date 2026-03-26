---
phase: 02-repository-management-work-feed
plan: 02
subsystem: api, services
tags: [git, feed, task, gsd, llm, shlex, upsert, state-machine]

requires:
  - phase: 01-foundation
    provides: "Machine registry, SSH/local machine management, async DB patterns"
provides:
  - "Git service layer wrapping CLI commands via machine_registry"
  - "GSD state reading from any repo (.planning/STATE.md + ROADMAP.md)"
  - "Feed service with upsert dedup and AI-assisted tier classification"
  - "Task service with enforced state machine transitions"
  - "GSD event service emitting feed items for workflow actions"
affects: [02-03, 02-04, 02-05, 02-06, 02-07, 02-08, 02-09, 02-10, 02-11]

tech-stack:
  added: [httpx (LLM API calls)]
  patterns:
    - "Git CLI wrapper via run_command_on_machine (not GitPython)"
    - "shlex.quote for all user-provided command inputs"
    - "PostgreSQL INSERT...ON CONFLICT upsert for dedup"
    - "AI classification with graceful heuristic fallback"
    - "State machine pattern with VALID_TRANSITIONS dict"

key-files:
  created:
    - backend/app/services/git_service.py
    - backend/app/services/feed_service.py
    - backend/app/services/task_service.py
    - backend/app/services/gsd_event_service.py
    - backend/app/models/feed_item.py
    - backend/app/models/task.py
  modified:
    - backend/app/models/__init__.py
    - backend/app/config.py

key-decisions:
  - "All git ops via CLI over SSH, not GitPython -- GitPython requires local filesystem access"
  - "AI tier classification calls Anthropic API with source-type heuristic fallback"
  - "broadcast_feed_update is a stub pending WebSocket endpoint in Plan 03/04"
  - "FeedItem + Task models created here (Rule 3) since Plan 01 runs in parallel"

patterns-established:
  - "Service layer pattern: business logic in services/, no HTTP concerns"
  - "shlex.quote on every user-provided value in shell commands"
  - "Upsert dedup via SQLAlchemy pg_insert.on_conflict_do_update"
  - "State machine dict pattern for valid transitions"
  - "GSD event -> feed item pipeline via ingest_item"

requirements-completed: []

duration: 5min
completed: 2026-03-26
---

# Phase 02 Plan 02: Core Service Layers Summary

**Git CLI wrapper with GSD state reading, feed ingest with AI tier classification and upsert dedup, task state machine, and GSD event emission**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-26T21:44:56Z
- **Completed:** 2026-03-26T21:50:10Z
- **Tasks:** 2
- **Files modified:** 8

## Accomplishments

- Git service with 14 async functions routing all operations through machine_registry (not GitPython)
- GSD state reading parsing STATE.md and ROADMAP.md from any repo on any machine
- Feed service with PostgreSQL upsert dedup and AI-assisted tier classification (Anthropic API + heuristic fallback)
- Task service enforcing queue/active/done state machine with validated transitions
- GSD event service emitting workflow events as feed items via ingest pipeline

## Task Commits

Each task was committed atomically:

1. **Task 1: Create git service layer with GSD state reading** - `c2017f3` (feat)
2. **Task 2: Create feed, task, and GSD event services** - `baa2336` (feat)

## Files Created/Modified

- `backend/app/services/git_service.py` - Git CLI wrapper with 14 operations + GSD state reading (422 lines)
- `backend/app/services/feed_service.py` - Feed ingest, AI tier classification, CRUD, broadcast stub
- `backend/app/services/task_service.py` - Task state machine with VALID_TRANSITIONS enforcement
- `backend/app/services/gsd_event_service.py` - GSD event -> feed item emission
- `backend/app/models/feed_item.py` - FeedItem ORM model with composite unique constraint
- `backend/app/models/task.py` - Task ORM model with feed_item FK and status field
- `backend/app/models/__init__.py` - Registered FeedItem and Task models
- `backend/app/config.py` - Added LLM settings (llm_api_key, llm_api_url, llm_model)

## Decisions Made

- **Git CLI over GitPython**: All git operations use raw `git` CLI commands via `run_command_on_machine()`. GitPython requires local filesystem access and cannot work for remote repos over SSH. CLI wrapper maintains consistency across local and remote machines.
- **AI tier classification with fallback**: `classify_tier()` calls the Anthropic API when `llm_api_key` is set. Falls back to source-type heuristic mapping when LLM is unavailable, ensuring graceful degradation.
- **broadcast_feed_update stub**: The WebSocket broadcast function is defined but not yet wired to clients. The `/ws/feed` WebSocket endpoint will be added in Plan 03/04. The stub ensures the call chain is correct.
- **FeedItem/Task models created here**: Plan 01 creates these models but runs in parallel (wave 1). Created compatible models as a dependency (Rule 3: blocking issue).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Created FeedItem and Task models**
- **Found during:** Task 2 (feed/task/GSD services)
- **Issue:** Plan 01 creates the ORM models but runs in parallel (wave 1). Services cannot import models that do not exist.
- **Fix:** Created FeedItem and Task models matching Plan 01 spec exactly. Updated models/__init__.py to register them.
- **Files modified:** backend/app/models/feed_item.py, backend/app/models/task.py, backend/app/models/__init__.py
- **Verification:** AST parse confirms valid syntax, classes defined correctly
- **Committed in:** baa2336 (Task 2 commit)

**2. [Rule 2 - Missing Critical] Added LLM config settings**
- **Found during:** Task 2 (feed service classify_tier)
- **Issue:** Feed service needs LLM API configuration (key, URL, model) for AI-assisted tier classification. No settings existed.
- **Fix:** Added llm_api_key, llm_api_url, llm_model to Settings class with sensible defaults.
- **Files modified:** backend/app/config.py
- **Verification:** Settings class parses correctly
- **Committed in:** baa2336 (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (1 blocking, 1 missing critical)
**Impact on plan:** Both fixes necessary for service layer to function. No scope creep.

## Known Stubs

- `broadcast_feed_update()` in feed_service.py (line 254): Logs broadcast intent but does not push to WebSocket clients. Will be wired when `/ws/feed` WebSocket endpoint is created in Plan 03/04.

## Issues Encountered

None -- plan executed as specified with the two deviations noted above.

## User Setup Required

None -- no external service configuration required. LLM API key is optional (graceful fallback to heuristic classification when unset).

## Next Phase Readiness

- All four service layers ready for API route wrappers (Plans 03-04)
- Git service ready for repo sidebar polling (Plan 05)
- Feed service ready for webhook ingest endpoint (Plan 03)
- Task service ready for board API (Plan 04)
- GSD event service ready for integration with GSD command hooks

## Self-Check: PASSED

All 7 created files verified on disk. Both task commits (c2017f3, baa2336) verified in git log.

---
*Phase: 02-repository-management-work-feed*
*Completed: 2026-03-26*
