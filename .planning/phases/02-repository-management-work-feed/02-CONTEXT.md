# Phase 2: Repository Management & Work Feed - Context

**Gathered:** 2026-03-26
**Status:** Ready for planning

<domain>
## Phase Boundary

User can see git state for every repo, perform git operations from the sidebar, view commit history and changed files, and receive a unified prioritized work feed from any source with triage actions and a command palette for fast navigation. Creating diffs/reviews (Phase 3), building integration workers (Phase 4), and host agent (Phase 5) are out of scope.

</domain>

<decisions>
## Implementation Decisions

### Git Sidebar Layout
- Repos grouped by machine, collapsible — machine headers expand/collapse to show/hide repos
- Left panel splits into two scrollable sections: top = machines/repos, bottom = VS Code-style commit timeline for selected repo
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

### Feed Design & Triage
- Kanban-style horizontal scroll layout — 5 columns for urgency tiers: Now / Respond / Review / Prep / Follow up
- Each feed card shows: title + source icon, relative timestamp, clickable source link, 1-2 line context snippet
- Triage actions: mark read/unread, dismiss (to archive), snooze, drag between columns to re-tier
- Dismissed items go to a hidden "Dismissed" archive section (recoverable, not permanent delete)
- Snooze uses fixed presets: 1 hour, 4 hours, Tomorrow 9am, Next Monday 9am
- Empty state is context-dependent: setup prompt if no sources configured; zen "all clear" message if sources exist but nothing pending
- Urgency tier assignment: AI-assisted classification — Claude analyzes item content and suggests a tier

### Ingest & Sources
- Dual ingest: webhook endpoint for real-time push + built-in polling adapters for sources that don't support webhooks
- Built-in polling adapters in Phase 2: GitHub/GitLab (PRs, reviews, CI), Jira (assigned/mentioned tickets), Google Calendar (upcoming events)
- Deduplication via source type + external ID — if item exists, update instead of creating duplicate
- Webhook authentication: shared secret / HMAC signature verification per source

### Command Palette & Shortcuts
- Searchable: repos + branches, machines, feed items, actions/commands
- Trigger: both Ctrl+K and Ctrl+P open the same palette
- Results grouped with section headers: Repos, Machines, Feed Items, Actions
- Keyboard shortcuts: VS Code-inspired set (Ctrl+K/P for palette, Ctrl+` for terminal, Ctrl+B for sidebar toggle, Ctrl+J for feed panel toggle, and others following VS Code conventions)

### Claude's Discretion
- Exact kanban card styling and spacing
- Polling adapter refresh intervals
- VS Code shortcut mappings beyond the core set
- Commit timeline pagination/lazy loading
- Feed item card hover states and animations
- Diff viewer implementation details (basic for Phase 2, full in Phase 3)

</decisions>

<specifics>
## Specific Ideas

- Left panel layout inspired by VS Code: machines/repos on top, commit timeline on bottom — both independently scrollable
- Commit timeline should feel like VS Code's timeline view — compact, scannable, relative timestamps
- Kanban feed modeled after Linear/Trello horizontal column layout
- Command palette grouped results like Linear's Ctrl+K — section headers with fuzzy search across all categories
- Git operation feedback is inline on the repo row, not toasts or modals — keeps the flow uninterrupted
- Branch dropdown directly on branch name text, not behind a menu — fast and direct

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 02-repository-management-work-feed*
*Context gathered: 2026-03-26*
