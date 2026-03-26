# Phase 2: Repository Management & Work Feed - Research

**Researched:** 2026-03-26
**Domain:** Git operations, work feed ingestion, task management, command palette, real-time UI
**Confidence:** HIGH (codebase patterns well-established from Phase 1; libraries well-documented)

## Summary

Phase 2 transforms Locus from a terminal manager into a full engineering control plane by adding three major subsystems: (1) a git sidebar with per-repo state, operations, and commit timeline; (2) a unified work feed with urgency tiers, triage, and ingest API; and (3) a task board with promote flows and context-aware working sessions. A command palette ties everything together.

The critical architectural insight is that **git operations must run via shell commands over SSH** (for remote machines) or subprocess (for local), not via GitPython. GitPython requires a local filesystem `Repo` object and cannot operate over SSH. The existing `run_command_on_machine()` pattern in `machine_registry.py` is the correct foundation -- all git operations become parsed `git` CLI calls routed through this abstraction.

**Primary recommendation:** Build a `services/git_service.py` that wraps `git status --porcelain=v2 --branch`, `git log`, `git diff`, `git fetch/pull/push`, and `git checkout/branch` as parsed shell commands executed via `run_command_on_machine()`. This keeps the architecture consistent with Phase 1's remote execution pattern and works identically for local and remote machines.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Repos grouped by machine, collapsible machine headers in left panel (260px)
- Left panel splits into top (machines/repos) and bottom (VS Code-style commit timeline)
- Each repo row shows: branch name, clean/dirty indicator (colored dot + count), ahead/behind, last activity
- Clicking a repo opens commit timeline in bottom-left AND opens a terminal tab cd'd into the repo
- Commit timeline: VS Code-style vertical with commit messages and relative timestamps
- Changed files section above timeline with M/A/D status indicators
- Clicking any file opens diff in center panel
- Git operations: Fetch/Pull/Push per repo (no bulk), branch checkout via dropdown, inline status feedback
- Repo state refreshes via polling every 30 seconds
- Right panel (340px) has Feed and Board tabs
- Feed: Vertical stacked layout with 5 urgency tiers (Now/Respond/Review/Prep/Follow up), collapsible sections, sticky headers
- Now + Respond expanded by default; Prep + Follow up collapsed
- Feed card: source icon + title, timestamp, unread dot, 1-line snippet, tier-colored left border
- Triage actions on hover: Quick Promote, Deep Promote, Snooze, Dismiss
- Snooze presets: 1h, 4h, Tomorrow 9am, Next Monday 9am
- Urgency tier assignment: AI-assisted classification
- Quick Promote: one-click, auto-generates task context, drops into Queue
- Deep Promote: opens LLM triage modal with pre-filled title, analysis, editable context
- Task Board: 3 columns (Queue/Active/Done) as vertical stacked sections, NOT urgency-based
- Queue sorted by tier color (red/now floats to top)
- Start flow: inline machine + repo picker, optional new branch from task title
- Working Session: pinned context strip above center panel tabs with tier dot, title, collapsible body, source tags, "Copy context" button
- Complete via context strip button or drag to Done
- Done cards: strikethrough, completion timestamp, fade after 24h (configurable)
- Ingest: webhook endpoint + built-in polling adapters (GitHub/GitLab, Jira, Google Calendar)
- Deduplication: source_type + external_id
- Webhook auth: HMAC signature verification per source
- Command palette: Ctrl+K and Ctrl+P, grouped results (Repos, Machines, Feed Items, Tasks, Actions)
- VS Code-inspired keyboard shortcuts

### Claude's Discretion
- Polling adapter refresh intervals
- VS Code shortcut mappings beyond the core set
- Commit timeline pagination/lazy loading
- Diff viewer implementation details (basic for Phase 2, full in Phase 3)
- Done card fade timing default
- LLM analysis prompt design for Deep Promote

### Deferred Ideas (OUT OF SCOPE)
- Code editing in the browser (Phase 3 scope -- Monaco-based editor with file tree and save-back)
</user_constraints>

## Standard Stack

### Core (already installed from Phase 1)
| Library | Version | Purpose | Status |
|---------|---------|---------|--------|
| FastAPI | ~0.135 | API framework + WebSocket | Installed |
| SQLAlchemy | ~2.0.48 | Async ORM | Installed |
| asyncpg | ~0.30 | Async Postgres driver | Installed |
| Pydantic v2 | (bundled) | Request/response validation | Installed |
| React 19 | ^19.0.0 | UI framework | Installed |
| Zustand 5 | ^5.0.0 | Client state | Installed |
| TanStack Query 5 | ^5.95.0 | Server state / caching | Installed |
| Tailwind CSS 4 | ^4.0.0 | Styling | Installed |
| react-resizable-panels | ^2.0.0 | Panel layout | Installed |
| lucide-react | ^0.500.0 | Icons | Installed |
| httpx | ~0.28 | Async HTTP client | Installed |

