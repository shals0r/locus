# Phase 2: Repository Management & Work Feed - Research

**Researched:** 2026-03-26
**Domain:** Git operations, work feed/webhook architecture, command palette, diff viewing, task state management
**Confidence:** HIGH (most patterns verified against existing codebase + official docs)

## Summary

Phase 2 transforms Locus from a terminal/machine manager into a full engineering control plane by adding three major surfaces: (1) a git sidebar showing repo state with operations, (2) a unified work feed with ingest API and urgency tiers, and (3) a task board with promote/start/complete flows. The command palette ties everything together.

The critical architectural discovery is that **GitPython cannot be used for remote repos** -- it requires local filesystem access. All git operations on remote machines must run as shell commands via the existing `run_command_on_machine()` infrastructure (AsyncSSH). GitPython is only usable for the local machine in native mode. The recommended approach is a **git service layer that wraps raw `git` CLI commands**, parsing their output, and routing through the machine registry -- exactly how repo scanning and tmux operations already work in Phase 1.

The feed/board system requires 5+ new database models (feed items, tasks, integration sources, webhook config), a WebSocket channel for real-time feed updates, APScheduler for polling adapters, and an HMAC-verified webhook endpoint. The frontend needs 4-5 new Zustand stores, heavy use of TanStack Query for server state, and the cmdk command palette wired to search across all entities.

**Primary recommendation:** Build git operations as a service layer wrapping `git` CLI commands over SSH/subprocess (not GitPython for remotes), use the existing machine_registry routing pattern, and add a `/ws/feed` WebSocket for real-time feed updates following the existing `/ws/status` pattern.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Repos grouped by machine, collapsible; left panel splits top=machines/repos (260px), bottom=VS Code-style commit timeline
- Each repo row: branch name, clean/dirty dot (green/orange) + changed file count, ahead/behind counts, last activity
- Clicking repo: opens commit timeline + opens terminal tab cd'd into repo
- Commit timeline: vertical timeline with commit messages and relative timestamps
- Changed files section with status indicators (M/A/D); clicking file opens diff in center panel
- Git operations: Fetch/Pull/Push per repo (no bulk), branch checkout via dropdown, inline feedback (spinner, success/error)
- Repo state polling every 30 seconds
- Right panel (340px) has Feed and Board tabs
- Feed: 5 urgency tiers (Now/Respond/Review/Prep/Follow up), collapsible tier sections with sticky headers
- Feed card: source icon + title, timestamp, unread dot, 1-line snippet; hover actions: Quick Promote, Deep Promote, Snooze, Dismiss
- Snooze presets: 1h, 4h, Tomorrow 9am, Next Monday 9am
- AI-assisted tier classification
- Quick Promote: one-click, auto-generates context; Deep Promote: LLM triage modal
- Task Board: 3 columns Queue/Active/Done (vertical stacked), tier color preserved as left-border accent
- Start flow: inline picker machine -> repo -> optional new branch, moves to Active, opens Working Session
- Working Session context strip: pinned above editor/diff tabs, collapsible, with "Copy context" button
- Dual ingest: webhook endpoint + polling adapters; Phase 2 adapters: GitHub/GitLab, Jira, Google Calendar
- Dedup via source_type + external_id; Webhook auth: shared secret / HMAC
- Command palette: Ctrl+K and Ctrl+P, searchable repos/branches/machines/feed items/tasks/actions, grouped results

### Claude's Discretion
- Polling adapter refresh intervals
- VS Code shortcut mappings beyond core set
- Commit timeline pagination/lazy loading
- Diff viewer implementation (basic for Phase 2)
- Done card fade timing default
- LLM analysis prompt design for Deep Promote

### Deferred Ideas (OUT OF SCOPE)
- Code editing in browser (Phase 3)
</user_constraints>

## Standard Stack

The tech stack is already decided in CLAUDE.md. This section documents version-specific details and how each library applies to Phase 2.

### Core (Phase 2 specific usage)

| Library | Version | Phase 2 Purpose | Notes |
|---------|---------|-----------------|-------|
| FastAPI | ~0.135 | New API routes for git ops, feed CRUD, task CRUD, webhook ingest, command palette search | Existing pattern: `APIRouter(prefix="/api/...")` |
| SQLAlchemy 2.0 | ~2.0.48 | New models: FeedItem, Task, IntegrationSource | Async with `mapped_column`, existing `Base` |
| Alembic | ~1.18 | Migrations for new tables | Currently using `create_all` in lifespan; should add proper migrations |
| APScheduler | ~3.11 | Polling adapters for GitHub/GitLab/Jira/Calendar | AsyncIOScheduler in FastAPI lifespan |
| httpx | ~0.28 | Outbound API calls to GitHub/GitLab/Jira/Calendar REST APIs | AsyncClient with OAuth/API tokens |
| cmdk | ~1.0 | Command palette (Ctrl+K/P) | Unstyled, headless -- style with Tailwind |
| @git-diff-view/react | ~0.1.3 | Basic diff rendering when clicking files in commit timeline | Split + unified views, dark theme |
| TanStack Query | ~5.95 | All server state: repos, feed items, tasks, git status | WebSocket-triggered invalidation |
| Zustand | ~5.0 | New stores: repoStore, feedStore, taskStore, commandPaletteStore | One store per domain pattern |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| react-resizable-panels | ~2.x | Existing panel layout -- add right panel, split left panel top/bottom | Already in AppShell |
| lucide-react | (installed) | Icons for feed sources, git status, tier indicators | Already in use |

### NOT Using (Important)

