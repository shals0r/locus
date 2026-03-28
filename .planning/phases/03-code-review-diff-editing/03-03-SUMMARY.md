---
phase: 03-code-review-diff-editing
plan: 03
subsystem: ui
tags: [react, zustand, tabs, drag-drop, xterm, lucide-react]

# Dependency graph
requires:
  - phase: 01-foundation
    provides: sessionStore, SessionTabBar, CenterPanel, Sidebar layout
  - phase: 02-repository-management-work-feed
    provides: DiffViewer, ChangedFiles, CommitTimeline, repoStore
provides:
  - Unified CenterTab type system for terminal/diff/editor tabs
  - SessionTabBar rendering all tab types with type-specific icons
  - SidebarTabs (Git | Files | Search) navigation component
  - editorStore for dirty file state and cached content management
affects: [03-code-review-diff-editing, 04-integrations]

# Tech tracking
tech-stack:
  added: []
  patterns: [unified tab model, backward-compatible store migration, sidebar tab navigation]

key-files:
  created:
    - frontend/src/stores/editorStore.ts
    - frontend/src/components/navigation/SidebarTabs.tsx
  modified:
    - frontend/src/stores/sessionStore.ts
    - frontend/src/components/navigation/SessionTabBar.tsx
    - frontend/src/components/layout/CenterPanel.tsx
    - frontend/src/components/layout/Sidebar.tsx

key-decisions:
  - "CenterTab union type with type-specific data fields instead of polymorphic subtypes"
  - "Backward-compatible migration: legacy openDiffTab/closeDiffTab create CenterTabs internally"
  - "Terminal tabs auto-created on session add/activate for seamless migration from old model"
  - "Sidebar tab state is local (useState) not Zustand -- resets per session by design"

patterns-established:
  - "Unified tab model: all center panel content types share CenterTab interface with type-specific data"
  - "Tab-store sync: session CRUD operations automatically sync corresponding CenterTab entries"
  - "Sidebar tab pattern: tab switcher + content routing with placeholder pattern for future tabs"

requirements-completed: []

# Metrics
duration: 5min
completed: 2026-03-28
---

# Phase 03 Plan 03: Tab System + Sidebar Tabs Summary

**Unified CenterTab model replacing single-diff overlay, with drag-reorderable tab bar rendering terminal/diff/editor tabs and Git|Files|Search sidebar navigation**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-28T11:18:05Z
- **Completed:** 2026-03-28T11:23:16Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments
- Refactored sessionStore from single activeDiffTab to multi-tab CenterTab[] system supporting terminal, diff, and editor tab types
- Created editorStore for tracking dirty file state, cached content, and original content for future diff comparison
- Rebuilt SessionTabBar to render all tab types with type-specific lucide-react icons (Terminal, GitCompareArrows, FileCode) and HTML5 drag-to-reorder
- Added SidebarTabs component with Git | Files | Search navigation below the repo list, with placeholder content for Files and Search tabs

## Task Commits

Each task was committed atomically:

1. **Task 1: Extend sessionStore with unified tab model + create editorStore** - `a49a65b` (feat)
2. **Task 2: Unified SessionTabBar + SidebarTabs + CenterPanel routing** - `dfd0b8e` (feat)

## Files Created/Modified
- `frontend/src/stores/sessionStore.ts` - Added CenterTab type, tabs[], activeTabId, openTab/closeTab/setActiveTab/reorderTabs, backward-compatible openDiffTab/closeDiffTab, openEditorTab
- `frontend/src/stores/editorStore.ts` - New store for dirty file tracking, cached content, and original content management
- `frontend/src/components/navigation/SessionTabBar.tsx` - Complete rewrite: renders all CenterTab types with icons, drag reorder, dirty indicators, close confirmation for editor tabs
- `frontend/src/components/navigation/SidebarTabs.tsx` - New component: Git | Files | Search tab switcher with placeholder content for unimplemented tabs
- `frontend/src/components/layout/CenterPanel.tsx` - Removed separate diff tab bar, routes content based on activeTab.type (terminal/diff/editor)
- `frontend/src/components/layout/Sidebar.tsx` - Integrated SidebarTabs between repo list and bottom panel, routes content by active sidebar tab

## Decisions Made
- CenterTab uses a flat union type with optional type-specific data fields (terminalData, diffData, editorData) rather than discriminated union subtypes -- simpler for Zustand state management
- Legacy openDiffTab/closeDiffTab preserved as thin wrappers that create/remove CenterTabs internally, avoiding breaking changes in ChangedFiles and CommitTimeline components
- Terminal tabs are auto-created when sessions are added or activated (setActiveSession), handling the case where sessions are fetched before the tab system initializes
- Sidebar tab state uses React local state (useState) rather than Zustand -- the tab selection doesn't need to persist across sessions and keeping it local avoids unnecessary store complexity
- Close button on terminal tabs still goes through removeSession which handles both session and tab cleanup

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Known Stubs
- `frontend/src/components/layout/CenterPanel.tsx` line ~119: Editor tab renders placeholder "Monaco editor coming in Plan 07" -- intentional, editor implementation planned for Plan 07
- `frontend/src/components/navigation/SidebarTabs.tsx` line ~46-47: Files and Search tabs render placeholder text "coming in Plan 07" -- intentional, these features are planned for Plan 07

## Next Phase Readiness
- Unified tab system ready for Plan 04 (inline comments) and Plan 07 (editor + file tree) to add new tab types
- SidebarTabs placeholder slots ready for Plan 07 file tree and search implementations
- editorStore ready for Plan 07 Monaco editor integration with dirty state tracking

## Self-Check: PASSED

All 6 files verified present. Both task commits (a49a65b, dfd0b8e) verified in git log. TypeScript compiles cleanly.

---
*Phase: 03-code-review-diff-editing*
*Completed: 2026-03-28*