### New Dependencies for Phase 2
| Library | Version | Purpose | Why |
|---------|---------|---------|-----|
| cmdk | ^1.1.1 | Command palette | Industry standard (powers Vercel, Linear). Unstyled, composable. v1.1.1 is current stable. Built-in filtering and keyboard navigation. |
| @git-diff-view/react | ^0.1.3 | Basic diff viewer | GitHub-style UI, parses git unified diff natively, split + unified views, syntax highlighting. Foundation for Phase 3's full diff surface. |
| @dnd-kit/core | ^6.3.1 | Drag-and-drop (task board) | Lightweight (~10kb), zero deps, accessible. For dragging tasks to Done column. |
| @dnd-kit/sortable | ^10.0.0 | Sortable lists | Builds on @dnd-kit/core for reordering within and across board columns. |
| anthropic | ^0.79.0 | Claude API (AI triage) | Official SDK for Deep Promote LLM analysis and urgency tier classification. |
| APScheduler | ~3.11 | Polling workers | In-process scheduler for polling adapters (GitHub/GitLab/Jira/Calendar). Already in tech stack spec. |

### Alternatives Considered
| Instead of | Could Use | Why Not |
|------------|-----------|---------|
| cmdk | kbar | cmdk is more composable, better maintained, used by more production apps |
| @dnd-kit | hello-pangea/dnd | @dnd-kit is more flexible, actively maintained; hello-pangea is a fork of deprecated react-beautiful-dnd |
| fuse.js (fuzzy search) | Built-in cmdk filter | cmdk has built-in filtering; fuse.js only needed if cmdk's filter is insufficient for cross-category search |
| GitPython (remote) | git CLI via SSH | GitPython requires local Repo object -- cannot operate over SSH. CLI via `run_command_on_machine()` is the only viable approach for remote repos |

**Installation:**
```bash
# Backend
pip install anthropic apscheduler

# Frontend
npm install cmdk @git-diff-view/react @dnd-kit/core @dnd-kit/sortable
```

## Architecture Patterns

### Recommended Project Structure (New Files)
```
backend/app/
  api/
    repos.py           # Git operations REST API
    feed.py            # Feed items CRUD + ingest API
    tasks.py           # Task board CRUD
  models/
    repo.py            # Repository model (cached state)
    feed_item.py       # Feed item model
    task.py            # Task model
    integration_source.py  # Configured integration sources
  schemas/
    repo.py            # Repo request/response schemas
    feed.py            # Feed item schemas + ingest payload
    task.py            # Task schemas
  services/
    git_service.py     # Git operations via shell commands
    feed_service.py    # Feed item business logic + dedup
    task_service.py    # Task lifecycle (promote, start, complete)
    ai_service.py      # Claude API for triage + classification
    polling/
      __init__.py
      base.py          # Base polling adapter interface
      github.py        # GitHub polling adapter
      gitlab.py        # GitLab polling adapter
      jira.py          # Jira polling adapter
      calendar.py      # Google Calendar polling adapter
      scheduler.py     # APScheduler setup + management
  ws/
    feed.py            # WebSocket for real-time feed updates
    repos.py           # WebSocket for repo state changes

frontend/src/
  components/
    git/
      RepoList.tsx       # Machine-grouped repo sidebar
      RepoItem.tsx       # Single repo row with status
      CommitTimeline.tsx  # VS Code-style timeline
      ChangedFiles.tsx    # Staged/unstaged file list
      BranchDropdown.tsx  # Branch checkout/create dropdown
      GitOperations.tsx   # Fetch/pull/push buttons
    feed/
      FeedPanel.tsx      # Feed tab container
      TierSection.tsx    # Collapsible urgency tier
      FeedCard.tsx       # Individual feed card
      TriageActions.tsx  # Hover action buttons
      DeepPromoteModal.tsx  # LLM triage modal
    board/
      BoardPanel.tsx     # Board tab container
      BoardColumn.tsx    # Queue/Active/Done column
      TaskCard.tsx       # Task card in board
      StartFlowPicker.tsx  # Machine + repo picker inline
    session/
      ContextStrip.tsx   # Pinned context strip above center panel
    palette/
      CommandPalette.tsx   # cmdk-based command palette
      PaletteGroup.tsx     # Grouped search results
    diff/
      DiffViewer.tsx     # Basic diff display (Phase 2 scope)
  stores/
    repoStore.ts       # Git repo state
    feedStore.ts        # Feed items + tiers
    taskStore.ts        # Task board state
    commandStore.ts    # Command palette state + actions registry
  hooks/
    useRepoPolling.ts  # 30s repo state refresh
    useFeedWebSocket.ts  # Real-time feed updates
```

### Pattern 1: Git Operations via Shell Commands (CRITICAL)

**What:** All git operations are shell commands executed via `run_command_on_machine()`, not GitPython.

**Why:** GitPython requires a local `Repo(path)` object pointing to a filesystem path. Remote machines are accessed via SSH -- there is no local mount. The existing `run_command_on_machine()` in `machine_registry.py` already provides the correct abstraction: it routes to `local_machine_manager.run_command()` (subprocess) for local or `conn.run()` (AsyncSSH) for remote.