| Library | Why Not |
|---------|---------|
| GitPython (for remote repos) | Requires local filesystem access -- cannot work over SSH. Use `git` CLI commands via `run_command_on_machine()` |
| GitPython (for local repos) | Could work in native mode, but for consistency, use the same git CLI wrapper for all machines |
| python-gitlab / PyGithub | Adds heavyweight dependencies when httpx + REST API is sufficient for polling |
| google-api-python-client | Heavy dependency; httpx with OAuth2 tokens is lighter for calendar event listing |

## Architecture Patterns

### Recommended Project Structure (New Files)

```
backend/app/
  models/
    feed_item.py          # FeedItem model
    task.py               # Task model
    integration_source.py # IntegrationSource model
  schemas/
    feed.py               # Feed/ingest request/response schemas
    task.py               # Task schemas
    git.py                # Git status/operations schemas
    command_palette.py     # Search result schemas
  api/
    git.py                # Git operations REST endpoints
    feed.py               # Feed CRUD + ingest webhook endpoint
    tasks.py              # Task CRUD + state transitions
    search.py             # Command palette search endpoint
  services/
    git_service.py        # Git CLI wrapper (routes through machine_registry)
    feed_service.py       # Feed business logic, dedup, tier classification
    task_service.py       # Task state machine (Queue/Active/Done)
  integrations/
    scheduler.py          # APScheduler setup (AsyncIOScheduler)
    base_adapter.py       # Abstract polling adapter
    github_adapter.py     # GitHub PRs, reviews, CI status
    gitlab_adapter.py     # GitLab MRs, reviews, CI
    jira_adapter.py       # Jira assigned/mentioned tickets
    calendar_adapter.py   # Google Calendar upcoming events
  ws/
    feed.py               # WebSocket for real-time feed updates

frontend/src/
  stores/
    repoStore.ts          # Git repo state per machine
    feedStore.ts          # Feed items, tiers, read state
    taskStore.ts          # Tasks, board state
    commandPaletteStore.ts # Palette open/search state
  components/
    git/
      RepoList.tsx        # Top-left: machine/repo tree
      RepoRow.tsx         # Single repo with status indicators
      CommitTimeline.tsx  # Bottom-left: commit history
      ChangedFiles.tsx    # Changed files list (M/A/D)
      BranchDropdown.tsx  # Branch checkout/create
      GitOperations.tsx   # Fetch/Pull/Push buttons
    feed/
      FeedPanel.tsx       # Feed tab content
      FeedTierSection.tsx # Collapsible tier with sticky header
      FeedCard.tsx        # Individual feed item card
      SnoozeMenu.tsx      # Snooze preset picker
    board/
      BoardPanel.tsx      # Board tab content
      TaskColumn.tsx      # Queue/Active/Done column
      TaskCard.tsx        # Task card with hover actions
      StartFlowPicker.tsx # Machine -> repo -> branch picker
    session/
      ContextStrip.tsx    # Pinned context strip above center panel
    palette/
      CommandPalette.tsx  # cmdk-based palette
    diff/
      DiffViewer.tsx      # @git-diff-view/react wrapper
  hooks/
    useFeedWebSocket.ts   # WebSocket connection for /ws/feed
    useGitStatus.ts       # Polling + invalidation for repo status
```

### Pattern 1: Git Service Layer (CLI over SSH)

**What:** All git operations go through a service that runs `git` CLI commands via the machine registry, NOT GitPython.
**When to use:** Every git operation (status, log, diff, fetch, pull, push, checkout, branch create).
**Why:** GitPython requires local filesystem access to the `.git` directory. Remote repos are only accessible via SSH commands. For consistency, use the same approach for local and remote.

```python
# backend/app/services/git_service.py
from app.services.machine_registry import run_command_on_machine

async def get_repo_status(machine_id: str, repo_path: str) -> dict:
    """Get git status for a repo on any machine."""
    # Branch name
    branch = (await run_command_on_machine(
        machine_id, f"git -C '{repo_path}' rev-parse --abbrev-ref HEAD"
    )).strip()

    # Dirty state: count of changed files
    status_output = await run_command_on_machine(
        machine_id, f"git -C '{repo_path}' status --porcelain"
    )
    changed_files = [l for l in status_output.strip().split('\n') if l.strip()]

    # Ahead/behind tracking remote
    try:
        counts = (await run_command_on_machine(
            machine_id,
            f"git -C '{repo_path}' rev-list --left-right --count HEAD...@{{upstream}}"
        )).strip().split('\t')
        ahead, behind = int(counts[0]), int(counts[1])
    except Exception:
        ahead, behind = 0, 0

    return {
        "branch": branch,
        "is_dirty": len(changed_files) > 0,
        "changed_count": len(changed_files),
        "ahead": ahead,
        "behind": behind,
    }

async def get_commit_log(machine_id: str, repo_path: str, limit: int = 50) -> list[dict]:
    """Get commit history with structured output."""
    # NUL-separated format for safe parsing (handles commit messages with special chars)
    log_output = await run_command_on_machine(
        machine_id,
        f"git -C '{repo_path}' log --format='%H%x00%s%x00%an%x00%aI' -n {limit}"
    )
    commits = []
    for line in log_output.strip().split('\n'):
        if not line:
            continue
        parts = line.split('\x00')
        if len(parts) >= 4:
            commits.append({
                "sha": parts[0],
                "message": parts[1],
                "author": parts[2],
                "date": parts[3],
            })
    return commits

async def get_changed_files(machine_id: str, repo_path: str) -> list[dict]:
    """Get list of changed files with status indicators (M/A/D/?)."""
    output = await run_command_on_machine(
        machine_id, f"git -C '{repo_path}' status --porcelain"
    )
    files = []
    for line in output.strip().split('\n'):
        if not line.strip():
            continue
        status = line[:2].strip()
        filepath = line[3:]
        files.append({"status": status, "path": filepath})
    return files

async def get_diff_for_file(machine_id: str, repo_path: str, file_path: str) -> str:
    """Get unified diff output for a specific file (working tree vs HEAD)."""
    return await run_command_on_machine(
        machine_id, f"git -C '{repo_path}' diff -- '{file_path}'"
    )

async def get_commit_diff(machine_id: str, repo_path: str, commit_sha: str) -> str:
    """Get diff for a specific commit."""
    return await run_command_on_machine(
        machine_id, f"git -C '{repo_path}' show --format='' '{commit_sha}'"
    )

async def get_file_content_at_ref(machine_id: str, repo_path: str, ref: str, file_path: str) -> str:
    """Get file content at a specific ref (for diff viewer old/new content)."""
    return await run_command_on_machine(
        machine_id, f"git -C '{repo_path}' show '{ref}:{file_path}'"
    )

async def git_fetch(machine_id: str, repo_path: str) -> str:
    return await run_command_on_machine(
        machine_id, f"git -C '{repo_path}' fetch --prune 2>&1"
    )

async def git_pull(machine_id: str, repo_path: str) -> str:
    return await run_command_on_machine(
        machine_id, f"git -C '{repo_path}' pull 2>&1"
    )

async def git_push(machine_id: str, repo_path: str) -> str:
    return await run_command_on_machine(
        machine_id, f"git -C '{repo_path}' push 2>&1"
    )

async def list_branches(machine_id: str, repo_path: str) -> list[dict]:
    output = await run_command_on_machine(
        machine_id,
        f"git -C '{repo_path}' branch --format='%(refname:short)%x00%(HEAD)'"
    )
    branches = []
    for line in output.strip().split('\n'):
        if not line:
            continue
        parts = line.split('\x00')
        branches.append({
            "name": parts[0],
            "is_current": parts[1].strip() == '*' if len(parts) > 1 else False,
        })
    return branches

async def checkout_branch(machine_id: str, repo_path: str, branch: str) -> str:
    return await run_command_on_machine(
        machine_id, f"git -C '{repo_path}' checkout '{branch}' 2>&1"
    )

async def create_branch(machine_id: str, repo_path: str, branch: str) -> str:
    return await run_command_on_machine(
        machine_id, f"git -C '{repo_path}' checkout -b '{branch}' 2>&1"
    )
```

