---
phase: 05-host-agent
plan: 09
subsystem: settings
tags: [fastapi, sqlalchemy, react, tanstack-query, settings, repo-discovery]

# Dependency graph
requires:
  - phase: 01-foundation
    provides: settings API, database models, Settings page UI
  - phase: 01.1-local-machine
    provides: local_repo_scan_paths env var, local machine manager
provides:
  - AppSetting key-value model for persistent app configuration
  - GET/PUT /api/settings/general endpoint for scan paths
  - GeneralSettings UI for configuring local repo directories
  - DB-aware scan path resolution with env var fallback
affects: [02-repository-management, search, machines]

# Tech tracking
tech-stack:
  added: []
  patterns: [db-backed settings with env var fallback, merge upsert for AppSetting]

key-files:
  created:
    - backend/app/models/app_setting.py
    - frontend/src/components/settings/GeneralSettings.tsx
  modified:
    - backend/app/models/__init__.py
    - backend/app/api/settings.py
    - backend/app/config.py
    - backend/app/api/search.py
    - backend/app/api/machines.py
    - frontend/src/components/settings/SettingsPage.tsx

key-decisions:
  - "AppSetting uses SQLAlchemy merge() for upsert -- simple and correct for single-user key-value storage"
  - "DB setting takes precedence over env var; env var is fallback if DB has no value"

patterns-established:
  - "DB-backed settings pattern: AppSetting key-value table with get_local_scan_paths_from_db helper"
  - "Settings UI pattern: TanStack Query for fetch/save, dirty state tracking, save feedback"

requirements-completed: [AGENT-02, AGENT-06]

# Metrics
duration: 3min
completed: 2026-04-03
---

# Phase 05 Plan 09: Local Repo Scan Path Settings Summary

**DB-persisted local repo scan paths with Settings UI, replacing env-var-only configuration for repo discovery**

## Performance

- **Duration:** 3 min
- **Started:** 2026-04-03T10:56:41Z
- **Completed:** 2026-04-03T10:59:44Z
- **Tasks:** 2
- **Files modified:** 8

## Accomplishments
- AppSetting key-value model created for persistent app configuration (auto-created by existing `Base.metadata.create_all`)
- GET/PUT /api/settings/general endpoint serves and persists local_repo_scan_paths to DB
- GeneralSettings UI component with path add/remove/save, dirty tracking, and save feedback
- search.py and machines.py updated to read DB-backed paths with env var fallback

## Task Commits

Each task was committed atomically:

1. **Task 1: AppSetting model + general settings API endpoint** - `7886923` (feat)
2. **Task 2: GeneralSettings UI component in Settings page** - `fb4baa0` (feat)

## Files Created/Modified
- `backend/app/models/app_setting.py` - AppSetting model (key-value settings storage)
- `backend/app/models/__init__.py` - Added AppSetting to model exports
- `backend/app/api/settings.py` - Added GET/PUT /api/settings/general endpoints
- `backend/app/config.py` - Added get_local_scan_paths_from_db async helper
- `backend/app/api/search.py` - Updated _search_repos to use DB paths with fallback
- `backend/app/api/machines.py` - Updated scan_repos to use DB paths with fallback
- `frontend/src/components/settings/GeneralSettings.tsx` - Settings form for scan path configuration
- `frontend/src/components/settings/SettingsPage.tsx` - Added General section as first section

## Decisions Made
- AppSetting uses SQLAlchemy merge() for upsert -- simple and correct for single-user key-value storage
- DB setting takes precedence over env var; env var serves as fallback if DB has no value
- GeneralSettings uses TanStack Query (consistent with project patterns) instead of manual useEffect fetch

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Settings infrastructure ready for additional app-wide configuration options
- Repo discovery now works without manual env var configuration
- Users can configure scan paths from the UI immediately after deployment

## Self-Check: PASSED

All 9 files verified present. Both task commits (7886923, fb4baa0) verified in git log.

---
*Phase: 05-host-agent*
*Completed: 2026-04-03*