**How:**
```python
# backend/app/services/git_service.py

from app.services.machine_registry import run_command_on_machine

async def get_repo_status(machine_id: str, repo_path: str) -> RepoStatus:
    """Get branch, dirty state, ahead/behind for a repo."""
    raw = await run_command_on_machine(
        machine_id,
        f"git -C '{repo_path}' status --porcelain=v2 --branch"
    )
    return parse_porcelain_v2(raw)

async def get_commit_log(machine_id: str, repo_path: str, limit: int = 50) -> list[Commit]:
    """Get recent commits for timeline display."""
    raw = await run_command_on_machine(
        machine_id,
        f"git -C '{repo_path}' log --format='%H%x00%h%x00%s%x00%an%x00%aI%x00%D' -n {limit}"
    )
    return parse_git_log(raw)

async def get_changed_files(machine_id: str, repo_path: str) -> ChangedFiles:
    """Get staged and unstaged changed files."""
    raw = await run_command_on_machine(
        machine_id,
        f"git -C '{repo_path}' status --porcelain=v2"
    )
    return parse_changed_files(raw)

async def get_file_diff(machine_id: str, repo_path: str, file_path: str, staged: bool = False) -> str:
    """Get unified diff for a single file."""
    flag = "--cached" if staged else ""
    raw = await run_command_on_machine(
        machine_id,
        f"git -C '{repo_path}' diff {flag} -- '{file_path}'"
    )
    return raw  # Raw unified diff string for @git-diff-view/react

async def git_fetch(machine_id: str, repo_path: str) -> str:
    return await run_command_on_machine(
        machine_id, f"git -C '{repo_path}' fetch --all 2>&1"
    )

async def git_pull(machine_id: str, repo_path: str) -> str:
    return await run_command_on_machine(
        machine_id, f"git -C '{repo_path}' pull 2>&1"
    )

async def git_push(machine_id: str, repo_path: str) -> str:
    return await run_command_on_machine(
        machine_id, f"git -C '{repo_path}' push 2>&1"
    )

async def list_branches(machine_id: str, repo_path: str) -> list[str]:
    raw = await run_command_on_machine(
        machine_id,
        f"git -C '{repo_path}' branch --format='%(refname:short)'"
    )
    return [b.strip() for b in raw.strip().split('\n') if b.strip()]

async def checkout_branch(machine_id: str, repo_path: str, branch: str) -> str:
    return await run_command_on_machine(
        machine_id, f"git -C '{repo_path}' checkout '{branch}' 2>&1"
    )

async def create_branch(machine_id: str, repo_path: str, branch: str) -> str:
    return await run_command_on_machine(
        machine_id, f"git -C '{repo_path}' checkout -b '{branch}' 2>&1"
    )
```

### Pattern 2: Porcelain v2 Status Parsing

**What:** Parse `git status --porcelain=v2 --branch` output for reliable, scriptable repo state.

**Why:** Porcelain format is guaranteed stable across git versions and configurations. V2 provides more detail than v1 including sub-module state.

**Format:**
```
# branch.oid <commit-sha>
# branch.head <branch-name>
# branch.upstream <upstream-name>
# branch.ab +<ahead> -<behind>
1 <XY> <sub> <mH> <mI> <mW> <hH> <hI> <path>
2 <XY> <sub> <mH> <mI> <mW> <hH> <hI> <X><score> <path><sep><origPath>
? <path>                  # untracked
! <path>                  # ignored
```

**Parsing:**
```python
def parse_porcelain_v2(output: str) -> RepoStatus:
    branch = ""
    ahead = 0
    behind = 0
    staged = []
    unstaged = []
    untracked = []

    for line in output.strip().split('\n'):
        if line.startswith('# branch.head '):
            branch = line.split(' ', 2)[2]
        elif line.startswith('# branch.ab '):
            parts = line.split(' ')
            ahead = int(parts[2].lstrip('+'))
            behind = abs(int(parts[3].lstrip('-')))
        elif line.startswith('1 ') or line.startswith('2 '):
            xy = line.split(' ')[1]
            path = line.split(' ')[-1]  # simplified; handle renames
            index_status = xy[0]
            worktree_status = xy[1]
            if index_status != '.':
                staged.append(ChangedFile(path=path, status=index_status))
            if worktree_status != '.':
                unstaged.append(ChangedFile(path=path, status=worktree_status))
        elif line.startswith('? '):
            untracked.append(line[2:])

    is_dirty = len(staged) > 0 or len(unstaged) > 0 or len(untracked) > 0
    changed_count = len(set(f.path for f in staged + unstaged)) + len(untracked)

    return RepoStatus(
        branch=branch,
        is_dirty=is_dirty,
        changed_count=changed_count,
        ahead=ahead,
        behind=behind,
        staged=staged,
        unstaged=unstaged,
        untracked=untracked,
    )
```

### Pattern 3: Database Models for Feed + Tasks

**What:** Three new SQLAlchemy models: `FeedItem`, `Task`, `IntegrationSource`.

**Why:** Feed items and tasks have different lifecycles. Feed items come from external sources and get triaged. Tasks are promoted from feed items and go through Queue -> Active -> Done. IntegrationSource stores configuration for each connected source.

