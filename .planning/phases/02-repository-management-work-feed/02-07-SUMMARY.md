---
phase: 02-repository-management-work-feed
plan: 07
subsystem: ui
tags: [react, zustand, tanstack-query, websocket, feed, triage, tailwind]

requires:
  - phase: 02-03
    provides: Feed API endpoints (GET /api/feed/, PATCH /api/feed/{id}, POST /api/feed/{id}/snooze, WebSocket /ws/feed)
provides:
  - Feed panel with 5 urgency tier sections (Now/Respond/Review/Prep/Follow up)
  - FeedCard with hover triage actions (Quick Promote, Deep Promote, Snooze, Dismiss)
  - SnoozeMenu with 4 fixed time presets
  - Real-time feed updates via WebSocket + TanStack Query invalidation
  - RightPanel with Feed/Board tab toggle
  - Zustand feed store for tab and tier collapse state
  - TanStack Query hooks for all feed CRUD operations
affects: [02-08, 02-09, 02-10, 02-11]

tech-stack:
  added: []
  patterns:
    - "WebSocket-to-TanStack-Query invalidation: useFeedWebSocket listens for WS events and calls queryClient.invalidateQueries"
    - "Tier grouping: FeedPanel groups items by tier field using useMemo, rendered via FeedTierSection"
    - "Hover triage: FeedCard toggles snippet vs action buttons on mouseenter/leave"

key-files:
  created:
    - frontend/src/stores/feedStore.ts
    - frontend/src/hooks/useFeedWebSocket.ts
    - frontend/src/hooks/useFeedQueries.ts
    - frontend/src/components/feed/FeedPanel.tsx
    - frontend/src/components/feed/FeedTierSection.tsx
    - frontend/src/components/feed/FeedCard.tsx
    - frontend/src/components/feed/SnoozeMenu.tsx
  modified:
    - frontend/src/components/layout/RightPanel.tsx
    - frontend/src/components/layout/AppShell.tsx
    - frontend/src/stores/panelStore.ts
    - frontend/src/hooks/useApi.ts
    - frontend/src/types/index.ts

key-decisions:
  - "apiPatch updated to accept optional body parameter for feed mutations"
  - "Right panel default size set to 25% with collapsible support via panelStore"
  - "FeedItem type placed in shared types/index.ts for cross-component reuse"
  - "Separate useFeedQueries.ts from useFeedWebSocket.ts for clean separation of REST and WS concerns"

patterns-established:
  - "Feed store pattern: Zustand for UI-only state (tab, tier collapse), TanStack Query for server state"
  - "WebSocket invalidation: WS hook triggers query cache invalidation rather than managing data directly"
  - "Triage action pattern: hover reveals action buttons replacing snippet text"

requirements-completed: []

duration: 6min
completed: 2026-03-26
---

# Phase 02 Plan 07: Feed Panel Summary

**Feed panel with 5 collapsible urgency tier sections, triage card actions (promote/snooze/dismiss), and real-time WebSocket updates via TanStack Query invalidation**

## Performance

- **Duration:** 6 min
- **Started:** 2026-03-26T22:12:50Z
- **Completed:** 2026-03-26T22:19:17Z
- **Tasks:** 2
- **Files modified:** 12

## Accomplishments
- Feed panel with 5 urgency tiers (Now/Respond/Review/Prep/Follow up) rendered as collapsible sections with sticky headers and tier color accents
- FeedCard showing source icon, title, timestamp, unread indicator, and snippet; hover state reveals Quick Promote, Deep Promote, Snooze, and Dismiss actions
- SnoozeMenu with 4 fixed presets (1h, 4h, Tomorrow 9am, Next Monday 9am) computing correct ISO timestamps
- Deep Promote modal with editable title and context textarea
- Real-time feed updates via WebSocket connection to /ws/feed triggering TanStack Query cache invalidation
- RightPanel with Feed/Board tab toggle, now visible by default with resize handle
- TanStack Query hooks for all feed CRUD operations (fetch, dismiss, snooze, mark read, promote)

