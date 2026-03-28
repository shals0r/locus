---
phase: 03-code-review-diff-editing
plan: 04
subsystem: diff-viewer
tags: [diff, git-diff-view, split-view, syntax-highlighting, virtual-scrolling]
dependency_graph:
  requires: ["03-03"]
  provides: ["DiffViewer-react", "DiffFileList", "DiffToolbar", "DiffContextBar", "DiffPanel", "useDiffData"]
  affects: ["CenterPanel", "main.css"]
tech_stack:
  added: ["@git-diff-view/react integration", "@git-diff-view/file DiffFile instances"]
  patterns: ["DiffFile constructor with initTheme/initRaw/buildSplitDiffLines/buildUnifiedDiffLines", "localStorage preference persistence", "wrapper panel composition pattern"]
key_files:
  created:
    - frontend/src/hooks/useDiffData.ts
    - frontend/src/components/diff/DiffFileList.tsx
    - frontend/src/components/diff/DiffToolbar.tsx
    - frontend/src/components/diff/DiffContextBar.tsx
    - frontend/src/components/diff/DiffPanel.tsx
  modified:
    - frontend/src/components/diff/DiffViewer.tsx
    - frontend/src/components/layout/CenterPanel.tsx
    - frontend/src/main.css
decisions:
  - "DiffPanel wrapper composes all diff sub-components instead of inlining in CenterPanel"
  - "Mode state owned by DiffPanel, passed down to DiffToolbar and DiffViewer for consistency"
  - "CSS variable overrides for @git-diff-view/react to match Locus dark theme tokens"
metrics:
  duration: "6min"
  completed: "2026-03-28"
  tasks: 2
  files: 8
---

# Phase 03 Plan 04: Diff Viewer @git-diff-view/react Integration Summary

Full @git-diff-view/react replacement of Phase 2 manual DiffLine renderer with split/unified toggle, syntax highlighting, virtual scrolling, file list sidebar, toolbar, and context bars.

## What Was Done

### Task 1: Replace DiffViewer with @git-diff-view/react + create hooks (af2ec31)

**Complete rewrite of DiffViewer.tsx** -- deleted all Phase 2 manual DiffLine rendering code. Replaced with:

- `DiffFile` instances built from raw unified diff text via `new DiffFile(oldName, "", newName, "", [rawDiff], lang, lang)` followed by `initTheme("dark")`, `initRaw()`, `buildSplitDiffLines()`, `buildUnifiedDiffLines()`
- `DiffView` component from @git-diff-view/react with split view default, dark theme, syntax highlighting enabled, font size 13, no wrapping
- Language detection from file extensions (30+ languages mapped)
- localStorage persistence for view mode preference (`locus-diff-mode` key)
- Multi-file diff splitting by `diff --git` headers for commit diffs
- Widget system pass-through props (`extendData`, `renderExtendLine`, `renderWidgetLine`, `onAddWidgetClick`) for Plan 06 annotation integration
- `isMrDiff` prop controls whether "+" add widget button appears (per locked decision: no inline commenting on local diffs)

**Created frontend/src/hooks/useDiffData.ts** with three TanStack Query hooks:
- `useDiffData(machineId, repoPath, filePath?, commitSha?)` -- fetches diff text, tries unstaged then staged for file diffs
- `useChangedFiles(machineId, repoPath)` -- fetches changed file list from `/api/git/changed-files`
- `useMrDiff(sourceType?, mrId?, projectInfo?)` -- placeholder returning empty state for Plan 05

### Task 2: DiffFileList + DiffToolbar + DiffContextBar (3c66b32)

**Created DiffFileList.tsx** -- 200px fixed-width sidebar showing changed files:
- Status icons: green Plus (added), yellow Pencil (modified), red Trash2 (deleted)
- File basename display with full path tooltip
- Selected file highlight with bg-hover
- File count header ("N files changed")
- Compact text-xs styling

**Created DiffToolbar.tsx** -- 36px toolbar with:
- Split/Unified toggle buttons with Columns2/List icons, accent background on active mode
- Disabled "Review with Claude" button (Bot icon, placeholder for Plan 06)
- Conditional Approve/Request Changes buttons when `isMrDiff=true` (disabled placeholders)

**Created DiffContextBar.tsx** -- 28px context bar with two modes:
- Local diff: breadcrumb with FolderGit2 > GitBranch > file path segments
- MR/PR diff: identifier + title + status badge (open/merged/closed with color coding)

**Created DiffPanel.tsx** -- wrapper composing the full layout:
- Flex row: DiffFileList (left, conditional on multi-file) | (right column: DiffToolbar + DiffContextBar + DiffViewer)
- Owns view mode state, passes to both toolbar and viewer
- Reads current branch from repoStore for context bar breadcrumb
- File selection state for multi-file commit diffs

**Updated CenterPanel.tsx** -- replaced bare DiffViewer import/usage with DiffPanel.

**Updated main.css** -- CSS variable overrides for @git-diff-view/react dark theme matching Locus color tokens (add/remove backgrounds, gutter colors, border, content text, hunk highlights).

## Deviations from Plan

None -- plan executed exactly as written.

## Known Stubs

| File | Line | Stub | Reason |
|------|------|------|--------|
| DiffToolbar.tsx | ~55 | "Review with Claude" button disabled | Plan 06 will wire AI review |
| DiffToolbar.tsx | ~65 | "Approve" button disabled | Plan 05 will wire MR/PR actions |
| DiffToolbar.tsx | ~73 | "Request Changes" button disabled | Plan 05 will wire MR/PR actions |
| useDiffData.ts | ~107 | useMrDiff returns empty state | Plan 05 will implement MR/PR backend |

All stubs are intentional placeholders for future plans (05 and 06) and do not prevent this plan's goal from being achieved. The diff viewer is fully functional for local diffs.

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 | af2ec31 | feat(03-04): replace DiffViewer with @git-diff-view/react integration |
| 2 | 3c66b32 | feat(03-04): add DiffFileList, DiffToolbar, DiffContextBar, and DiffPanel layout |

## Self-Check: PASSED

- All 8 files verified present in commits (git show --stat)
- Commit af2ec31: 2 files (DiffViewer.tsx, useDiffData.ts) -- FOUND
- Commit 3c66b32: 6 files (DiffContextBar, DiffFileList, DiffPanel, DiffToolbar, CenterPanel, main.css) -- FOUND
- No untracked files remaining (git status clean)