```python
# backend/app/models/feed_item.py
import uuid
from datetime import datetime
from sqlalchemy import DateTime, Enum, Integer, JSON, String, Text, Boolean, func
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base

class FeedItem(Base):
    __tablename__ = "feed_items"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    source_type: Mapped[str] = mapped_column(String(50))  # github, gitlab, jira, calendar, webhook, gsd
    source_id: Mapped[str | None] = mapped_column(String(255), nullable=True)  # integration_source FK
    external_id: Mapped[str] = mapped_column(String(500))  # dedup key within source_type
    title: Mapped[str] = mapped_column(String(500))
    snippet: Mapped[str | None] = mapped_column(Text, nullable=True)
    url: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    tier: Mapped[str] = mapped_column(String(20), default="follow_up")  # now, respond, review, prep, follow_up
    is_read: Mapped[bool] = mapped_column(Boolean, default=False)
    is_dismissed: Mapped[bool] = mapped_column(Boolean, default=False)
    snoozed_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    metadata_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)  # source-specific data
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # Unique constraint for deduplication
    __table_args__ = (
        # UniqueConstraint('source_type', 'external_id', name='uq_feed_source_external'),
    )


# backend/app/models/task.py
class Task(Base):
    __tablename__ = "tasks"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    feed_item_id: Mapped[uuid.UUID | None] = mapped_column(nullable=True)  # originating feed item
    title: Mapped[str] = mapped_column(String(500))
    context_brief: Mapped[str | None] = mapped_column(Text, nullable=True)  # LLM-generated or auto
    tier: Mapped[str] = mapped_column(String(20))  # preserved from feed item
    status: Mapped[str] = mapped_column(String(20), default="queue")  # queue, active, done
    machine_id: Mapped[str | None] = mapped_column(String(255), nullable=True)  # assigned machine
    repo_path: Mapped[str | None] = mapped_column(String(512), nullable=True)  # assigned repo
    branch_name: Mapped[str | None] = mapped_column(String(255), nullable=True)  # working branch
    source_tags: Mapped[dict | None] = mapped_column(JSON, nullable=True)  # {jira: "PROJ-123", branch: "fix/..."}
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


# backend/app/models/integration_source.py
class IntegrationSource(Base):
    __tablename__ = "integration_sources"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    source_type: Mapped[str] = mapped_column(String(50))  # github, gitlab, jira, calendar
    name: Mapped[str] = mapped_column(String(255))  # display name
    config: Mapped[dict] = mapped_column(JSON, default=dict)  # source-specific config
    webhook_secret: Mapped[str | None] = mapped_column(String(512), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    last_polled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
```

### Pattern 4: WebSocket-Triggered TanStack Query Invalidation

**What:** Real-time feed updates via WebSocket that invalidate TanStack Query caches.

**Why:** The existing codebase uses raw WebSocket + Zustand. For Phase 2, feed items are server state that benefits from TanStack Query's caching and refetching. WebSocket pushes should invalidate relevant queries rather than duplicating state in Zustand.

```typescript
// frontend/src/hooks/useFeedWebSocket.ts
import { useQueryClient } from '@tanstack/react-query';
import { useWebSocket } from './useWebSocket';
import { getWsUrl } from '../api/client';

export function useFeedWebSocket() {
  const queryClient = useQueryClient();

  useWebSocket(getWsUrl('/ws/feed'), {
    onMessage: (event) => {
      const data = JSON.parse(event.data);
      switch (data.type) {
        case 'feed_update':
          // Invalidate feed queries to refetch
          queryClient.invalidateQueries({ queryKey: ['feed'] });
          break;
        case 'task_update':
          queryClient.invalidateQueries({ queryKey: ['tasks'] });
          break;
        case 'feed_item_new':
          // For new items, can optimistically add to cache
          queryClient.setQueryData(['feed'], (old: FeedItem[] | undefined) => {
            if (!old) return [data.item];
            return [data.item, ...old];
          });
          break;
      }
    }
  });
}
```

### Pattern 5: Service Layer Pattern (Consistent with Phase 1)

**What:** Business logic in `services/`, API routes in `api/`, schemas in `schemas/`.

**Why:** Phase 1 established this pattern. Auth logic lives in `services/auth.py`, SSH logic in `ssh/manager.py`. Phase 2 continues this: git logic in `services/git_service.py`, feed logic in `services/feed_service.py`, etc.