**Confidence: HIGH** -- This follows the exact same pattern as the existing `scan_repos` and tmux operations in `api/machines.py`, which already run shell commands via `run_command_on_machine()` or SSH connections.

### Pattern 2: Feed WebSocket (Real-time Updates)

**What:** A `/ws/feed` WebSocket endpoint that pushes new/updated feed items to connected clients.
**When to use:** When feed items arrive via webhook or polling adapter.
**Why:** The user must see new feed items immediately without refreshing.

```python
# Follow the existing /ws/status pattern:
# 1. Auth via ?token= query param
# 2. Send initial snapshot on connect (recent feed items)
# 3. Push updates via asyncio.Queue (same as status_queue pattern)
# 4. Polling adapters and webhook handler push to the broadcast list

# Use a broadcast pattern (list of connected client queues)
feed_clients: list[asyncio.Queue] = []

async def broadcast_feed_update(update: dict):
    """Called by webhook handler or polling adapter when new items arrive."""
    for queue in feed_clients:
        try:
            queue.put_nowait(update)
        except asyncio.QueueFull:
            pass
```

**Confidence: HIGH** -- Follows the existing `/ws/status` pattern exactly.

### Pattern 3: TanStack Query + WebSocket Invalidation

**What:** Use TanStack Query for all server state fetching, with WebSocket messages triggering cache invalidation.
**When to use:** Feed items, git repo status, task state.

Two strategies available:
1. **Invalidation** (for feed items): WebSocket says "new item arrived", TanStack Query refetches from API. Minimizes WebSocket data, ensures fresh state.
2. **Direct cache update** (for git status polling): WebSocket sends actual data, use `queryClient.setQueryData()` to update cache directly. Reduces server round-trips for frequent updates.

```typescript
// Pattern: WebSocket message triggers queryClient.invalidateQueries
import { useQueryClient } from '@tanstack/react-query';

export function useFeedWebSocket() {
  const queryClient = useQueryClient();

  useEffect(() => {
    const ws = new WebSocket(getWsUrl('/ws/feed'));

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === 'new_item' || data.type === 'item_updated') {
        queryClient.invalidateQueries({ queryKey: ['feed'] });
      }
    };

    return () => ws.close();
  }, [queryClient]);
}
```

**Confidence: HIGH** -- Well-documented TanStack Query pattern from official docs and TkDodo's blog.

### Pattern 4: Database Models for Feed & Tasks

**What:** Core data models for the feed/board system.

```python
# models/feed_item.py
class FeedItem(Base):
    __tablename__ = "feed_items"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    source_type: Mapped[str] = mapped_column(String(50))       # "github", "gitlab", "jira", "calendar", "webhook"
    external_id: Mapped[str] = mapped_column(String(500))       # Unique ID from source system
    title: Mapped[str] = mapped_column(String(500))
    snippet: Mapped[str | None] = mapped_column(Text, nullable=True)
    url: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    tier: Mapped[str] = mapped_column(String(20), default="follow_up")  # now/respond/review/prep/follow_up
    is_read: Mapped[bool] = mapped_column(default=False)
    is_dismissed: Mapped[bool] = mapped_column(default=False)
    raw_payload: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    source_icon: Mapped[str | None] = mapped_column(String(50), nullable=True)
    snoozed_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # Composite unique constraint for dedup
    __table_args__ = (
        UniqueConstraint('source_type', 'external_id', name='uq_feed_source_external'),
    )

# models/task.py
class Task(Base):
    __tablename__ = "tasks"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    feed_item_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("feed_items.id"), nullable=True)
    title: Mapped[str] = mapped_column(String(500))
    context: Mapped[str | None] = mapped_column(Text, nullable=True)  # LLM-generated or auto-generated
    tier: Mapped[str] = mapped_column(String(20))  # Preserved from feed item
    status: Mapped[str] = mapped_column(String(20), default="queue")  # queue/active/done
    machine_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    repo_path: Mapped[str | None] = mapped_column(String(500), nullable=True)
    branch: Mapped[str | None] = mapped_column(String(255), nullable=True)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

# models/integration_source.py
class IntegrationSource(Base):
    __tablename__ = "integration_sources"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    source_type: Mapped[str] = mapped_column(String(50), unique=True)  # "github", "gitlab", "jira", "calendar"
    config: Mapped[dict] = mapped_column(JSON, default=dict)  # API URL, project IDs, etc.
    credential_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("credentials.id"), nullable=True)
    is_enabled: Mapped[bool] = mapped_column(default=True)
    poll_interval_seconds: Mapped[int] = mapped_column(default=300)  # 5 min default
    last_polled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
```

