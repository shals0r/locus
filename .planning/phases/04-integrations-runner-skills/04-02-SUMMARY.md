---
phase: 04-integrations-runner-skills
plan: 02
subsystem: integrations
tags: [workers, subprocess, polling, websocket, fastapi, httpx]

requires:
  - phase: 04-01
    provides: WorkerSupervisor, WorkerProcess, worker schemas, IntegrationSource model extensions

provides:
  - 4 standalone built-in worker scripts (GitHub, GitLab, Jira, Calendar)
  - Worker management REST API with CRUD + start/stop/restart/enable
  - Worker log streaming WebSocket endpoint
  - App lifecycle supervisor integration (auto-start on boot, shutdown on exit)

affects: [04-03, 04-04, 04-05, 04-06]

tech-stack:
  added: []
  patterns: [standalone-worker-contract, worker-env-var-config, sync-httpx-polling]

key-files:
  created:
    - backend/data/workers/_builtin/github_worker.py
    - backend/data/workers/_builtin/gitlab_worker.py
    - backend/data/workers/_builtin/jira_worker.py
    - backend/data/workers/_builtin/calendar_worker.py
    - backend/app/api/workers.py
    - backend/app/services/worker_service.py
    - backend/app/ws/worker_logs.py
  modified:
    - backend/app/main.py

key-decisions:
  - "Sync httpx.Client in workers (not async) since workers are standalone scripts with blocking main loops"
  - "Supervisor singleton in workers.py module scope, shared via get_supervisor()"
  - "Enable endpoint auto-starts worker after resetting failure_count (D-09)"
  - "Legacy APScheduler polling kept alongside supervisor for backward compat during migration"

patterns-established:
  - "Worker contract: shebang + env vars + poll() -> list[dict] + __main__ loop with flush=True stdout"
  - "Worker API pattern: CRUD service layer + action endpoints (start/stop/restart/enable) + supervisor delegation"

requirements-completed: [INTG-03, INTG-04, INTG-05]

duration: 3min
completed: 2026-03-28
---

# Phase 04 Plan 02: Built-in Workers and Worker Management API Summary

**4 standalone polling workers (GitHub/GitLab/Jira/Calendar) with REST management API, log streaming WebSocket, and supervisor lifecycle integration**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-28T19:49:42Z
- **Completed:** 2026-03-28T19:53:08Z
- **Tasks:** 2
- **Files modified:** 8

## Accomplishments
- Migrated all 4 built-in adapters from in-process APScheduler jobs to standalone subprocess scripts following the D-02 worker contract
- Built worker management REST API with 10 endpoints (CRUD + start/stop/restart/enable + logs)
- Implemented worker log streaming WebSocket with initial buffer replay and live streaming
- Wired supervisor into FastAPI lifespan for auto-start of enabled workers on boot and clean shutdown

## Task Commits

Each task was committed atomically:

1. **Task 1: Migrate 4 built-in adapters to standalone worker scripts** - `f3b5ce8` (feat)
2. **Task 2: Worker management API + log WebSocket + app lifecycle wiring** - `7dc05cb` (feat)

## Files Created/Modified
- `backend/data/workers/_builtin/github_worker.py` - Standalone GitHub PR/issue polling worker
- `backend/data/workers/_builtin/gitlab_worker.py` - Standalone GitLab MR polling worker
- `backend/data/workers/_builtin/jira_worker.py` - Standalone Jira issue polling worker with ADF text extraction
- `backend/data/workers/_builtin/calendar_worker.py` - Standalone Google Calendar event polling worker with token refresh
- `backend/app/api/workers.py` - Worker management REST API with 10 endpoints
- `backend/app/services/worker_service.py` - Worker CRUD database operations
- `backend/app/ws/worker_logs.py` - Worker log streaming WebSocket endpoint
- `backend/app/main.py` - Added supervisor lifecycle and new router registrations

## Decisions Made
- Used sync httpx.Client in standalone workers since they run in their own subprocess with a blocking sleep loop
- Kept legacy APScheduler polling alongside supervisor startup for backward compatibility during migration
- Enable endpoint auto-starts worker after resetting failure state (per D-09 design)
- Supervisor is a module-level singleton in workers.py, accessed via get_supervisor()

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Known Stubs
None - all workers have complete polling logic migrated from existing adapters.

## Next Phase Readiness
- Worker runtime fully operational: workers can be started, stopped, monitored, and logs streamed
- Ready for Plan 03 (feed ingest API worker auth) and Plan 04+ (Integrator skill, UI)
- Built-in workers ready to be registered as IntegrationSource records with worker_script_path

---
*Phase: 04-integrations-runner-skills*
*Completed: 2026-03-28*