### Anti-Patterns to Avoid
- **GitPython for remote repos:** GitPython's `Repo()` requires a local path. Do NOT try to use it for SSH-accessible repos. Use shell commands via `run_command_on_machine()`.
- **Separate state for each repo's git data:** Use a single `repoStore` with a map keyed by `{machine_id}:{repo_path}`. Don't create per-repo stores.
- **Polling from the frontend:** All polling (git status, feed sources) should happen on the backend. Frontend receives updates via WebSocket or TanStack Query refetching.
- **Blocking git operations in WebSocket handlers:** Git fetch/pull/push can take seconds. Run them as background tasks with status updates, not in the request handler.
- **Storing full diffs in the database:** Diffs are generated on-demand from `git diff`. Only store feed items, tasks, and repo status snapshots.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Command palette UI | Custom search overlay | cmdk (^1.1.1) | Keyboard navigation, accessibility, filtering, grouping -- all built in |
| Diff rendering | Custom diff parser + highlighter | @git-diff-view/react (^0.1.3) | Syntax highlighting, virtual scrolling, split/unified views, git diff format parsing |
| Drag and drop | Custom mouse event handlers | @dnd-kit/core + @dnd-kit/sortable | Accessibility, touch support, collision detection, animations |
| Fuzzy search | Custom string matching | cmdk's built-in filter OR fuse.js if needed | Edge cases in fuzzy matching are subtle (Unicode, CJK, partial matches) |
| Git status parsing | Custom regex per-command | `git status --porcelain=v2 --branch` format | Stable machine-parseable format guaranteed across git versions |
| HMAC webhook verification | Custom crypto | Python `hmac` stdlib + `hmac.compare_digest()` | Constant-time comparison prevents timing attacks |
| Periodic polling | Custom asyncio loops | APScheduler AsyncIOScheduler | Handles scheduling, missed jobs, error recovery |
| Relative timestamps | Custom date formatting | Small library (date-fns or dayjs) or `Intl.RelativeTimeFormat` | Edge cases in "2 hours ago" vs "yesterday" |

**Key insight:** Phase 2 has a very large surface area (git ops + feed + tasks + command palette). Using established libraries for UI primitives (cmdk, @dnd-kit, @git-diff-view) prevents scope explosion. The custom work should focus on the data layer (git service, feed service, task lifecycle) and the integration points.

## Common Pitfalls

### Pitfall 1: GitPython Assumption for Remote Repos
**What goes wrong:** Attempting to use `GitPython.Repo(path)` for repos on remote SSH machines.
**Why it happens:** GitPython is in the tech stack spec, and it's natural to reach for it.
**How to avoid:** GitPython is useful ONLY if the backend process has direct filesystem access to the repo (local machine in native mode). For all remote machines AND local machine in Docker mode, use `git` CLI commands via `run_command_on_machine()`. Build a `git_service.py` that abstracts this uniformly.
**Warning signs:** Import of `git.Repo` anywhere in the repo operations code path.

### Pitfall 2: Shell Injection in Git Commands
**What goes wrong:** User-controlled values (branch names, file paths) injected into shell commands.
**Why it happens:** Branch names can contain special characters. File paths can have spaces.
**How to avoid:** Always single-quote user-provided values in shell commands. Validate branch names against `^[a-zA-Z0-9/_.-]+$`. For file paths, use single quotes and reject paths containing single quotes. Consider using `git -C '{path}' --no-optional-locks` to prevent lock contention.
**Warning signs:** f-string interpolation without quoting in `run_command_on_machine()` calls.

### Pitfall 3: N+1 Repo Polling
**What goes wrong:** Polling status for N repos sequentially causes timeout when N is large.
**Why it happens:** Each `git status` call goes over SSH and takes ~200ms. 20 repos x 200ms = 4 seconds.
**How to avoid:** Use `asyncio.gather()` to poll repos in parallel, grouped by machine. For a single machine, batch multiple git commands into a single SSH command: `cd /repo1 && git status --porcelain=v2 --branch; echo "---SEPARATOR---"; cd /repo2 && git status --porcelain=v2 --branch`.
**Warning signs:** Sequential await loops over repos.

### Pitfall 4: WebSocket Message Flooding
**What goes wrong:** Every repo status update broadcasts to every connected WebSocket client, even if the data hasn't changed.
**Why it happens:** Naive implementation sends all data on every poll tick.
**How to avoid:** Compare previous state with current state. Only send deltas. The existing `ws/status.py` already does this pattern for Claude sessions -- replicate it.
**Warning signs:** Frontend receiving identical WebSocket messages repeatedly.

### Pitfall 5: Feed Item Deduplication Race Conditions
**What goes wrong:** Concurrent webhook deliveries for the same event create duplicate feed items.
**Why it happens:** Two requests check "does this external_id exist?" simultaneously, both get "no", both insert.
**How to avoid:** Use a database unique constraint on `(source_type, external_id)` and handle `IntegrityError` with an update-on-conflict pattern (PostgreSQL `ON CONFLICT DO UPDATE`).
**Warning signs:** Duplicate feed items appearing after webhook retries.

### Pitfall 6: Blocking LLM Calls in Request Handlers
**What goes wrong:** Deep Promote modal freezes the UI because the LLM call takes 3-10 seconds.
**Why it happens:** Synchronous API call blocks the response.
**How to avoid:** Use streaming for the LLM response. Return a task_id immediately and stream analysis via WebSocket or SSE. Alternatively, for the Deep Promote modal, use the Anthropic SDK's async client directly since the user is already waiting for the modal to load.
**Warning signs:** API endpoint with >5s response time.

### Pitfall 7: Stale Repo State After Git Operations
**What goes wrong:** User does `git pull`, but the sidebar still shows old branch/dirty state.
**Why it happens:** Repo status polling runs on a 30-second interval.
**How to avoid:** After any git operation (fetch/pull/push/checkout/branch), immediately re-poll and push the updated status via WebSocket. Don't wait for the next poll cycle.
**Warning signs:** User has to wait up to 30 seconds to see the result of their action.