**Confidence: HIGH** -- Follows existing SQLAlchemy model patterns in the codebase.

### Pattern 5: APScheduler Polling Adapters

**What:** AsyncIOScheduler in the FastAPI lifespan, with per-source interval jobs.

```python
# integrations/scheduler.py
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.interval import IntervalTrigger

scheduler = AsyncIOScheduler()

async def start_polling():
    """Called from FastAPI lifespan to start all enabled polling adapters."""
    async with async_session_factory() as db:
        sources = await db.execute(
            select(IntegrationSource).where(IntegrationSource.is_enabled.is_(True))
        )
        for source in sources.scalars():
            adapter = get_adapter(source.source_type)
            if adapter:
                scheduler.add_job(
                    adapter.execute,
                    trigger=IntervalTrigger(seconds=source.poll_interval_seconds),
                    id=f"poll_{source.source_type}",
                    replace_existing=True,
                    args=[source],
                )
    scheduler.start()

async def stop_polling():
    """Called from FastAPI lifespan shutdown."""
    scheduler.shutdown(wait=False)
```

Integrate into FastAPI lifespan (add to existing `main.py`):
```python
# In lifespan():
from app.integrations.scheduler import start_polling, stop_polling
await start_polling()
yield
await stop_polling()
```

**Confidence: HIGH** -- Standard APScheduler AsyncIOScheduler pattern, well-documented.

### Pattern 6: cmdk Command Palette

**What:** Headless command palette with grouped results, styled with Tailwind.

```tsx
// components/palette/CommandPalette.tsx
import { Command } from 'cmdk';

export function CommandPalette() {
  const [open, setOpen] = useState(false);

  // Ctrl+K and Ctrl+P both open the palette
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'p')) {
        e.preventDefault();
        setOpen(o => !o);
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  return (
    <Command.Dialog open={open} onOpenChange={setOpen} label="Command Palette">
      <Command.Input placeholder="Search repos, machines, tasks..." />
      <Command.List>
        <Command.Empty>No results found.</Command.Empty>

        <Command.Group heading="Repos">
          {repos.map(r => (
            <Command.Item key={r.path} value={`${r.name} ${r.branch}`}
                          keywords={[r.machineName]}
                          onSelect={() => selectRepo(r)}>
              {r.name} ({r.branch})
            </Command.Item>
          ))}
        </Command.Group>

        <Command.Group heading="Machines">
          {machines.map(m => (
            <Command.Item key={m.id} value={m.name} onSelect={() => selectMachine(m)}>
              {m.name}
            </Command.Item>
          ))}
        </Command.Group>

        <Command.Group heading="Feed Items">
          {feedItems.map(f => (
            <Command.Item key={f.id} value={f.title} onSelect={() => selectFeedItem(f)}>
              {f.title}
            </Command.Item>
          ))}
        </Command.Group>

        <Command.Group heading="Tasks">
          {tasks.map(t => (
            <Command.Item key={t.id} value={t.title} onSelect={() => selectTask(t)}>
              {t.title}
            </Command.Item>
          ))}
        </Command.Group>

        <Command.Group heading="Actions">
          <Command.Item value="Toggle Sidebar" onSelect={toggleSidebar}>
            Toggle Sidebar
          </Command.Item>
          <Command.Item value="Toggle Feed" onSelect={toggleFeed}>
            Toggle Feed Panel
          </Command.Item>
        </Command.Group>
      </Command.List>
    </Command.Dialog>
  );
}
```

Key cmdk API details:
- `Command.Dialog` wraps Radix UI Dialog -- handles modal behavior, overlay, focus trapping
- `Command.Group` with `heading` prop creates section headers; hidden (not unmounted) when no matches
- `Command.Item` has `value` (filter string), `keywords` (extra search aliases), `onSelect` (action)
- Built-in filter works well for up to 2000-3000 items without virtualization
- `shouldFilter={false}` for server-side search if needed
- `useCommandState()` hook for accessing current search text

**Confidence: HIGH** -- Verified against official cmdk GitHub docs.

### Pattern 7: @git-diff-view/react Basic Diff Rendering

**What:** Render git diffs when user clicks a file in the commit timeline or changed files list.

```tsx
// components/diff/DiffViewer.tsx
import { DiffView, DiffModeEnum } from "@git-diff-view/react";
import "@git-diff-view/react/styles/diff-view.css";

interface DiffViewerProps {
  oldFileName: string;
  newFileName: string;
  oldContent: string;
  newContent: string;
  language: string;
}

export function DiffViewer({ oldFileName, newFileName, oldContent, newContent, language }: DiffViewerProps) {
  return (
    <DiffView
      data={{
        oldFile: { fileName: oldFileName, content: oldContent, fileLang: language },
        newFile: { fileName: newFileName, content: newContent, fileLang: language },
        hunks: [],
      }}
      diffViewMode={DiffModeEnum.Unified}
      diffViewTheme="dark"
      diffViewHighlight
      diffViewWrap={false}
    />
  );
}
```

