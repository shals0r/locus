---
phase: 02-repository-management-work-feed
plan: 01
subsystem: database
tags: [sqlalchemy, pydantic, feed, task, integration, git-schemas]

requires:
  - phase: 01-foundation
    provides: "Base declarative, Machine/Credential/User/TerminalSession models, schemas pattern"
provides:
  - "FeedItem ORM model with source_type+external_id dedup constraint"
  - "Task ORM model with status state field and feed_item_id FK"
  - "IntegrationSource ORM model with credential FK and config JSON"
  - "Git schemas (RepoStatus, CommitEntry, ChangedFile, BranchInfo, GitOpResult, RepoDetail)"
  - "Feed schemas (IngestPayload, FeedItemResponse, FeedItemUpdate, FeedListResponse)"
  - "Task schemas (TaskCreate, TaskResponse, TaskTransition, TaskUpdate)"
  - "Command palette schemas (SearchResult, SearchResponse)"
affects: [02-02, 02-03, 02-04, 02-05, 02-06, 02-07, 02-08, 02-09, 02-10, 02-11]

tech-stack:
  added: []
  patterns:
    - "Composite unique constraint for dedup (source_type + external_id)"
    - "Optional FK relationship pattern (Task.feed_item_id nullable)"
    - "ConfigDict(from_attributes=True) for ORM response schemas"
    - "str | None union syntax for nullable Pydantic fields"

key-files:
  created:
    - backend/app/models/feed_item.py
    - backend/app/models/task.py
    - backend/app/models/integration_source.py
    - backend/app/schemas/git.py
    - backend/app/schemas/feed.py
    - backend/app/schemas/task.py
    - backend/app/schemas/command_palette.py
  modified:
    - backend/app/models/__init__.py

key-decisions:
  - "FeedItem uses JSON column for raw_payload to preserve original webhook/API data"
  - "Task.feed_item_id nullable -- tasks can be created manually without feed origin"
  - "IntegrationSource.source_type unique -- one config per integration type"
  - "Task relationship to FeedItem uses selectin loading for efficient queries"

patterns-established:
  - "Composite unique constraint pattern: UniqueConstraint in __table_args__"
  - "Optional FK pattern: Mapped[uuid.UUID | None] with ForeignKey, nullable=True"
  - "JSON field pattern: Mapped[dict | None] with JSON column type"
  - "Response schema pattern: ConfigDict(from_attributes=True) for ORM serialization"

requirements-completed: []

duration: 2min
completed: 2026-03-26
---

# Phase 02 Plan 01: Data Models & Schemas Summary

**3 SQLAlchemy models (FeedItem, Task, IntegrationSource) and 16 Pydantic schemas across 4 modules covering git, feed, task, and command palette domains**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-26T21:44:21Z
- **Completed:** 2026-03-26T21:46:40Z
- **Tasks:** 2
- **Files modified:** 8

## Accomplishments
- FeedItem model with composite unique constraint on (source_type, external_id) for webhook dedup
- Task model with FK to feed_items, status states (queue/active/done), and machine/repo/branch assignment fields
- IntegrationSource model with FK to credentials, JSON config, and polling interval
- 16 Pydantic v2 schemas across git (6), feed (4), task (4), command palette (2) domains
- All models registered in __init__.py for Base.metadata.create_all

## Task Commits

Each task was committed atomically:

1. **Task 1: Create database models (FeedItem, Task, IntegrationSource)** - `a01fd43` (feat)
2. **Task 2: Create Pydantic schemas for git, feed, task, and command palette** - `4d2eba0` (feat)

## Files Created/Modified
- `backend/app/models/feed_item.py` - FeedItem ORM model with dedup constraint
- `backend/app/models/task.py` - Task ORM model with status state and feed item relationship
- `backend/app/models/integration_source.py` - IntegrationSource ORM model with credential FK
- `backend/app/models/__init__.py` - Register all three new models
- `backend/app/schemas/git.py` - RepoStatus, CommitEntry, ChangedFile, BranchInfo, GitOpResult, RepoDetail
- `backend/app/schemas/feed.py` - IngestPayload, FeedItemResponse, FeedItemUpdate, FeedListResponse
- `backend/app/schemas/task.py` - TaskCreate, TaskResponse, TaskTransition, TaskUpdate
- `backend/app/schemas/command_palette.py` - SearchResult, SearchResponse

## Decisions Made
- FeedItem uses JSON column for raw_payload to preserve original webhook/API data for later reprocessing
- Task.feed_item_id is nullable to support manually created tasks without feed origin
- IntegrationSource.source_type is unique -- one config row per integration type
- Task relationship uses selectin loading strategy for efficient feed item joins
- All response schemas use ConfigDict(from_attributes=True) matching existing project pattern

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- Docker container not running -- verified models via AST inspection instead of runtime import check. All syntax and structure confirmed correct.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- All models and schemas ready for Phase 2 plans 02-11 to build services and API routes
- FeedItem/Task/IntegrationSource models registered for create_all at next app startup
- Schema modules importable from app.schemas.{git,feed,task,command_palette}

## Self-Check: PASSED

All 8 created files verified on disk. Both task commits (a01fd43, 4d2eba0) found in git log.

---
*Phase: 02-repository-management-work-feed*
*Completed: 2026-03-26*