### Pitfall 8: Database Schema Drift from create_all
**What goes wrong:** Adding new models with `Base.metadata.create_all` works for fresh DBs but doesn't migrate existing DBs.
**Why it happens:** Phase 1 uses `create_all` in lifespan, which only creates tables that don't exist. It cannot add columns to existing tables.
**How to avoid:** Phase 2 adds several new tables (feed_items, tasks, integration_sources). `create_all` will create them fine. But if any existing tables need column changes, use Alembic migrations. For Phase 2, new tables only -- `create_all` is sufficient. But start using Alembic for any schema changes after initial creation.
**Warning signs:** Missing columns in production after an update.

## Code Examples

### Git Log Format for Commit Timeline
```python
# Using NUL separators for reliable parsing (handles commit messages with any characters)
GIT_LOG_FORMAT = "%H%x00%h%x00%s%x00%an%x00%aI%x00%D"

async def get_commit_log(machine_id: str, repo_path: str, limit: int = 50, skip: int = 0) -> list[dict]:
    raw = await run_command_on_machine(
        machine_id,
        f"git -C '{repo_path}' log --format='{GIT_LOG_FORMAT}' -n {limit} --skip={skip}"
    )
    commits = []
    for line in raw.strip().split('\n'):
        if not line:
            continue
        parts = line.split('\x00')
        if len(parts) >= 5:
            commits.append({
                "hash": parts[0],
                "short_hash": parts[1],
                "subject": parts[2],
                "author": parts[3],
                "date": parts[4],
                "refs": parts[5] if len(parts) > 5 else "",
            })
    return commits
```

### Commit Diff for Timeline File View
```python
async def get_commit_diff(machine_id: str, repo_path: str, commit_hash: str) -> str:
    """Get the full diff for a specific commit."""
    return await run_command_on_machine(
        machine_id,
        f"git -C '{repo_path}' diff {commit_hash}~1..{commit_hash} 2>/dev/null || "
        f"git -C '{repo_path}' show {commit_hash} --format='' 2>/dev/null"
    )

async def get_commit_files(machine_id: str, repo_path: str, commit_hash: str) -> list[dict]:
    """Get files changed in a commit with status."""
    raw = await run_command_on_machine(
        machine_id,
        f"git -C '{repo_path}' diff-tree --no-commit-id -r --name-status {commit_hash}"
    )
    files = []
    for line in raw.strip().split('\n'):
        if not line:
            continue
        parts = line.split('\t')
        if len(parts) >= 2:
            files.append({"status": parts[0], "path": parts[1]})
    return files
```

### Feed Ingest API with HMAC Verification
```python
# backend/app/api/feed.py

from fastapi import APIRouter, Request, HTTPException, Header
import hashlib
import hmac

router = APIRouter(prefix="/api/feed", tags=["feed"])

@router.post("/ingest")
async def ingest_feed_item(
    request: Request,
    x_webhook_signature: str | None = Header(None),
    x_source_type: str = Header(...),
    db: AsyncSession = Depends(get_db),
):
    """Universal ingest endpoint (INTG-01).

    Any service can POST here with:
    - X-Source-Type header identifying the source
    - X-Webhook-Signature header for HMAC verification
    - JSON body with the feed item payload
    """
    payload = await request.body()

    # Verify HMAC if source has a configured secret
    source = await get_source_by_type(db, x_source_type)
    if source and source.webhook_secret:
        if not x_webhook_signature:
            raise HTTPException(401, "Missing webhook signature")
        expected = hmac.new(
            source.webhook_secret.encode(), payload, hashlib.sha256
        ).hexdigest()
        if not hmac.compare_digest(expected, x_webhook_signature):
            raise HTTPException(401, "Invalid webhook signature")

    data = await request.json()
    feed_item = await feed_service.upsert_feed_item(db, x_source_type, data)
    # Push to WebSocket subscribers
    await broadcast_feed_update(feed_item)
    return {"status": "ok", "id": str(feed_item.id)}
```

### cmdk Command Palette Structure
```typescript
// frontend/src/components/palette/CommandPalette.tsx
import { Command } from 'cmdk';

export function CommandPalette({ open, onOpenChange }: Props) {
  return (
    <Command.Dialog open={open} onOpenChange={onOpenChange} label="Command palette">
      <Command.Input placeholder="Search repos, tasks, actions..." />
      <Command.List>
        <Command.Empty>No results found.</Command.Empty>

        <Command.Group heading="Repos">
          {repos.map(repo => (
            <Command.Item key={repo.path} value={`${repo.machine} ${repo.path}`}
              onSelect={() => selectRepo(repo)}>
              {repo.name} <span className="text-muted">{repo.branch}</span>
            </Command.Item>
          ))}
        </Command.Group>

        <Command.Group heading="Tasks">
          {tasks.map(task => (
            <Command.Item key={task.id} value={task.title}
              onSelect={() => focusTask(task)}>
              {task.title}
            </Command.Item>
          ))}
        </Command.Group>

        <Command.Group heading="Actions">
          <Command.Item onSelect={promoteToTask}>Promote to task</Command.Item>
          <Command.Item onSelect={startTask}>Start task</Command.Item>
          <Command.Item onSelect={completeTask}>Complete task</Command.Item>
        </Command.Group>
      </Command.List>
    </Command.Dialog>
  );
}
```