For Phase 2 (basic diff), the approach is:
1. Backend: Run `git show HEAD:<file>` for old content, read current file for new content (or `git show <sha>~1:<file>` and `git show <sha>:<file>` for commit diffs)
2. Backend: Return both contents via API
3. Frontend: Pass old/new content to `DiffView` data prop

Alternative approach using `@git-diff-view/file` for pre-processed diffs:
```tsx
import { DiffFile, generateDiffFile } from "@git-diff-view/file";

const file = generateDiffFile(
  oldFileName, oldContent,
  newFileName, newContent,
  language, language
);
file.initTheme('dark');
file.init();
file.buildSplitDiffLines();
// Then: <DiffView diffFile={file} />
```

DiffView key props:
- `diffViewMode`: `DiffModeEnum.Split` (side-by-side) or `DiffModeEnum.Unified` (single column)
- `diffViewTheme`: "dark" or "light"
- `diffViewHighlight`: Enable syntax highlighting
- `diffViewWrap`: Toggle line wrapping
- `diffViewFontSize`: Font size in pixels

**Confidence: MEDIUM** -- Library API verified from npm/GitHub, but the exact data format for hunks parsing needs validation during implementation.

### Anti-Patterns to Avoid

- **Using GitPython for remote repos:** GitPython needs filesystem access to `.git`. It will NOT work over SSH. Always use `git` CLI commands via `run_command_on_machine()`.
- **Polling git status too frequently:** 30-second intervals (as specified) are appropriate. Don't run `git fetch` on every poll -- separate fetch (5 min) from status checks (30s).
- **Single giant WebSocket:** Don't multiplex all updates through `/ws/status`. Create a dedicated `/ws/feed` for feed updates. This follows the existing architecture decision of separate WS endpoints.
- **Storing feed item payloads without dedup:** Always check `source_type + external_id` before inserting. Use PostgreSQL `INSERT ... ON CONFLICT DO UPDATE` for atomic upsert.
- **Blocking the event loop with git operations:** All git commands run via `asyncio.create_subprocess_shell` (local) or `conn.run()` (SSH), both async and non-blocking.
- **String concatenation for git commands with user input:** Use `shlex.quote()` for branch names, file paths, and any user-provided values to prevent injection.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Command palette search/filter | Custom fuzzy search | cmdk built-in filter | Handles ranking, keyboard nav, accessibility |
| Diff rendering | Custom diff parser + renderer | @git-diff-view/react | GitHub-style UI, syntax highlighting, virtual scrolling |
| Panel resize/collapse | Custom drag handles | react-resizable-panels (already in use) | Already proven in Phase 1, handles edge cases |
| Cron/interval scheduling | Custom asyncio.sleep loops | APScheduler AsyncIOScheduler | Job persistence, error handling, interval management |
| HMAC verification | Manual hash comparison | `hmac.compare_digest()` from stdlib | Prevents timing attacks, correct by default |
| Date/time handling for snooze | Custom date math | Python `datetime` + `zoneinfo` | Standard library handles timezone math correctly |
| WebSocket reconnection (frontend) | Custom retry logic | Extend existing useWebSocket.ts pattern | Already handles reconnect in Phase 1 |

## Common Pitfalls

### Pitfall 1: GitPython for Remote Repos
**What goes wrong:** Attempting to use `git.Repo('/path/on/remote')` fails because the path exists on the remote machine, not the local filesystem.
**Why it happens:** GitPython wraps the git CLI but needs local filesystem access to the `.git` directory.
**How to avoid:** Use the git CLI wrapper pattern (Pattern 1) that runs commands via `run_command_on_machine()`.
**Warning signs:** `FileNotFoundError` or `InvalidGitRepositoryError` when trying to access remote repos.

### Pitfall 2: Ahead/Behind Counts Without Fetch
**What goes wrong:** `git rev-list --left-right --count HEAD...@{upstream}` shows stale counts because remote tracking info isn't updated.
**Why it happens:** The local repo's knowledge of remote branches only updates on `git fetch`.
**How to avoid:** Separate status polling (30s, uses local info only) from fetch operations (5+ min, contacts remote). Show "(stale)" indicator if last fetch was > 10 min ago.
**Warning signs:** Ahead/behind counts never change even when remote has new commits.

### Pitfall 3: SSH Command Injection in Git Service
**What goes wrong:** User-controlled input (branch names, file paths) injected into shell commands.
**Why it happens:** String concatenation in `f"git -C '{repo_path}' checkout '{branch}'"`.
**How to avoid:** Validate and sanitize all user inputs. Branch names: allow only `[a-zA-Z0-9._/-]`. File paths: reject `..` and absolute paths. Use `shlex.quote()` for any user-provided values in commands.
**Warning signs:** Branch names or file paths containing single quotes, semicolons, or backticks.

### Pitfall 4: Feed Dedup Race Conditions
**What goes wrong:** Two polling cycles or webhook + poll overlap, creating duplicate feed items despite dedup logic.
**Why it happens:** Check-then-insert is not atomic.
**How to avoid:** Use PostgreSQL `INSERT ... ON CONFLICT (source_type, external_id) DO UPDATE SET ...` for atomic upsert. The composite unique constraint handles this at the database level.
**Warning signs:** Duplicate feed items after simultaneous webhook + poll events.

### Pitfall 5: WebSocket Memory Leak with Feed Broadcasts
**What goes wrong:** Disconnected clients' queues accumulate, consuming memory.
**Why it happens:** Client disconnects aren't always detected immediately.
**How to avoid:** Remove client queues in the `finally` block (same pattern as existing `/ws/status`). Use bounded queues (`asyncio.Queue(maxsize=100)`).
**Warning signs:** Growing memory usage over time with many browser refreshes.

