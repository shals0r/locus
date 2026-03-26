# Phase 2: Repository Management & Work Feed - Context

**Gathered:** 2026-03-26
**Status:** Ready for planning
**Mockup:** mockup.html (v3 — refined through iterative design)

<domain>
## Phase Boundary

User can see git state for every repo, perform git operations from the sidebar, view commit history and changed files, receive a unified prioritized work feed from any source, promote feed items into actionable tasks on a work board, and navigate everything via a command palette. Creating diffs/reviews (Phase 3), building integration workers (Phase 4), and host agent (Phase 5) are out of scope.

</domain>

<decisions>
## Implementation Decisions

### Git Sidebar Layout
- Repos grouped by machine, collapsible — machine headers expand/collapse to show/hide repos
- Left panel splits into two scrollable sections: top = machines/repos (260px panel width), bottom = VS Code-style commit timeline for selected repo
- Each repo row shows: branch name, clean/dirty indicator (colored dot + changed file count), ahead/behind counts, last activity timestamp
- Dirty state shown as colored dot (green=clean, orange=dirty) with number of changed files
- Clicking a repo: opens commit timeline in bottom-left panel AND opens a terminal tab cd'd into the repo
- Commit timeline: VS Code-style vertical timeline with commit messages and relative timestamps. Supports full file history (foundation for Phase 3 diff views)
- Changed files section above the timeline showing staged/unstaged files with status indicators (M/A/D)
- Clicking any file (changed or from a commit) opens diff in center panel

### Git Operations
- Fetch / Pull / Push available per repo (no bulk "fetch all")
- Branch checkout via dropdown on branch name — click branch name to see local branches + "New branch..." option
- "Open terminal in repo" action available per repo
- Git operation feedback: inline status on repo row (spinner while running, brief success/error result)
- Repo state refreshes via polling every 30 seconds

### Right Panel: Feed/Board Toggle
- Right panel (340px) has two tabs in the header: **Feed** and **Board**
- Feed tab = incoming signals (vertical stacked tier view)
- Board tab = task board (3-column: Queue / Active / Done)
- Both live in the same panel — toggle between inbox and workboard

### Feed Design & Triage (Feed Tab)
- **Vertical stacked layout** with collapsible tier sections and sticky tier headers — NOT horizontal kanban (changed from v2)
- 5 urgency tiers: Now / Respond / Review / Prep / Follow up
- Now + Respond expanded by default; Prep + Follow up collapsed by default
- Single vertical scroll axis — no horizontal scrolling
- Each feed card shows: source icon + title (single line), relative timestamp, unread dot indicator, 1-line snippet
- Tier accent: colored left border on each card matches its urgency tier color
- Triage actions on hover (replace snippet on hover): Quick Promote, Deep Promote, Snooze, Dismiss
- Dismissed items go to a hidden "Dismissed" archive section (recoverable)
- Snooze uses fixed presets: 1 hour, 4 hours, Tomorrow 9am, Next Monday 9am
- Empty state is context-dependent: setup prompt if no sources configured; zen "all clear" message if sources exist but nothing pending
- Urgency tier assignment: AI-assisted classification — Claude analyzes item content and suggests a tier

### Card Promote Actions (Feed → Board)
- **Quick Promote**: One-click action on any feed card. Auto-generates task context from feed item metadata (source, links, timestamps, related commits). Drops directly into Queue on the Board.
- **Deep Promote**: Opens an LLM triage modal. Shows source feed item card, pre-filled task title, LLM analysis/suggestion, editable context textarea. User adds context, LLM helps scope the task. Result goes into Queue.
- Both accessible from the card hover actions row

### Task Board (Board Tab)
- 3 work-state columns as vertical stacked sections: **Queue → Active → Done**
- NOT urgency-based columns — urgency tier from original feed item preserved as colored left-border accent on task card (visual priority signal)
- Queue sorted by tier color by default (red/now items float to top)
- Task cards show: tier accent bar, source icon, title, brief context snippet
- Hover reveals: "Start" button (Queue cards), "Complete" button (Active cards), Edit, Drop
- Done cards show: strikethrough title, completion timestamp, commit count, auto-close reference. Fade after 24h (or configurable).

