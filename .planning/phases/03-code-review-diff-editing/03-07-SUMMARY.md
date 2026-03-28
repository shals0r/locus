---
phase: "03"
plan: "07"
subsystem: frontend-editor
tags: [monaco, editor, file-tree, file-operations, sidebar]
dependency_graph:
  requires: ["03-01", "03-03"]
  provides: ["monaco-editor", "file-tree", "file-operations", "editor-tabs"]
  affects: ["center-panel", "sidebar", "session-store"]
tech_stack:
  added: ["@monaco-editor/react", "monaco-editor"]
  patterns: ["loader.config for local bundling", "TanStack Query cache invalidation cross-feature", "inline rename in tree nodes"]
key_files:
  created:
    - frontend/src/components/editor/CodeEditor.tsx
    - frontend/src/components/editor/FileBreadcrumb.tsx
    - frontend/src/components/editor/UnsavedDialog.tsx
    - frontend/src/components/filetree/FileTree.tsx
    - frontend/src/components/filetree/FileTreeNode.tsx
    - frontend/src/hooks/useFileOperations.ts
    - frontend/src/hooks/useMonacoTheme.ts
    - frontend/src/stores/fileTreeStore.ts
    - frontend/src/stores/editorStore.ts
    - frontend/src/components/navigation/SidebarTabs.tsx
  modified:
    - frontend/package.json
    - frontend/src/components/layout/CenterPanel.tsx
    - frontend/src/components/layout/Sidebar.tsx
    - frontend/src/components/navigation/SessionTabBar.tsx
    - frontend/src/stores/sessionStore.ts
decisions:
  - "Local Monaco bundling via loader.config({ monaco }) -- no CDN dependency, no vite-plugin-monaco-editor needed"
  - "useWriteFile invalidates diff, changedFiles, file, and fileStat query caches for cross-feature reactivity"
  - "UnsavedDialog replaces window.confirm for save/discard/cancel flow with proper modal"
  - "File tree uses lazy-load pattern: children fetched only when directory is expanded"
  - "Context menu positioned at click coordinates with global click-outside dismissal"
metrics:
  duration: "13min"
  completed: "2026-03-28"
  tasks_completed: 2
  tasks_total: 2
  files_created: 10
  files_modified: 5
---

# Phase 03 Plan 07: Monaco Editor + File Tree Summary

Monaco editor with locus-dark theme, local bundling via @monaco-editor/react, file tree browser in sidebar Files tab, and CRUD file operations through backend API hooks.

## What Was Built

### Task 1: Monaco Editor + Theme + File Operations

- Installed `@monaco-editor/react` and `monaco-editor` packages with local bundling (no CDN)
- **useMonacoTheme**: Custom "locus-dark" theme matching the app's Tokyo Night-inspired color scheme (bg #1a1b26, keywords #bb9af7, strings #9ece6a, functions #7aa2f7)
- **useFileOperations**: TanStack Query hooks for all file CRUD operations:
  - `useReadFile` - fetch file content with language detection
  - `useWriteFile` - save with cache invalidation for diff, changedFiles, file, and fileStat queries
  - `useListDirectory` - lazy directory listing for file tree
  - `useCreateFile`, `useRenameFile`, `useDeleteFile` - CRUD mutations with parent directory cache invalidation
  - `useFileStat` - 5-second polling for external change detection
- **CodeEditor**: Monaco wrapper with Ctrl+S save, minimap, bracket colorization, auto-reload detection (silent reload when clean, notification bar when dirty)
- **UnsavedDialog**: Modal with Save/Discard/Cancel for dirty tab close (replaces window.confirm)
- **FileBreadcrumb**: Path breadcrumb trail relative to repo root
- Updated **CenterPanel** to render CodeEditor for editor tabs (replacing placeholder)
- Updated **SessionTabBar** to use UnsavedDialog and handle save-then-close flow

### Task 2: File Tree + Sidebar Wiring

- **fileTreeStore**: Zustand store for expand/collapse state, context menu target, inline rename tracking
- **FileTreeNode**: Recursive tree node component -- directories expand on click (lazy-load children), files open in editor tabs via `openEditorTab`
- **FileTree**: Root-level tree component with New File/New Folder header buttons, loading spinner, "select a repo" empty state
- **Context menu**: Absolute-positioned menu at right-click coordinates with New File, New Folder, Rename (inline edit), Delete actions
- **Sidebar**: Updated to render FileTree when Files tab is active (was placeholder text)
- **SidebarTabs**: Created Git/Files/Search tab switcher component

## Decisions Made

| Decision | Rationale |
|----------|-----------|
| Local Monaco bundling via `loader.config({ monaco })` | Avoids CDN dependency; @monaco-editor/react handles worker setup internally -- no vite plugin needed |
| Cross-feature cache invalidation in useWriteFile | Saving a file must update diff viewer and changed files list; invalidating `['diff', machineId]` and `['changedFiles', machineId]` ensures stale data is refetched |
| UnsavedDialog modal over window.confirm | Proper UX with three distinct actions (Save, Discard, Cancel) and keyboard escape handling |
| Lazy directory loading | Children fetched only when expanded, reducing initial API calls for large repos |
| Inline rename in FileTreeNode | Better UX than a separate dialog -- replace name text with input, Enter to confirm, Escape to cancel |

## Deviations from Plan

### Auto-added (Rule 2)

**1. [Rule 2 - Missing] Created editorStore and sessionStore**
- **Found during:** Task 1
- **Issue:** Plan depends on 03-03 which created these stores, but the worktree branch predates those commits
- **Fix:** Included the editorStore and sessionStore (unified tab system with openEditorTab) as part of this plan's output to ensure TypeScript compilation succeeds
- **Files:** frontend/src/stores/editorStore.ts, frontend/src/stores/sessionStore.ts

**2. [Rule 2 - Missing] Created SidebarTabs component**
- **Found during:** Task 2
- **Issue:** SidebarTabs.tsx from 03-03 not present in worktree
- **Fix:** Created the component with Git/Files/Search tabs matching 03-03 design
- **Files:** frontend/src/components/navigation/SidebarTabs.tsx

## Known Stubs

None. All components are fully wired to backend API hooks. File operations route through the backend file service (`/api/files/*`) which was created in Plan 03-01.

## Verification

- TypeScript compilation passes with zero errors (`tsc --noEmit`)
- All 10 new files created and committed
- Monaco editor component renders with dark theme configuration
- File operation hooks connect to backend API endpoints
- File tree wired into sidebar Files tab
- Diff query cache invalidation wired in useWriteFile onSuccess

## Self-Check: PASSED

- FOUND: frontend/src/components/editor/CodeEditor.tsx
- FOUND: frontend/src/components/editor/FileBreadcrumb.tsx
- FOUND: frontend/src/components/editor/UnsavedDialog.tsx
- FOUND: frontend/src/components/filetree/FileTree.tsx
- FOUND: frontend/src/components/filetree/FileTreeNode.tsx
- FOUND: frontend/src/hooks/useFileOperations.ts
- FOUND: frontend/src/hooks/useMonacoTheme.ts
- FOUND: frontend/src/stores/fileTreeStore.ts
- FOUND: frontend/src/stores/editorStore.ts
- FOUND: frontend/src/components/navigation/SidebarTabs.tsx
- FOUND: commit 7202c6e (Task 1)
- FOUND: commit a7a66ec (Task 2)