### Pitfall 6: Task State Transitions Without Validation
**What goes wrong:** Task moves from Done back to Queue, or other invalid transitions.
**Why it happens:** API endpoint accepts any status value without checking current state.
**How to avoid:** Implement a state machine with valid transitions: Queue -> Active, Queue -> Done (drop), Active -> Done, Active -> Queue (un-start). Reject invalid transitions with HTTP 422.
**Warning signs:** Tasks appearing in impossible states.

### Pitfall 7: Google Calendar OAuth2 Complexity
**What goes wrong:** Full OAuth2 authorization code flow requires redirect URIs, consent screens, and token refresh logic.
**Why it happens:** Google APIs require OAuth2 for user data access.
**How to avoid:** For Phase 2, accept pre-generated tokens (user creates OAuth app, authorizes manually, pastes refresh token into Locus settings). Full OAuth flow (with redirect handling) belongs in Phase 4 integrations runner.
**Warning signs:** Scope creep into building a full OAuth2 server.

## Code Examples

### Webhook Ingest Endpoint with HMAC Verification

```python
# api/feed.py
import hmac
import hashlib
import json

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.services.auth import get_current_user

router = APIRouter(prefix="/api/feed", tags=["feed"])

@router.post("/ingest")
async def ingest_webhook(
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Universal ingest endpoint for webhooks.

    Accepts items from any source. Auth via HMAC signature or JWT.
    """
    body = await request.body()

    # HMAC verification if signature header present
    signature = request.headers.get("X-Locus-Signature")
    source_type = request.headers.get("X-Locus-Source", "webhook")

    if signature:
        # Look up webhook secret for this source
        source = await get_source_by_type(db, source_type)
        if source and source.config.get("webhook_secret"):
            expected = hmac.new(
                source.config["webhook_secret"].encode(),
                body,
                hashlib.sha256,
            ).hexdigest()
            if not hmac.compare_digest(f"sha256={expected}", signature):
                raise HTTPException(status_code=401, detail="Invalid signature")
    else:
        # Fall back to JWT auth for manual/internal ingest
        # Caller must provide Authorization header
        pass

    payload = json.loads(body)
    feed_item = await feed_service.ingest_item(db, payload)
    await db.commit()

    # Broadcast to connected WebSocket clients
    await broadcast_feed_update({"type": "new_item", "item_id": str(feed_item.id)})

    return {"status": "accepted", "item_id": str(feed_item.id)}
```

### Ingest Payload Schema

```python
# schemas/feed.py
from pydantic import BaseModel

class IngestPayload(BaseModel):
    source_type: str           # "github", "gitlab", "jira", "calendar", "custom"
    external_id: str           # Unique ID from source (PR number, ticket key, etc.)
    title: str
    snippet: str | None = None
    url: str | None = None
    tier_hint: str | None = None  # Adapter's suggested tier (now/respond/review/prep/follow_up)
    source_icon: str | None = None
    metadata: dict | None = None  # Source-specific payload preserved as raw_payload
```

### Task State Machine

```python
# services/task_service.py
VALID_TRANSITIONS = {
    "queue": {"active", "done"},     # Start or Drop
    "active": {"done", "queue"},     # Complete or Un-start
    "done": set(),                    # Terminal state
}

async def transition_task(
    db: AsyncSession, task_id: uuid.UUID, new_status: str, **kwargs
) -> Task:
    task = await db.get(Task, task_id)
    if not task:
        raise ValueError("Task not found")

    if new_status not in VALID_TRANSITIONS.get(task.status, set()):
        raise ValueError(f"Invalid transition: {task.status} -> {new_status}")

    task.status = new_status
    if new_status == "active":
        task.started_at = datetime.now(timezone.utc)
        task.machine_id = kwargs.get("machine_id")
        task.repo_path = kwargs.get("repo_path")
        task.branch = kwargs.get("branch")
    elif new_status == "done":
        task.completed_at = datetime.now(timezone.utc)

    return task
```

### Polling Adapter Base Class

```python
# integrations/base_adapter.py
from abc import ABC, abstractmethod

class BasePollingAdapter(ABC):
    """Base class for all polling adapters."""

    @abstractmethod
    async def poll(self, source: IntegrationSource) -> list[dict]:
        """Fetch items from the external source.

        Returns list of dicts matching IngestPayload schema.
        """
        ...

    async def execute(self, source: IntegrationSource):
        """Called by APScheduler. Polls, deduplicates (via upsert), ingests."""
        items = await self.poll(source)
        async with async_session_factory() as db:
            for item_data in items:
                await feed_service.ingest_item(db, item_data)
            await db.commit()
            # Update last_polled_at
            source_record = await db.get(IntegrationSource, source.id)
            if source_record:
                source_record.last_polled_at = datetime.now(timezone.utc)
            await db.commit()
```

### GitHub Adapter Example

```python
# integrations/github_adapter.py
import httpx

class GitHubAdapter(BasePollingAdapter):
    async def poll(self, source: IntegrationSource) -> list[dict]:
        config = source.config  # {"token": "...", "repos": ["owner/repo"]}
        items = []

        async with httpx.AsyncClient(timeout=30) as client:
            headers = {
                "Authorization": f"Bearer {config['token']}",
                "Accept": "application/vnd.github+json",
            }

            for repo in config.get("repos", []):
                # Fetch open PRs
                resp = await client.get(
                    f"https://api.github.com/repos/{repo}/pulls",
                    params={"state": "open", "per_page": 50},
                    headers=headers,
                )
                if resp.status_code == 200:
                    for pr in resp.json():
                        items.append({
                            "source_type": "github",
                            "external_id": f"pr:{repo}:{pr['number']}",
                            "title": f"PR #{pr['number']}: {pr['title']}",
                            "snippet": (pr.get("body") or "")[:100],
                            "url": pr["html_url"],
                            "tier_hint": self._classify_tier(pr),
                            "source_icon": "github",
                            "metadata": {"repo": repo, "number": pr["number"],
                                         "author": pr["user"]["login"]},
                        })
        return items

    def _classify_tier(self, pr: dict) -> str:
        if pr.get("requested_reviewers"):
            return "review"
        if pr.get("draft"):
            return "follow_up"
        return "prep"
```

