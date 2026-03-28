---
phase: 03-code-review-diff-editing
plan: 01
subsystem: api
tags: [fastapi, pydantic, file-operations, base64, code-review]

# Dependency graph
requires:
  - phase: 01.1
    provides: machine_registry with run_command_on_machine
provides:
  - File CRUD service (read, write, list, create, rename, delete, stat)
  - File operation Pydantic schemas
  - Review Pydantic schemas (annotations, comments, threads, MR metadata, AI review)
  - File CRUD REST endpoints (7 endpoints)
  - Language detection from file extensions
affects: [03-02, 03-03, 03-04, 03-05, 03-06, 03-07]

# Tech tracking
tech-stack:
  added: []
  patterns: [base64-file-transfer, file-service-via-machine-registry]

key-files:
  created:
    - backend/app/services/file_service.py
    - backend/app/schemas/files.py
    - backend/app/schemas/review.py
    - backend/app/api/files.py
  modified:
    - backend/app/main.py

key-decisions:
  - "Base64 encoding for binary-safe file transfer across SSH and local machines"
  - "5 MB file size limit enforced via stat check before read"
  - "Language detection via extension mapping with plaintext fallback"

patterns-established:
  - "File operations through machine_registry: same pattern as git_service"
  - "Machine validation helper in API: UUID lookup for remote, pass-through for local"

requirements-completed: []

# Metrics
duration: 3min
completed: 2026-03-28
---

# Phase 03 Plan 01: File Service + Schemas + API Summary

**File CRUD service with base64 transfer, 7 REST endpoints, and Pydantic schemas for file operations and code review**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-28T11:17:56Z
- **Completed:** 2026-03-28T11:20:56Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- File service with 7 CRUD operations routing through machine_registry for local and remote machines
- Pydantic v2 schemas for file operations (FileContent, DirectoryListing, read/write/create/rename/delete requests)
- Pydantic v2 schemas for code review (ReviewAnnotation, ReviewComment, CommentThread, ReviewSubmission, MrMetadata, AiReviewRequest/Response)
- 7 REST API endpoints with proper error handling (404, 413, 403, 502 mappings)
- Language detection from file extensions covering 40+ languages

## Task Commits

Each task was committed atomically:

1. **Task 1: File service + schemas** - `278481d` (feat)
2. **Task 2: File CRUD API endpoints** - `705f563` (feat)

## Files Created/Modified
- `backend/app/services/file_service.py` - File CRUD operations (read, write, list, create, rename, delete, stat) via machine_registry with base64 encoding
- `backend/app/schemas/files.py` - Pydantic v2 models for file operations (9 schemas)
- `backend/app/schemas/review.py` - Pydantic v2 models for code review (8 schemas including MrMetadata, ReviewAnnotation)
- `backend/app/api/files.py` - FastAPI router with 7 REST endpoints, machine validation, error mapping
- `backend/app/main.py` - Added files_router registration

## Decisions Made
- Base64 encoding for binary-safe file transfer (same approach works over SSH and local subprocess)
- 5 MB file size limit with stat pre-check to avoid reading huge files into memory
- Language detection via simple extension mapping (40+ extensions) with "plaintext" fallback
- Machine validation pattern: local machine pass-through, UUID lookup for remote machines in DB

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- File service and schemas ready for Plans 02-07 to consume
- Review schemas ready for MR review endpoints (Plan 05/06) and AI review (Plan 03/04)
- File API endpoints ready for file tree (Plan 07) and code editor (Plan 07) integration

## Self-Check: PASSED

All 6 files verified present. Both task commits (278481d, 705f563) verified in git log.

---
*Phase: 03-code-review-diff-editing*
*Completed: 2026-03-28*
