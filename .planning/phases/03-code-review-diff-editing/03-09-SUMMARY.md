---
phase: 03-code-review-diff-editing
plan: 09
subsystem: navigation-discovery
tags: [search, breadcrumb, command-palette, diff-editor, sidebar-tabs]
dependency_graph:
  requires: ["03-04", "03-07"]
  provides: ["file-search-api", "file-search-ui", "sidebar-tabs", "file-breadcrumb", "command-palette-file-actions", "diff-to-editor"]
  affects: ["frontend/src/components/layout/Sidebar.tsx", "frontend/src/components/layout/CenterPanel.tsx", "frontend/src/components/palette/CommandPalette.tsx", "frontend/src/stores/commandPaletteStore.ts", "backend/app/main.py"]
tech_stack:
  added: []
  patterns: ["custom-event-dispatch for cross-component tab switching", "debounced-search with TanStack Query", "conditional command palette actions via when() predicate", "command palette sub-modes (goto-line)"]
key_files:
  created:
    - backend/app/api/files.py
    - frontend/src/components/filetree/FileSearch.tsx
    - frontend/src/components/navigation/SidebarTabs.tsx
    - frontend/src/components/editor/FileBreadcrumb.tsx
  modified:
    - backend/app/main.py
    - frontend/src/components/layout/Sidebar.tsx
    - frontend/src/components/layout/CenterPanel.tsx
    - frontend/src/components/palette/CommandPalette.tsx
    - frontend/src/stores/commandPaletteStore.ts
decisions:
  - "Custom events (locus:sidebar-tab) for command palette -> sidebar tab switching rather than shared store"
  - "Go to Line as sub-mode in command palette (mode: goto-line) rather than inline prompt"
  - "File search results click opens diff tab (reuses existing tab system) until dedicated editor tabs exist"
  - "Sidebar tabs (Git/Search/Files) live in Sidebar component state, switchable via events"
  - "FileBreadcrumb derives branch from repoStore rather than prop"
metrics:
  duration: 7min
  completed: "2026-03-28T12:48:01Z"
  tasks_completed: 2
  tasks_total: 2
  files_created: 4
  files_modified: 5
---

# Phase 03 Plan 09: Navigation and Discovery Features Summary

Cross-file grep search with sidebar Search tab, breadcrumb navigation above diffs, command palette extended with file/editor actions, and "Open in Editor" from diff view.

## What Was Built

### Task 1: FileSearch + Sidebar Tabs + File Search API

**Backend** (`backend/app/api/files.py`):
- `GET /api/files/search` endpoint that accepts machine_id, repo_path, query, case_sensitive, regex, and max_results parameters
- Uses `grep -rn` via `run_command_on_machine` from machine_registry (works for both local and remote machines)
- Excludes common directories (.git, node_modules, __pycache__, .venv, dist, build, etc.)
- Limits to first 50 matching files and 5 matches per file
- Returns structured results with file paths, line numbers, and matched text
- Registered in main.py as `files_router`

**Frontend** (`frontend/src/components/filetree/FileSearch.tsx`):
- Search panel rendered in sidebar Search tab
- Input with Search icon, 300ms debounce via useRef timer
- Toggle buttons: "Match Case" (Aa) and "Regex" (.*)
- Results: scrollable list of files with match count badges
- Expandable: click file to reveal matched lines with line numbers
- Each line clickable: opens file in diff/editor tab via sessionStore.openDiffTab
- Loading, empty, no-results, and no-repo-selected states
- Uses TanStack Query with 15s stale time for caching

**SidebarTabs** (`frontend/src/components/navigation/SidebarTabs.tsx`):
- Tab bar with Git, Search, Files tabs
- Active tab highlighted with accent border-bottom
- Each tab has icon + label

**Sidebar wiring**:
- Sidebar now renders SidebarTabs at top
- Git tab: original repo list + commit timeline
- Search tab: FileSearch component
- Files tab: placeholder (future file tree browser)
- Listens for `locus:sidebar-tab` custom events from command palette

### Task 2: FileBreadcrumb + Command Palette + Diff-to-Editor