### GitLab Adapter Example

```python
# integrations/gitlab_adapter.py
class GitLabAdapter(BasePollingAdapter):
    async def poll(self, source: IntegrationSource) -> list[dict]:
        config = source.config  # {"token": "...", "base_url": "https://gitlab.com", "project_ids": [123]}
        items = []

        async with httpx.AsyncClient(timeout=30) as client:
            headers = {"PRIVATE-TOKEN": config["token"]}
            base = config.get("base_url", "https://gitlab.com")

            # Fetch MRs assigned to me or requesting my review
            for scope in ["assigned_to_me", "review_requested"]:
                resp = await client.get(
                    f"{base}/api/v4/merge_requests",
                    params={"scope": scope, "state": "opened", "per_page": 50},
                    headers=headers,
                )
                if resp.status_code == 200:
                    for mr in resp.json():
                        tier = "review" if scope == "review_requested" else "prep"
                        items.append({
                            "source_type": "gitlab",
                            "external_id": f"mr:{mr['project_id']}:{mr['iid']}",
                            "title": f"MR !{mr['iid']}: {mr['title']}",
                            "snippet": (mr.get("description") or "")[:100],
                            "url": mr["web_url"],
                            "tier_hint": tier,
                            "source_icon": "gitlab",
                            "metadata": {"project_id": mr["project_id"], "iid": mr["iid"]},
                        })
        return items
```

### Jira Adapter Example

```python
# integrations/jira_adapter.py
class JiraAdapter(BasePollingAdapter):
    async def poll(self, source: IntegrationSource) -> list[dict]:
        config = source.config  # {"base_url": "...", "email": "...", "api_token": "..."}
        items = []

        async with httpx.AsyncClient(timeout=30) as client:
            auth = (config["email"], config["api_token"])
            # JQL: assigned to me or mentioned, updated recently
            jql = "assignee = currentUser() OR watcher = currentUser() ORDER BY updated DESC"
            resp = await client.get(
                f"{config['base_url']}/rest/api/3/search",
                params={"jql": jql, "maxResults": 50, "fields": "summary,status,priority,updated"},
                auth=auth,
                headers={"Accept": "application/json"},
            )
            if resp.status_code == 200:
                for issue in resp.json().get("issues", []):
                    fields = issue["fields"]
                    items.append({
                        "source_type": "jira",
                        "external_id": f"issue:{issue['key']}",
                        "title": f"{issue['key']}: {fields['summary']}",
                        "snippet": f"Status: {fields['status']['name']}",
                        "url": f"{config['base_url']}/browse/{issue['key']}",
                        "tier_hint": self._priority_to_tier(fields.get("priority", {}).get("name")),
                        "source_icon": "jira",
                        "metadata": {"key": issue["key"], "status": fields["status"]["name"]},
                    })
        return items

    def _priority_to_tier(self, priority: str | None) -> str:
        mapping = {"Highest": "now", "High": "respond", "Medium": "prep", "Low": "follow_up", "Lowest": "follow_up"}
        return mapping.get(priority or "", "prep")
```

### Google Calendar Adapter Example

```python
# integrations/calendar_adapter.py
class GoogleCalendarAdapter(BasePollingAdapter):
    async def poll(self, source: IntegrationSource) -> list[dict]:
        config = source.config  # {"access_token": "...", "refresh_token": "...", "calendar_id": "primary"}
        items = []

        # Refresh access token if needed (simplified)
        access_token = await self._get_valid_token(config)

        async with httpx.AsyncClient(timeout=30) as client:
            now = datetime.now(timezone.utc).isoformat()
            tomorrow = (datetime.now(timezone.utc) + timedelta(days=1)).isoformat()

            resp = await client.get(
                f"https://www.googleapis.com/calendar/v3/calendars/{config.get('calendar_id', 'primary')}/events",
                params={
                    "timeMin": now,
                    "timeMax": tomorrow,
                    "singleEvents": "true",
                    "orderBy": "startTime",
                    "maxResults": 20,
                },
                headers={"Authorization": f"Bearer {access_token}"},
            )
            if resp.status_code == 200:
                for event in resp.json().get("items", []):
                    start = event.get("start", {}).get("dateTime") or event.get("start", {}).get("date")
                    items.append({
                        "source_type": "calendar",
                        "external_id": f"event:{event['id']}",
                        "title": event.get("summary", "Untitled Event"),
                        "snippet": f"Starts: {start}",
                        "url": event.get("htmlLink"),
                        "tier_hint": "prep",
                        "source_icon": "calendar",
                        "metadata": {"start": start, "event_id": event["id"]},
                    })
        return items
```

## Recommendations for Claude's Discretion Items

### Polling Adapter Refresh Intervals
- **GitHub/GitLab:** 300 seconds (5 minutes) -- respects API rate limits (5000/hr for GitHub, 2000/min for GitLab)
- **Jira:** 300 seconds (5 minutes) -- reasonable for ticket updates
- **Google Calendar:** 600 seconds (10 minutes) -- calendar events change slowly
- Store as `poll_interval_seconds` in IntegrationSource model, user-configurable in settings
- **Confidence: MEDIUM** -- based on API rate limits and practical experience