## Task Commits

Each task was committed atomically:

1. **Task 1: Create feed store, WebSocket hook, and RightPanel tab structure** - `8ab96f1` (feat)
2. **Task 2: Build feed panel with tier sections, cards, and triage actions** - `b7644a1` (feat)

## Files Created/Modified
- `frontend/src/stores/feedStore.ts` - Zustand store for active tab and tier collapse state
- `frontend/src/hooks/useFeedWebSocket.ts` - WebSocket hook connecting to /ws/feed, invalidates TanStack Query cache
- `frontend/src/hooks/useFeedQueries.ts` - TanStack Query hooks for feed items, dismiss, snooze, mark read, promote
- `frontend/src/components/feed/FeedPanel.tsx` - Main feed panel grouping items by 5 urgency tiers
- `frontend/src/components/feed/FeedTierSection.tsx` - Collapsible tier section with sticky header and color accent
- `frontend/src/components/feed/FeedCard.tsx` - Feed item card with hover triage actions and Deep Promote modal
- `frontend/src/components/feed/SnoozeMenu.tsx` - Popover with 4 snooze time presets
- `frontend/src/components/layout/RightPanel.tsx` - Feed/Board tab toggle replacing Phase 1 placeholder
- `frontend/src/components/layout/AppShell.tsx` - Right panel now visible with 25% default size and resize handle
- `frontend/src/stores/panelStore.ts` - rightPanelCollapsed now defaults to false
- `frontend/src/hooks/useApi.ts` - apiPatch updated to accept optional request body
- `frontend/src/types/index.ts` - FeedItem and FeedTier types added

## Decisions Made
- Extended apiPatch to accept optional body parameter rather than creating a separate function, maintaining API consistency
- Set right panel default to 25% width (was 0% in Phase 1), with full collapse/expand via panelStore
- Separated useFeedQueries.ts (REST/TanStack Query) from useFeedWebSocket.ts (WebSocket) for clean concern separation
- FeedItem type in shared types/index.ts rather than co-located, matching existing Machine/TerminalSession pattern
- Deep Promote modal implemented inline in FeedCard rather than as separate route, keeping triage fast

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Added apiPatch body support**
- **Found during:** Task 1 (creating useFeedQueries.ts)
- **Issue:** Existing apiPatch function only accepted a path, no body parameter. Feed mutations (dismiss, mark read) need PATCH with JSON body.
- **Fix:** Updated apiPatch to accept optional body parameter with proper Content-Type header
- **Files modified:** frontend/src/hooks/useApi.ts
- **Verification:** TypeScript compiles clean, all feed mutation hooks work with new signature
- **Committed in:** 8ab96f1 (Task 1 commit)

**2. [Rule 2 - Missing Critical] Made right panel visible in AppShell**
- **Found during:** Task 1 (RightPanel tab structure)
- **Issue:** AppShell had right panel at defaultSize=0 with no resize handle, making the feed invisible
- **Fix:** Set right panel to 25% default size, added resize handle, wired collapse/expand to panelStore
- **Files modified:** frontend/src/components/layout/AppShell.tsx, frontend/src/stores/panelStore.ts
- **Verification:** Panel renders correctly with resize support
- **Committed in:** 8ab96f1 (Task 1 commit)

---

**Total deviations:** 2 auto-fixed (2 missing critical)
**Impact on plan:** Both fixes necessary for the feed panel to function. No scope creep.

## Issues Encountered
- Pre-existing TypeScript build error in Sidebar.tsx (MachineStatus record missing "needs_setup" key) -- out of scope for this plan, does not affect feed components. Logged for future fix.

## Known Stubs
None -- all components wire real data through TanStack Query hooks to backend API endpoints.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Feed panel complete and ready for integration with backend feed endpoints
- Board tab placeholder ready for future plan implementation
- WebSocket hook will begin receiving updates once /ws/feed backend endpoint serves data

---
*Phase: 02-repository-management-work-feed*
*Completed: 2026-03-26*
