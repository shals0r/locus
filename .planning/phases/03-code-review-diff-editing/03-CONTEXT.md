# Phase 3: Code Review, Diff & Editing - Context

**Gathered:** 2026-03-28
**Status:** Ready for planning

<domain>
## Phase Boundary

In-browser diff viewing (local changes + MR/PR diffs), AI-assisted code review with Claude annotations promotable to real MR/PR comments, and a Monaco-based code editor with file tree navigation and save-back to local/remote machines. Creating integrations, new data sources, and skills are separate phases.

</domain>

<decisions>
## Implementation Decisions

### Diff viewer experience
- Split (side-by-side) view by default, with toggle to switch to unified view — remember user preference
- Full syntax highlighting on both sides of the diff (language-aware coloring)
- Full file displayed with changed sections highlighted — no collapsed context regions
- Virtual scrolling for large diffs (render only visible lines)
- Changed file list shown as a persistent file list sidebar on the left side of the diff tab, with status icons (added/modified/deleted)
- Local diffs and MR/PR diffs use the same diff renderer, but with different context bars:
  - Local diffs: show branch/repo context
  - MR/PR diffs: show MR title, author, status, review state
- No inline commenting on local diffs — inline comments only on MR/PR diffs (where they map to real review comments)
- Diff opens as a tab in the center panel (existing pattern from Phase 2)

### AI review interaction
- Explicit trigger: "Review with Claude" button in the diff view toolbar — no auto-suggestion
- Custom prompt support: user can type review instructions (e.g., "focus on error handling", "check for SQL injection") to focus Claude's review
- Loading spinner while review runs, then all annotations appear at once (not streaming)
- Annotations displayed as gutter icons in the diff — clicking an icon shows the annotation in a side panel (keeps diff clean)
- Annotations are always editable text — user can refine wording before promoting to real comments
- Select and batch-post: checkboxes on each annotation, then "Post selected as comments" button — user reviews before posting
- Full review submission flow: Approve, Request Changes, or Comment — with optional summary message (mirrors GitHub/GitLab review UI)
- Contextual chat interface alongside the review:
  - Floating resizable side panel that slides in from the right edge, overlaying part of the diff
  - Has full context of the review (diff, annotations, existing comments)
  - User can highlight text in the diff view and add that section as context in the chat
  - Can reference specific comment threads or teammate responses as context
  - Used for asking Claude questions about comments, drafting responses, understanding code

### Existing MR/PR comments
- Fetch and display all existing teammate comments inline in the diff view — see full review conversation alongside Claude's annotations
- Full thread replies: user can read and reply to comment threads from within Locus — no need to leave

### MR/PR access flow
- MR/PR diffs are NOT accessed directly from feed items
- Flow follows the Phase 2 pattern: Feed → promote to task card on board → action from board card
- MR/PR task cards on the board have special actions: "View diff", "Send for AI review", "Approve", "Request changes"
- All actioning happens from the board, never directly from the feed

### Code editor behavior
- Monaco editor with dark theme matching the Locus app theme
- Multiple file tabs supported within the editor — switch between open files (VS Code-like)
- Minimap enabled (code preview strip on the right)
- Basic autocomplete: Monaco's built-in word-based autocomplete + bracket matching, no LSP
- Find & replace: Ctrl+F / Ctrl+H with regex support (Monaco built-in)
- Explicit save with Ctrl+S — dot on tab indicates unsaved changes
- Confirm dialog on closing tab with unsaved changes ("Save / Discard / Cancel")
- Full CRUD file operations: create new files, rename, delete from the file tree
- Works on both local and remote machine files — content fetched/saved over SSH for remote, filesystem for local
- Opening a file from a diff view opens a separate editor tab (diff and editor are independent tabs)
- Auto-reload from disk if no unsaved changes in editor; notification if there are unsaved edits and file changed on disk
- Cross-file search: search panel in the sidebar (another tab: Git | Files | Search) with results linking to editor tabs

### Layout & navigation
- Left sidebar gains tabs per repo: "Git | Files | Search" — repo-scoped (content switches when selecting a different repo)
  - Git tab: existing changes + commit log view (default when selecting a repo)
  - Files tab: full directory tree for the repo
  - Search tab: cross-file search within the repo
- Center panel tab bar: terminal tabs, diff tabs, and editor tabs all share one tab bar
  - Icon prefix per tab type: terminal icon, diff icon, file icon — for visual distinction
  - Tabs are draggable/reorderable
  - No tab persistence across sessions — session-only
- Clickable breadcrumb navigation at top of editor/diff tabs (repo > branch > path > file)
- MR/PR metadata (title, description, status, reviewers, pipeline) shown as a collapsible header bar at the top of the diff tab
- Context-aware keyboard shortcuts: same keys do context-appropriate things (Ctrl+S saves in editor, ignored in diff; Ctrl+F finds in both)
- Command palette (from Phase 2) extended with file/editor actions: "Open file", "Go to line", "Search in files"

### Claude's Discretion
- Exact diff library choice and configuration (evaluate @git-diff-view/react vs alternatives)
- Loading skeleton and spinner design
- Exact spacing, typography, and icon choices
- Error state handling for failed file loads, SSH disconnects during edit, API failures
- Chat interface implementation details
- How file watching/change detection works for auto-reload
- Annotation severity categories and visual treatment

</decisions>

<specifics>
## Specific Ideas

- "Make it all tab based for important stuff like this" — center panel tabs are the universal container for terminals, diffs, editors
- Left sidebar tabs (Git | Files | Search) follow VS Code / JetBrains mental model — "probably the least surprising for developers"
- Review chat should let user highlight diff text and add as context — like having a conversation about the code with Claude
- Board-centric workflow: always action MR/PRs from task cards on the board, not directly from feed items

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 03-code-review-diff-editing*
*Context gathered: 2026-03-28*