### Repo Polling with Batched SSH Commands
```python
# backend/app/services/git_service.py

SEPARATOR = "---LOCUS_REPO_SEP---"

async def poll_all_repos_for_machine(machine_id: str, repo_paths: list[str]) -> dict[str, RepoStatus]:
    """Poll all repos on a machine in a single SSH command."""
    if not repo_paths:
        return {}

    # Build batched command
    commands = []
    for path in repo_paths:
        commands.append(
            f"echo '{SEPARATOR}{path}' && "
            f"git -C '{path}' status --porcelain=v2 --branch 2>&1"
        )
    batched = " ; ".join(commands)

    raw = await run_command_on_machine(machine_id, batched)

    # Parse batched output
    results = {}
    sections = raw.split(SEPARATOR)
    for section in sections:
        if not section.strip():
            continue
        lines = section.strip().split('\n')
        repo_path = lines[0].strip()
        status_output = '\n'.join(lines[1:])
        try:
            results[repo_path] = parse_porcelain_v2(status_output)
        except Exception:
            results[repo_path] = RepoStatus(branch="?", is_dirty=False, changed_count=0, ahead=0, behind=0)
    return results
```

### APScheduler for Polling Adapters
```python
# backend/app/services/polling/scheduler.py
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.interval import IntervalTrigger

scheduler = AsyncIOScheduler()

def setup_polling_scheduler():
    """Configure polling jobs for active integration sources."""
    # These intervals are Claude's discretion per CONTEXT.md
    scheduler.add_job(
        poll_github, IntervalTrigger(minutes=2), id="github_poll", replace_existing=True
    )
    scheduler.add_job(
        poll_gitlab, IntervalTrigger(minutes=2), id="gitlab_poll", replace_existing=True
    )
    scheduler.add_job(
        poll_jira, IntervalTrigger(minutes=5), id="jira_poll", replace_existing=True
    )
    scheduler.add_job(
        poll_calendar, IntervalTrigger(minutes=10), id="calendar_poll", replace_existing=True
    )
    scheduler.start()
```