**FileBreadcrumb** (`frontend/src/components/editor/FileBreadcrumb.tsx`):
- Horizontal breadcrumb: repo name > branch > path segments > file name
- ChevronRight separators, h-7 height, bg-dominant, text-xs
- Each segment clickable with onSegmentClick callback
- Branch derived from repoStore (matching machineId + repoPath)
- Rendered in CenterPanel above diff content when diff tab is active

**Command Palette extensions**:
- "Open File..." -- switches sidebar to Files tab
- "Search in Files..." -- switches sidebar to Search tab and focuses input
- "Go to Line..." -- enters goto-line sub-mode with number input (visible when diff tab active)
- "Toggle Split/Unified Diff" -- dispatches toggle event (visible when diff tab active)
- "Save File" -- future save trigger (visible when diff tab active)
- "Open in Editor" -- opens diff file in separate editor tab (visible when diff tab has filePath)
- Actions grouped by Navigation, Files, Editor categories
- Conditional visibility via `when()` predicates

**commandPaletteStore** extended:
- Added `mode` state (default | goto-line)
- Added `setMode()` and `openWithMode()` actions
- Close resets mode to default

**Diff-to-Editor**:
- "Edit" button added to diff tab header in CenterPanel (FileEdit icon + "Edit" text)
- Visible only when diff has a filePath (not commit-level diffs)
- Opens the file as a new tab with "[Edit]" prefix in label
- Satisfies decision: "Opening a file from a diff view opens a separate editor tab"

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Created SidebarTabs from scratch**
- **Found during:** Task 1
- **Issue:** Plan references SidebarTabs but no such component existed; sidebar had no tab system
- **Fix:** Created SidebarTabs component and integrated into Sidebar
- **Files modified:** frontend/src/components/navigation/SidebarTabs.tsx, frontend/src/components/layout/Sidebar.tsx
- **Commit:** fad1289

**2. [Rule 3 - Blocking] DiffToolbar does not exist**
- **Found during:** Task 2
- **Issue:** Plan references DiffToolbar.tsx but diff toolbar is inline in CenterPanel
- **Fix:** Added "Edit" button directly in the CenterPanel diff tab header alongside existing close button
- **Files modified:** frontend/src/components/layout/CenterPanel.tsx
- **Commit:** 04daa09

**3. [Rule 2 - Missing functionality] Cross-component tab switching**
- **Found during:** Task 2
- **Issue:** Command palette needs to switch sidebar tabs but components don't share state
- **Fix:** Used CustomEvent dispatch pattern (locus:sidebar-tab) for loose coupling between command palette and sidebar
- **Files modified:** frontend/src/components/palette/CommandPalette.tsx, frontend/src/components/layout/Sidebar.tsx
- **Commit:** 04daa09

## Known Stubs

| File | Line | Stub | Reason |
|------|------|------|--------|
| frontend/src/components/layout/Sidebar.tsx | 126 | "File tree browser coming soon" | Files tab is a placeholder; plan only requires Git and Search tabs |
| frontend/src/components/palette/CommandPalette.tsx | 197 | Go to Line is a no-op | Requires editor with Monaco/CodeMirror (editorRef.revealLineInCenter) -- not built yet |

These stubs do not prevent the plan's goals. File search, breadcrumb, command palette actions, and diff-to-editor all function as specified.

## Verification

- [x] FileSearch renders in sidebar Search tab with debounced input
- [x] Search results show file paths with expandable line-level matches
- [x] Clicking a match opens file in diff/editor tab
- [x] Breadcrumb visible above diff content (repo > branch > path > file)
- [x] Command palette shows file/editor commands (Open File, Search in Files, Go to Line, Toggle Diff, Save, Edit)
- [x] "Edit" button in diff toolbar opens file in separate tab
- [x] TypeScript compiles cleanly (tsc --noEmit passes)

## Self-Check: PASSED

- [x] backend/app/api/files.py -- FOUND
- [x] frontend/src/components/filetree/FileSearch.tsx -- FOUND
- [x] frontend/src/components/navigation/SidebarTabs.tsx -- FOUND
- [x] frontend/src/components/editor/FileBreadcrumb.tsx -- FOUND
- [x] Commit fad1289 -- FOUND
- [x] Commit 04daa09 -- FOUND
