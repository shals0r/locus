---
phase: 04-integrations-runner-skills
plan: 01
subsystem: api
tags: [asyncio, subprocess, pydantic, docker, worker-supervisor, mention-detection]

# Dependency graph
requires:
  - phase: 02-work-feed-git
    provides: FeedItem model, ingest API, feed_service, BasePollingAdapter
provides:
  - WorkerSupervisor service with async subprocess lifecycle management
  - Extended IntegrationSource model with worker management columns
  - Phase 4 Pydantic schemas (worker, skill, integrator)
  - Centralized mention detection in feed_service
  - Docker volume for worker script persistence
  - Worker secret auth on ingest API
affects: [04-02, 04-03, 04-04, 04-05, 04-06]

# Tech tracking
tech-stack:
  added: [beautifulsoup4, lxml, feedparser, google-api-python-client, python-dateutil]
  patterns: [async subprocess supervisor with state machine, exponential backoff crash recovery, ring buffer log streaming, container-scoped HMAC worker auth]

key-files:
  created:
    - backend/app/services/worker_supervisor.py
    - backend/app/schemas/worker.py
    - backend/app/schemas/skill.py
    - backend/app/schemas/integrator.py
  modified:
    - backend/app/models/integration_source.py
    - backend/app/services/feed_service.py
    - backend/app/api/feed.py
    - docker-compose.yml
    - backend/Dockerfile
    - backend/app/main.py

key-decisions:
  - "Container-scoped HMAC secret for worker->ingest auth (secrets.token_hex, compared via hmac.compare_digest)"
  - "Ring buffer (100 lines) for worker log streaming with asyncio.Queue subscribers"
  - "Exponential backoff: base=2s, max=300s, disabled after 5 consecutive failures"
  - "Mention detection centralized in feed_service.ingest_item() for all sources (polled and worker-submitted)"

patterns-established:
  - "Worker subprocess pattern: asyncio.create_subprocess_exec with PIPE stdout, monitor task for crash recovery"
  - "Worker env injection: decrypt credentials, inject as uppercase env vars, include LOCUS_INGEST_URL and LOCUS_WORKER_SECRET"
  - "Inline startup migration pattern extended for Phase 4 schema changes (ADD COLUMN IF NOT EXISTS)"

requirements-completed: [INTG-03, INTG-04]

# Metrics
duration: 4min
completed: 2026-03-28
---

# Phase 04 Plan 01: Integrations Runner Backend Foundation Summary

**Async subprocess WorkerSupervisor with crash recovery, Phase 4 Pydantic schemas, centralized mention detection, and Docker worker volume**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-28T19:43:39Z
- **Completed:** 2026-03-28T19:47:37Z
- **Tasks:** 2
- **Files modified:** 10

## Accomplishments
- Built WorkerSupervisor service (352 lines) with full subprocess lifecycle: start/stop/restart/monitor/shutdown, exponential backoff crash recovery, log streaming, credential injection, venv management
- Extended IntegrationSource model with 7 new columns for worker management (worker_status, failure_count, worker_pid, worker_script_path, total_items_ingested, name, is_builtin); removed unique constraint on source_type
- Created all Phase 4 Pydantic schemas: worker (WorkerResponse, WorkerCreate, WorkerUpdate, WorkerLogLine, WorkerStatus, WorkerActionResponse), skill (SkillResponse, SkillListResponse), integrator (IntegratorMessage, IntegratorResponse, IntegratorSession)
- Migrated mention detection from BasePollingAdapter to feed_service centrally, applied during ingest_item() for all sources
- Added X-Locus-Worker-Secret auth to ingest API alongside existing HMAC and JWT auth
- Configured Docker: workerdata volume for /data/workers, common integration libraries in Dockerfile

## Task Commits

Each task was committed atomically:

1. **Task 1: Extend IntegrationSource model + create all Phase 4 schemas + Docker config** - `67cc085` (feat)
2. **Task 2: Build WorkerSupervisor service + migrate mention detection to ingest API** - `31d2555` (feat)

## Files Created/Modified
- `backend/app/services/worker_supervisor.py` - Async subprocess supervisor with state machine, crash recovery, log streaming
- `backend/app/schemas/worker.py` - Worker API Pydantic schemas (WorkerResponse, WorkerCreate, WorkerUpdate, WorkerLogLine, WorkerStatus)
- `backend/app/schemas/skill.py` - Skill API Pydantic schemas (SkillResponse, SkillListResponse)
- `backend/app/schemas/integrator.py` - Integrator chat Pydantic schemas (IntegratorMessage, IntegratorResponse, IntegratorSession)
- `backend/app/models/integration_source.py` - Extended with 7 worker management columns, unique constraint removed
- `backend/app/services/feed_service.py` - Added _is_mentioned, _elevate_tier_if_mentioned, _get_source_for_type; ingest_item calls mention detection
- `backend/app/api/feed.py` - Added x_locus_worker_secret header auth for worker subprocess ingest
- `docker-compose.yml` - Added workerdata volume to app and app-dev services
- `backend/Dockerfile` - Added integration libraries and /data/workers directories
- `backend/app/main.py` - Added inline migration for Phase 4 IntegrationSource columns

## Decisions Made
- Container-scoped HMAC secret (secrets.token_hex(32)) for worker auth -- simple, secure, no external dependency
- Ring buffer log streaming (100 lines) with asyncio.Queue subscribers -- bounded memory, real-time delivery
- Exponential backoff: 2^failure_count seconds, capped at 300s, disabled after 5 consecutive failures
- Centralized mention detection in feed_service rather than per-adapter -- single code path for polled and worker-submitted items
- Inline startup migration for schema evolution (matching Phase 1.1 pattern) -- no Alembic overhead

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- Python dependencies (sqlalchemy, etc.) not installed on host -- verified via AST syntax parsing instead of import checks; Docker container has all deps

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- WorkerSupervisor ready for Plan 02 (worker CRUD API endpoints) and Plan 03 (Integrator skill)
- All Pydantic schemas available for API endpoint implementation
- Docker volume configured for worker script deployment
- Ingest API ready to accept worker-submitted items with secret auth

---
*Phase: 04-integrations-runner-skills*
*Completed: 2026-03-28*