### Diff Viewer (Basic Phase 2 Scope)
```typescript
// frontend/src/components/diff/DiffViewer.tsx
import { DiffView, DiffModeEnum } from "@git-diff-view/react";
import "@git-diff-view/react/styles/diff-view.css";

interface DiffViewerProps {
  diffText: string;    // raw unified diff from git diff
  fileName: string;
}

export function DiffViewer({ diffText, fileName }: DiffViewerProps) {
  // For Phase 2: basic diff display. Phase 3 adds full review annotations.
  return (
    <DiffView
      diffFile={{
        oldFile: { fileName, content: "" },
        newFile: { fileName, content: "" },
        hunks: diffText,  // @git-diff-view/react can parse unified diff
      }}
      diffViewMode={DiffModeEnum.Unified}
      diffViewTheme="dark"
      diffViewHighlight={true}
    />
  );
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| GitPython for all git ops | git CLI via SSH for remote | Always (remote limitation) | Must use shell commands, not library |
| react-beautiful-dnd | @dnd-kit or hello-pangea/dnd | 2022 (deprecated) | Don't use react-beautiful-dnd |
| APScheduler 3.x (stable) | APScheduler 4.x (alpha) | 2024 (alpha) | Use 3.11, NOT 4.0 (still alpha, unstable API) |
| cmdk 0.x | cmdk 1.1.1 | 2024 | Breaking changes in value prop (now case-sensitive), Command.List mandatory |
| Socket.IO for real-time | Native WebSocket | Existing decision | Consistent with Phase 1 pattern |
| react-diff-viewer | @git-diff-view/react | 2024 | Better git diff format parsing, actively maintained |

**Deprecated/outdated:**
- APScheduler 4.0: Still alpha (4.0.0a1). Do NOT use. Stick with 3.11.
- react-beautiful-dnd: Deprecated by Atlassian in 2022. Use @dnd-kit instead.
- cmdk 0.x: Breaking changes in 1.0; use ^1.1.1.

## Discretion Recommendations

These are areas where CONTEXT.md gave Claude discretion. Here are my recommendations:

### Polling Adapter Refresh Intervals
- **GitHub/GitLab:** Every 2 minutes (API rate limits: GitHub 5000/hr, GitLab varies)
- **Jira:** Every 5 minutes (lower urgency, higher API cost)
- **Google Calendar:** Every 10 minutes (events don't change rapidly)
- **Repo status:** Every 30 seconds (locked decision from CONTEXT.md)

### Commit Timeline Pagination
- Load 50 commits initially. Lazy load 50 more on scroll-to-bottom.
- Use `git log --skip=N -n 50` for offset-based pagination.
- No virtual scrolling needed for 50-item pages in the narrow left panel.

### Diff Viewer for Phase 2
- Use @git-diff-view/react with unified mode only (split mode in Phase 3).
- Dark theme matching the app.
- No inline comments or review annotations (Phase 3 scope).
- Render in center panel when user clicks a changed file or commit file.

### Done Card Fade Timing
- Default: 48 hours (more practical than 24h for weekend work).
- Store in settings table, exposed via settings API.
- Fade = reduce opacity to 40% + move to bottom of Done section.

### LLM Analysis Prompt Design (Deep Promote)
- System prompt: "You are a task analyst for a software engineering control plane. Given a work item from {source_type}, analyze it and provide: 1) A concise task title, 2) A brief context paragraph, 3) Suggested urgency tier with reasoning."
- Include feed item metadata (source, URL, timestamp, related data) in the user message.
- Use Claude claude-sonnet-4-20250514 for speed (Deep Promote should feel responsive).
- Stream the response to the modal for progressive display.

## Open Questions

1. **Repo discovery caching:** The existing `/api/machines/{id}/repos` endpoint scans for repos on every call. Phase 2 needs a cached repo registry (which repos exist per machine) that gets updated periodically. Should this be a database table or an in-memory cache?
   - **Recommendation:** Database table (`repos` or add to `machines.repo_cache`). Needed because feed items reference repos, and the frontend needs a stable list.

2. **GSD-05 and GSD-06 (GSD phase display and one-click actions):** These requirements ask for GSD phase info per repo and action buttons. This requires parsing `.planning/` files on each repo.
   - **What we know:** GSD files are in `.planning/STATE.md`, `.planning/ROADMAP.md`, etc. Can be read via `run_command_on_machine()`.
   - **What's unclear:** Exact parsing format, what to display in the sidebar.
   - **Recommendation:** Implement as a separate sub-feature. Read `.planning/STATE.md` for current phase, parse current status. Show as a small badge on the repo row.

3. **Feed item AI classification at ingest time:** The decision says "AI-assisted classification" for urgency tiers. Should this happen synchronously during ingest (adding latency) or asynchronously after ingest?
   - **Recommendation:** Asynchronously. Ingest the item with a default tier, then classify in background. Update via WebSocket when classification completes. This keeps ingest fast and non-blocking.

4. **TanStack Query vs Zustand boundary:** Phase 1 uses raw Zustand stores + manual `apiGet` calls. Phase 2 should use TanStack Query for server state (feed items, tasks, repo status). How to handle the migration?
   - **Recommendation:** New Phase 2 features (feed, tasks, repo status) use TanStack Query. Existing Phase 1 features (machines, sessions) stay on Zustand + manual fetch until refactored. Add a `QueryClientProvider` wrapping the app.

## Sources

### Primary (HIGH confidence)
- Existing codebase: `machine_registry.py`, `local/manager.py`, `ssh/manager.py` -- verified `run_command_on_machine()` pattern
- Existing codebase: `ws/status.py` -- verified polling + WebSocket delta pattern
- Existing codebase: `stores/machineStore.ts`, `stores/panelStore.ts` -- verified Zustand store-per-domain pattern
- [Git status porcelain v2 documentation](https://git-scm.com/docs/git-status) -- format specification
- [Git log pretty-formats documentation](https://git-scm.com/docs/pretty-formats) -- format placeholders
- [cmdk GitHub](https://github.com/pacocoursey/cmdk) -- v1.1.1 stable, API documentation
- [APScheduler PyPI](https://pypi.org/project/APScheduler/) -- v3.11 stable, v4.0 alpha only
- [Anthropic Python SDK](https://github.com/anthropics/anthropic-sdk-python) -- v0.79.0, async client

### Secondary (MEDIUM confidence)
- [@git-diff-view/react npm](https://www.npmjs.com/package/@git-diff-view/react) -- v0.1.3, API from npm page
- [@git-diff-view/react GitHub](https://github.com/MrWangJustToDo/git-diff-view) -- usage examples
- [@dnd-kit GitHub](https://github.com/clauderic/dnd-kit) -- v6.3.1 core, v10.0.0 sortable
- [TanStack Query WebSocket patterns](https://tkdodo.eu/blog/using-web-sockets-with-react-query) -- cache invalidation via WebSocket
- [FastAPI webhook HMAC patterns](https://oneuptime.com/blog/post/2026-01-25-webhook-handlers-python/view) -- HMAC verification

### Tertiary (LOW confidence)
- @git-diff-view/react API for parsing raw unified diff strings -- needs hands-on verification during implementation. The `hunks` prop format may need adaptation.
- APScheduler AsyncIOScheduler integration with FastAPI lifespan -- conceptually sound but needs testing for proper startup/shutdown lifecycle.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all libraries verified, versions confirmed
- Architecture (git service): HIGH -- built on existing `run_command_on_machine()` pattern in codebase
- Architecture (feed/task models): HIGH -- standard SQLAlchemy patterns, well-documented
- Architecture (WebSocket integration): HIGH -- extends existing `ws/status.py` pattern
- Pitfalls: HIGH -- derived from codebase analysis and known Git CLI + SSH patterns
- @git-diff-view/react API details: MEDIUM -- npm docs verified, exact prop format needs implementation testing
- Polling adapter specifics: MEDIUM -- APScheduler 3.x well-documented, but adapter-specific API integrations (GitHub/GitLab/Jira) depend on Phase 4 credential setup

**Research date:** 2026-03-26
**Valid until:** 2026-04-26 (30 days -- stable domain, libraries unlikely to change)
