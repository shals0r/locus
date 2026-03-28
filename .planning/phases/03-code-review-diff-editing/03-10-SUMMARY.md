---
plan: "03-10"
phase: 03-code-review-diff-editing
status: complete
started: 2026-03-28T15:00:00Z
completed: 2026-03-28T20:00:00Z
---

# Plan 03-10: Visual & Functional Verification

## What Was Done

Interactive user testing of all Phase 3 capabilities with Docker Compose dev environment.

## Verified Working

- **Diff viewer**: Split/unified toggle, per-file diffs, tab switching, DiffPanel toolbar
- **Monaco editor**: Opens files, dark theme, Ctrl+S save, syntax highlighting, minimap
- **Edit from diff**: Edit button opens file in editor tab (fixed relative path bug)
- **File tree**: Directories expand, files visible, context menu CRUD
- **Search**: Cross-file search finds results, opens editor tabs
- **Command palette**: File commands appear (Ctrl+K)
- **Breadcrumb**: Visible above editor/diff views
- **Unsaved dialog**: Save/Discard/Cancel on dirty editor tab close
- **Terminal close**: Detach/kill dialog restored
- **Tab bar**: Hidden scrollbar, horizontal scroll works
- **Changed files**: Auto-refresh via 10s polling

## Bugs Found & Fixed During Testing

1. DirectoryEntry missing `path` field — file tree couldn't expand
2. Tab bar had ugly native scrollbar — hidden with scrollbar-hide CSS
3. Search results opened diff tabs instead of editor — switched to openEditorTab
4. Terminal close dialog missing — restored CloseSessionDialog with detach/kill
5. DiffViewer showed same content for all tabs — added React key for remount
6. Edit from diff failed with relative paths — prepend repoPath
7. Changed files list didn't refresh — added 10s refetchInterval
8. DiffPanel not rendered — CenterPanel used bare DiffViewer, restored DiffPanel
9. Machine tab bar had scrollbar — same scrollbar-hide fix
10. Claude overview tab removed — redundant with terminal tab status indicators
11. mtime type mismatch (int vs string) — converted to ISO string
12. FileCreateRequest missing is_dir — added for directory creation

## Not Tested (Requires Credentials)

- MR/PR diffs from GitHub/GitLab (code exists, untested)
- MR/PR comment threads and replies
- Approve/Request Changes actions
- AI review via Anthropic API (being rearchitected to use Claude Code CLI)

## Known Deferred Items

- **File tree performance**: SSH-per-request is slow. Needs host-side file watcher (Phase 5 Host Agent)
- **AI review rearchitecture**: User decision to use Claude Code CLI sessions instead of direct Anthropic API. Eliminates need for separate LOCUS_LLM_API_KEY.

## Key Files

All Phase 3 component files verified present and non-empty (18 components).