### "Start" Flow: Machine + Repo Picker
- Clicking "Start" on a Queue task opens an inline picker within the board
- Step 1: Select from available machines (shows connection status)
- Step 2: Select repo on that machine (shows current branch)
- Option to create a new branch from the task title
- "Start session" confirms and moves card to Active, opens the Working Session

### Working Session: Context Strip
- When a task is Active, the center panel gets a **pinned context strip** above the editor/diff tabs
- Shows: tier dot, task title, "Active" badge, collapsible body
- Expanded body shows: LLM-generated or auto-generated context brief, source tags (Jira ticket, branch, machine/repo), "Copy context" button
- Context persists for the entire session — not lost after one paste
- Collapsible so it doesn't eat screen space when deep in code
- "Copy context" button for quick paste into Claude Code, ChatGPT, etc.

### Commit-Closes-Task Automation
- When a commit message references the task ID or the branch was created from the task, the task auto-moves to Done
- Done column shows completed tasks with checkmark and completion timestamp
- Tasks in Done fade after 24h (user-configurable)

### Ingest & Sources
- Dual ingest: webhook endpoint for real-time push + built-in polling adapters for sources that don't support webhooks
- Built-in polling adapters in Phase 2: GitHub/GitLab (PRs, reviews, CI), Jira (assigned/mentioned tickets), Google Calendar (upcoming events)
- Deduplication via source type + external ID — if item exists, update instead of creating duplicate
- Webhook authentication: shared secret / HMAC signature verification per source

### Command Palette & Shortcuts
- Searchable: repos + branches, machines, feed items, **tasks**, actions/commands
- Actions include: "Promote to task", "Start task", "Complete task"
- Trigger: both Ctrl+K and Ctrl+P open the same palette
- Results grouped with section headers: Repos, Machines, Feed Items, Tasks, Actions
- Keyboard shortcuts: VS Code-inspired set (Ctrl+K/P for palette, Ctrl+` for terminal, Ctrl+B for sidebar toggle, Ctrl+J for feed panel toggle, and others following VS Code conventions)

### Visual Design Decisions (from mockup v3)
- Left panel: 260px width
- Right panel: 340px width
- Tighter padding globally (1-2px reduction from v2)
- Compact card design: single-line title row, single-line snippet
- Metadata font size: 10px
- Scrollbar width: 5px
- Dark theme with GitHub-dark-inspired color palette

### Claude's Discretion
- Polling adapter refresh intervals
- VS Code shortcut mappings beyond the core set
- Commit timeline pagination/lazy loading
- Diff viewer implementation details (basic for Phase 2, full in Phase 3)
- Done card fade timing default
- Task ID format and referencing convention
- LLM analysis prompt design for Deep Promote

</decisions>

<specifics>
## Specific Ideas

- Left panel layout inspired by VS Code: machines/repos on top, commit timeline on bottom — both independently scrollable
- Commit timeline should feel like VS Code's timeline view — compact, scannable, relative timestamps
- Feed is vertical stacked tiers (NOT horizontal kanban) — single scroll axis is key for the right panel's narrow width
- Command palette grouped results like Linear's Ctrl+K — section headers with fuzzy search across all categories
- Git operation feedback is inline on the repo row, not toasts or modals — keeps the flow uninterrupted
- Branch dropdown directly on branch name text, not behind a menu — fast and direct
- Deep Promote modal shows LLM analysis that contextualizes the feed item (e.g., "Likely cause: the token refresh refactor from PR #36 changed the middleware signature")
- Context strip "Copy context" is designed for pasting into Claude Code or other AI tools — should format a clean task brief
- Task board is intentionally simple (3 states) — not trying to be Jira, just Queue/Active/Done

</specifics>

<deferred>
## Deferred Ideas

- Code editing in the browser — expanded Phase 3 scope to include Monaco-based editor with file tree and save-back (Phase 3 renamed to "Code Review, Diff & Editing")

</deferred>

---

*Phase: 02-repository-management-work-feed*
*Context gathered: 2026-03-26*