### Commit Timeline Pagination/Lazy Loading
- Load initial 30 commits on repo select
- Lazy-load 30 more on scroll-to-bottom using cursor-based pagination (pass last SHA to `git log --after=<sha>`)
- Use TanStack Query's `useInfiniteQuery` for the paginated commit list
- **Confidence: HIGH** -- standard pattern for timeline UIs

### Diff Viewer Implementation (Basic for Phase 2)
- Use @git-diff-view/react in **unified mode** by default (better for 340px-ish available width)
- Backend returns old + new file content as strings
- No inline comments or annotations (Phase 3)
- Support both working directory diffs (changed files) and commit diffs (clicking commit in timeline)
- **Confidence: MEDIUM** -- library works but exact data format needs validation

### Done Card Fade Timing
- Default: 24 hours after completion
- Implement as CSS opacity transition checked against `completed_at` timestamp
- Cards older than 24h get `opacity: 0.4` class
- Store threshold as user-configurable setting (default: 24h, options: 12h/24h/48h/1w/never)
- **Confidence: HIGH** -- simple UI pattern

### LLM Analysis Prompt for Deep Promote
- Provide feed item full context (title, snippet, source, metadata, URL)
- System prompt asking for: concise task title, 2-3 sentence context brief, suggested scope, any related items
- Use streaming response for perceived speed in the modal
- Requires Claude/Anthropic API key from credentials store
- Fallback: if no LLM configured, show a simple manual form instead
- **Confidence: MEDIUM** -- prompt design will need iteration based on real feed items

## Open Questions

1. **Git fetch frequency vs status polling frequency:**
   - Git repo status polls every 30s (local commands: branch, porcelain status, rev-list)
   - `git fetch` is network-heavy and should run less often
   - **Recommendation:** Status poll every 30s using local git state. Run `git fetch --prune` every 5 minutes as a separate operation. Show "(last fetched: 3m ago)" next to ahead/behind counts.

2. **OAuth2 Token Management for Google Calendar:**
   - Google Calendar requires OAuth2 with refresh tokens
   - Full OAuth2 redirect flow is complex (needs callback URL)
   - **Recommendation:** Phase 2 accepts pre-generated refresh tokens (user authorizes externally, pastes token into settings). Full OAuth flow with in-app consent screen belongs in Phase 4 (integrations runner).

3. **AI Tier Classification Trigger:**
   - Decision says "AI-assisted tier classification"
   - **Recommendation:** Run on ingest with a reasonable default tier from the adapter's `tier_hint`. Offer manual override. When LLM is configured, run async classification as a background task (don't block ingest). Store both `tier_hint` (from adapter) and `tier` (final, possibly AI-adjusted) on the feed item.

4. **Left Panel Split -- Nested react-resizable-panels:**
   - Top section: machine/repo tree (current Sidebar transformed)
   - Bottom section: commit timeline for selected repo
   - **Recommendation:** Use a nested `<PanelGroup direction="vertical">` inside the left Panel. Top panel default 50%, bottom 50%, both independently scrollable with `overflow-y: auto`.

## Sources

### Primary (HIGH confidence)
- Existing Locus codebase (`backend/app/services/machine_registry.py`) -- verified git CLI over SSH pattern
- Existing Locus codebase (`backend/app/api/machines.py`, lines 278-345) -- verified repo scanning via shell commands
- Existing Locus codebase (`backend/app/ws/status.py`) -- verified WebSocket pattern with polling + push
- [cmdk GitHub README](https://github.com/dip/cmdk) -- full API reference with all component props
- [@git-diff-view/react GitHub](https://github.com/MrWangJustToDo/git-diff-view) -- component API and props
- [@git-diff-view/react npm](https://www.npmjs.com/package/@git-diff-view/react) -- usage examples
- [APScheduler AsyncIOScheduler docs](https://apscheduler.readthedocs.io/en/3.x/modules/schedulers/asyncio.html)
- [TanStack Query invalidation docs](https://tanstack.com/query/latest/docs/framework/react/guides/query-invalidation)
- [TkDodo: Using WebSockets with React Query](https://tkdodo.eu/blog/using-web-sockets-with-react-query)

### Secondary (MEDIUM confidence)
- [GitHub REST API - Pull Requests](https://docs.github.com/en/rest/pulls/pulls)
- [GitHub REST API - Review Requests](https://docs.github.com/en/rest/pulls/review-requests)
- [GitLab Merge Requests API](https://docs.gitlab.com/api/merge_requests/)
- [Jira Cloud REST API - Issue Search](https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-issue-search/)
- [Google Calendar API - Python Quickstart](https://developers.google.com/workspace/calendar/api/quickstart/python)
- [GitPython tutorial](https://gitpython.readthedocs.io/en/stable/tutorial.html) -- confirmed filesystem requirement
- [GitPython GitHub issue #549](https://github.com/gitpython-developers/GitPython/issues/549) -- tracking branch documentation

### Tertiary (LOW confidence)
- WebSearch results for HMAC webhook patterns -- consistent across sources
- WebSearch results for Zustand state machine patterns -- generic patterns

## Metadata

**Confidence breakdown:**
- Git operations service layer: HIGH -- follows proven existing codebase patterns exactly
- Feed/webhook architecture: HIGH -- standard REST + WebSocket pattern, DB upsert for dedup
- Polling adapters: HIGH -- APScheduler AsyncIOScheduler is well-documented
- Command palette (cmdk): HIGH -- verified API from official GitHub docs
- Diff viewer (@git-diff-view/react): MEDIUM -- API verified but hunks/data format needs implementation validation
- Task state machine: HIGH -- simple state transitions, standard pattern
- External API integrations: MEDIUM -- API endpoints verified, but OAuth flows need implementation detail

**Research date:** 2026-03-26
**Valid until:** 2026-04-26 (30 days -- stable domain, libraries unlikely to change)
