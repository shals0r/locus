---
phase: 02-repository-management-work-feed
plan: 11
subsystem: ui
tags: [verification, integration-testing, ux]

requires:
  - phase: 02-06 through 02-10
    provides: all Phase 2 UI components

provides:
  - User-verified Phase 2 UI
  - 20+ bug fixes across feed, git sidebar, board, diff viewer, terminal
  - Snoozed feed tier with unsnooze flow
  - Commit inline expand with per-file diff viewing
  - Tech debt cleanup (security, error handling, state management)

affects: [phase-03, phase-04]

tech-stack:
  added: []
  patterns: [server-side-DA-filter, heredoc-shell-injection-prevention, ws-reconnection-via-hook]

key-files:
  modified:
    - backend/app/api/feed.py
    - backend/app/api/settings.py
    - backend/app/services/feed_service.py
    - backend/app/services/git_service.py
    - backend/app/services/task_service.py
    - backend/app/ws/feed.py
    - backend/app/ws/terminal.py
    - frontend/src/components/board/StartFlowPicker.tsx
    - frontend/src/components/board/TaskCard.tsx
    - frontend/src/components/diff/DiffViewer.tsx
    - frontend/src/components/feed/FeedCard.tsx
    - frontend/src/components/feed/FeedPanel.tsx
    - frontend/src/components/feed/FeedTierSection.tsx
    - frontend/src/components/feed/SnoozeMenu.tsx
    - frontend/src/components/git/BranchDropdown.tsx
    - frontend/src/components/git/ChangedFiles.tsx
    - frontend/src/components/git/CommitTimeline.tsx
    - frontend/src/components/layout/CenterPanel.tsx
    - frontend/src/components/layout/RightPanel.tsx
    - frontend/src/components/layout/TopBar.tsx
    - frontend/src/components/terminal/TerminalView.tsx
    - frontend/src/hooks/useFeedQueries.ts
    - frontend/src/hooks/useGitStatus.ts
    - frontend/src/hooks/useStatus.ts
    - frontend/src/hooks/useTaskQueries.ts
    - frontend/src/stores/feedStore.ts
    - frontend/src/stores/machineStore.ts

key-decisions:
  - "Replaced @git-diff-view/react with simple colored line renderer (library had virtual scrolling issues in absolute containers)"
  - "DA response filtering moved server-side to terminal.py (was client-side regex bandaid)"
  - "Shell command injection fixed with heredoc pattern instead of f-string interpolation"
  - "useStatus refactored to use useWebSocket hook for auto-reconnection"
  - "Snoozed items returned in main feed response, frontend handles grouping"
  - "Commit expand is inline in sidebar with per-file diff viewing"

patterns-established:
  - "Heredoc for SSH shell commands with user data (no f-string interpolation)"
  - "Server-side protocol filtering for terminal escape sequences"
  - "All except blocks must have logger.warning at minimum"
  - "useWebSocket hook for all WebSocket connections (not raw WebSocket)"

duration: ~120min
completed: 2026-03-27
---

# Plan 11: Visual and Functional Verification Summary

**User-verified Phase 2 UI with 20+ bug fixes, 2 new features, and 8 tech debt cleanups**

## Performance

- **Duration:** ~120 min (interactive verification + fixes)
- **Tasks:** 2 (seed data + human verification checkpoint)
- **Files modified:** 27

## Accomplishments
- Full Phase 2 UI verified by user across git sidebar, feed, board, diff, command palette
- Fixed 20+ bugs discovered during verification (feed actions, diff viewer, git parsing, terminal garbage, branch names, status refresh, task workflow)
- Added commit inline expand with per-file diff viewing
- Added snoozed feed tier (6th section) with unsnooze flow
- Fixed 8 tech debt issues from code quality review (security, error handling, state management, reconnection)

## Task Commits

1. **Task 1: Seed data** — operational only (no code changes)
2. **Verification fixes:**
   - `842d402` — fix 10 verification bugs across feed, git sidebar, board, and diff viewer
   - `8caec47` — fix terminal garbage, branch names, stale status, branch creation
   - `43210c0` — fix terminal garbage, branch names, stale status, branch creation (round 2)
   - `44119a1` — replace DiffView library with simple colored diff renderer
   - `dfaae63` — fix auto-task-switch on close, add branch checkout spinner
   - `69cd2a1` — add commit inline expand and snoozed feed tier
   - `7bc462d` — fix 8 tech debt issues from code review

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug Fix] Feed redirect causing ERR_NAME_NOT_RESOLVED**
- Found during: Verification
- Issue: `@router.get("/")` with Vite proxy `changeOrigin:true` caused 307 redirect to Docker-internal hostname
- Fix: Changed route from `"/"` to `""` to match without redirect

**2. [Rule 1 - Bug Fix] Feed PATCH 500 MissingGreenlet**
- Found during: Verification
- Issue: `update_feed_item` did `db.flush()` without `db.refresh()`, causing lazy load outside async context
- Fix: Added `await db.refresh(item)` after flush

**3. [Rule 2 - Critical] Command injection in settings.py**
- Found during: Code review
- Issue: API keys interpolated raw into shell commands via f-strings
- Fix: Switched to heredoc pattern preventing shell metacharacter injection

**4. [Rule 2 - Critical] WS feed snapshot missing fields**
- Found during: Code review
- Issue: WebSocket snapshot returned 10 fields vs REST API's 14, causing rendering inconsistencies
- Fix: Added 4 missing fields and removed stale snoozed filter

---

**Total deviations:** 20+ auto-fixed (bugs, security, UX)
**Impact on plan:** All fixes necessary for Phase 2 quality. Two new features (snoozed tier, commit expand) requested by user during verification.

## Issues Encountered
- `@git-diff-view/react` virtual scrolling failed in absolute-positioned containers — replaced with simple colored renderer
- SSH strips leading space from `git status --porcelain` output — required robust whitespace-based parsing
- `git branch --format` with `%x00` null byte separator didn't work through SSH — switched to plain `git branch` output

## Next Phase Readiness
- Phase 2 verified and complete
- Deferred items documented: Deep Promote with Claude, AI Review screen, multiple active task switching
- AI Review screen design agreed for Phase 3

---
*Phase: 02-repository-management-work-feed*
*Completed: 2026-03-27*
