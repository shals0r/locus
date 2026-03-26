---
phase: 02-repository-management-work-feed
plan: 03
subsystem: api
tags: [fastapi, rest, websocket, git, feed, gsd, hmac, transcript, llm]

requires:
  - phase: 02-01
    provides: "Database models (FeedItem, IntegrationSource, Task)"
  - phase: 02-02
    provides: "Service layer (git_service, feed_service, gsd_event_service)"
provides:
  - "Git REST API with 13 endpoints (status, commits, branches, diffs, operations, GSD state)"
  - "Feed REST API with 8 endpoints (CRUD, HMAC ingest, transcript extraction)"
  - "GSD events REST endpoint for FEED-06 wiring"
  - "Feed WebSocket at /ws/feed with broadcast for real-time updates"
affects: [frontend-git-sidebar, frontend-feed-panel, frontend-gsd-actions]

tech-stack:
  added: []
  patterns:
    - "Inline Pydantic request schemas for endpoint-specific bodies"
    - "broadcast_feed_update() as module-level function importable across API routes"
    - "HMAC verification with fallback to JWT auth for webhook ingest"
    - "asyncio.Queue per-client pattern for WebSocket broadcasting"

key-files:
  created:
    - "backend/app/api/git.py"
    - "backend/app/api/feed.py"
    - "backend/app/api/gsd_events.py"
    - "backend/app/ws/feed.py"
  modified:
    - "backend/app/main.py"
    - "backend/app/ws/__init__.py"
    - "backend/app/api/__init__.py"
    - "backend/app/schemas/git.py"
    - "backend/app/config.py"

key-decisions:
  - "HMAC webhook auth with JWT fallback: ingest endpoint supports both X-Locus-Signature HMAC and Bearer JWT"
  - "broadcast_feed_update is synchronous put_nowait: non-blocking, drops on full queue rather than blocking API routes"
  - "Feed WebSocket sends 30s keepalive pings to detect stale connections"
  - "GSD events endpoint validates event_type against whitelist, rejects unknown types with 400"

patterns-established:
  - "WebSocket broadcast pattern: module-level list of asyncio.Queue, broadcast function uses put_nowait"
  - "Dual auth on ingest: HMAC for external webhooks, JWT for internal API calls"

requirements-completed: []

duration: 5min
completed: 2026-03-26
---

# Phase 02 Plan 03: Git/Feed/GSD API Routes Summary

**Git and feed REST API with 13+8 endpoints, GSD event ingestion (FEED-06), feed WebSocket broadcasting, and LLM-powered transcript extraction**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-26T22:05:10Z
- **Completed:** 2026-03-26T22:10:27Z
- **Tasks:** 2
- **Files modified:** 9

## Accomplishments
- Git API with full endpoint surface: status, commits, branches, diffs, fetch/pull/push, checkout, create-branch, and GSD state (GIT-05)
- Feed API with HMAC-verified webhook ingest, CRUD, snooze/dismiss actions, and LLM transcript extraction (FEED-07)
- GSD events endpoint accepting workflow event payloads and creating feed items (FEED-06)
- Feed WebSocket at /ws/feed with auth, initial 50-item snapshot, and real-time broadcast

## Task Commits

Each task was committed atomically:

1. **Task 1: Create git API and feed API routes** - `cb6cad5` (feat)
2. **Task 2: Create GSD events endpoint, feed WebSocket, and register all in main.py** - `863741c` (feat)

## Files Created/Modified
- `backend/app/api/git.py` - 13 git REST endpoints including GSD state
- `backend/app/api/feed.py` - 8 feed endpoints including HMAC ingest and transcript extraction
- `backend/app/api/gsd_events.py` - GSD event submission with event_type validation
- `backend/app/ws/feed.py` - Feed WebSocket with broadcast_feed_update function
- `backend/app/main.py` - Registered git, feed, gsd_events routers and feed WS
- `backend/app/ws/__init__.py` - Export broadcast_feed_update
- `backend/app/api/__init__.py` - Updated module docstring
- `backend/app/schemas/git.py` - Added GsdState schema
- `backend/app/config.py` - Added webhook_secret setting

## Decisions Made
- HMAC webhook auth with JWT fallback on ingest endpoint: external integrations use X-Locus-Signature, internal calls use JWT
- broadcast_feed_update uses synchronous put_nowait to avoid blocking API request handlers
- Feed WebSocket sends keepalive pings every 30s to detect disconnected clients
- GSD events endpoint validates event_type against a whitelist of 5 accepted types

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Added webhook_secret to Settings**
- **Found during:** Task 1 (Feed ingest endpoint)
- **Issue:** Feed ingest HMAC verification needs a webhook secret, but config.py had no such field
- **Fix:** Added `webhook_secret: str = ""` to Settings class
- **Files modified:** backend/app/config.py
- **Verification:** App imports and starts without error
- **Committed in:** cb6cad5 (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 missing critical)
**Impact on plan:** Essential for HMAC verification to work. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Full backend API surface ready for frontend consumption
- Frontend can call git endpoints for sidebar repo management
- Frontend can call feed endpoints for right panel feed display
- GSD event service reachable via REST for fire-and-forget calls from GsdActions.tsx
- Feed WebSocket ready for real-time feed panel updates

---
*Phase: 02-repository-management-work-feed*
*Completed: 2026-03-26*
