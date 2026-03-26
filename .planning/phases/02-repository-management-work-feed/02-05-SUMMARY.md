---
phase: 02-repository-management-work-feed
plan: 05
subsystem: integrations
tags: [apscheduler, polling, github, gitlab, jira, calendar, httpx, mention-detection]

requires:
  - phase: 02-01
    provides: "IntegrationSource model and FeedItem model"
  - phase: 02-03
    provides: "feed_service.ingest_item() and broadcast_feed_update() via ws/feed.py"
provides:
  - "APScheduler-based polling lifecycle (start_polling/stop_polling)"
  - "BasePollingAdapter with mention detection and tier elevation"
  - "GitHubAdapter: PR polling with review status classification"
  - "GitLabAdapter: MR polling (assigned + review-requested)"
  - "JiraAdapter: JQL-based issue polling with ADF text extraction"
  - "GoogleCalendarAdapter: next-24h events with OAuth token refresh"
affects: [02-06, 02-07, 04-integrations-runner]

tech-stack:
  added: [apscheduler]
  patterns: [adapter-registry, poll-ingest-broadcast-cycle, mention-elevation]

key-files:
  created:
    - backend/app/integrations/__init__.py
    - backend/app/integrations/scheduler.py
    - backend/app/integrations/base_adapter.py
    - backend/app/integrations/github_adapter.py
    - backend/app/integrations/gitlab_adapter.py
    - backend/app/integrations/jira_adapter.py
    - backend/app/integrations/calendar_adapter.py
  modified:
    - backend/app/main.py

key-decisions:
  - "Lazy adapter import in get_adapter() to avoid circular imports"
  - "Adapter registry creates fresh instances per get_adapter call for simplicity"
  - "Calendar always tier prep; Jira maps priority names to tiers"
  - "ADF text walker for Jira description/comment mention scanning"
  - "Token refresh handled inline in calendar adapter with config persistence"

patterns-established:
  - "Adapter registry: source_type string -> adapter class mapping in scheduler.py"
  - "Poll-ingest cycle: adapter.execute() wraps poll->mention-check->ingest->broadcast"
  - "Error isolation: all adapter errors caught and logged, never propagated to scheduler"
  - "Mention detection: base class scans body/title/snippet for @username patterns"

requirements-completed: []

duration: 3min
completed: 2026-03-26
---

# Phase 02 Plan 05: Integrations Polling System Summary

**APScheduler polling with 4 adapters (GitHub/GitLab/Jira/Calendar), BasePollingAdapter with @mention detection and tier elevation**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-26T22:13:37Z
- **Completed:** 2026-03-26T22:17:34Z
- **Tasks:** 2
- **Files modified:** 8

## Accomplishments
- APScheduler AsyncIOScheduler integrated into FastAPI lifespan with start_polling/stop_polling
- BasePollingAdapter with full poll->mention-check->tier-elevate->ingest->broadcast flow and error isolation
- Four concrete adapters: GitHub (PRs), GitLab (MRs), Jira (issues via JQL), Google Calendar (next 24h events)
- @mention detection scans item body/title/snippet for configured usernames, elevates tier to "respond" when found

## Task Commits

Each task was committed atomically:

1. **Task 1: Create scheduler and base adapter with mention detection** - `6d67c2d` (feat)
2. **Task 2: Create four polling adapters** - `115bfeb` (feat)

## Files Created/Modified
- `backend/app/integrations/__init__.py` - Package init, exports start_polling/stop_polling
- `backend/app/integrations/scheduler.py` - APScheduler lifecycle, adapter registry, job management
- `backend/app/integrations/base_adapter.py` - Abstract base with execute(), mention detection, tier elevation
- `backend/app/integrations/github_adapter.py` - GitHub PR polling with review status classification
- `backend/app/integrations/gitlab_adapter.py` - GitLab MR polling (assigned + review-requested) with dedup
- `backend/app/integrations/jira_adapter.py` - Jira JQL polling with ADF text extraction for mentions
- `backend/app/integrations/calendar_adapter.py` - Google Calendar events with OAuth token refresh
- `backend/app/main.py` - Added start_polling/stop_polling to lifespan

## Decisions Made
- Lazy adapter imports in get_adapter() to avoid circular dependency between scheduler and adapter modules
- Fresh adapter instances created per get_adapter() call -- stateless design avoids shared mutable state
- Google Calendar adapter handles token refresh inline (401 -> refresh -> retry) and persists new token to DB
- Jira ADF walker recursively extracts text and mention nodes from Atlassian Document Format for reliable mention detection
- GitLab deduplicates MRs that appear in both assigned_to_me and review_requested scopes

## Deviations from Plan

None - plan executed exactly as written.

## Known Stubs

None - all adapters implement complete poll logic with real API calls, error handling, and mention detection.

## Issues Encountered
None

## User Setup Required

None - adapters only activate when IntegrationSource records with credentials are created via the API. No env vars or manual config needed for the polling infrastructure itself.

## Next Phase Readiness
- Polling infrastructure ready -- when IntegrationSource records exist with valid credentials, adapters automatically poll and ingest
- WebSocket integration endpoint (02-06) and webhook endpoints (02-07) can build on this foundation
- Phase 4 integrations runner can reuse the adapter pattern for dynamically-built workers

---
*Phase: 02-repository-management-work-feed*
*Completed: 2026-03-26*
