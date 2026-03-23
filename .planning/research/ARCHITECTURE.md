# Architecture Patterns

**Domain:** Engineering cockpit / developer control plane
**Researched:** 2026-03-23

## Recommended Architecture

Locus is a four-container Docker Compose stack with a clear separation between the API server (real-time + REST), the frontend SPA, the database, and a standalone integrations runner. The API server is the sole gateway -- every external connection (SSH, Git, WebSocket, REST) flows through it. The frontend is a static build served by the API container or a lightweight nginx sidecar.

```
+----------------------------------------------------------+
|  Browser (React SPA)                                     |
|  xterm.js | Diff Viewer | Work Feed | GSD Panel          |
+---+------------------+------------------+----------------+
    |                  |                  |
    | WS /ws/terminal  | WS /ws/events   | REST /api/*
    |                  |                  |
+---v------------------v------------------v----------------+
|  API Server (FastAPI + uvicorn)                          |
|                                                          |
|  +-------------+  +-------------+  +------------------+  |
|  | Terminal Mgr |  | Event Bus   |  | REST Routes      |  |
|  | (WS <-> PTY)|  | (pub/sub)   |  | (feed, git, gsd) |  |
|  +------+------+  +------+------+  +--------+---------+  |
|         |                |                   |            |
|  +------v------+  +------v------+  +---------v---------+ |
|  | SSH Pool    |  | Git Ops     |  | Feed Engine       | |
|  | (AsyncSSH)  |  | (gitpython  |  | (ingest, categorize|
|  |             |  |  + remotes) |  |  store, notify)   | |
|  +------+------+  +------+------+  +---------+---------+ |
|         |                |                   |            |
|         +--------+-------+-------------------+            |
|                  |                                        |
|           +------v------+                                 |
|           | Postgres    |  (via asyncpg)                  |
|           +-------------+                                 |
+----------------------------------------------------------+
         |                              |
         | Docker network               | Docker network
         v                              v
+------------------+          +---------------------+
| Postgres 16      |          | Integrations Runner |
| (Docker service) |          | (polling workers)   |
+------------------+          +---------------------+
```

### Component Boundaries

| Component | Responsibility | Communicates With | Protocol |
|-----------|---------------|-------------------|----------|
| **React Frontend** | UI rendering, terminal display (xterm.js), diff viewing, feed display, GSD panel | API Server | WebSocket, REST |
| **API Server** | Central hub: auth, routing, WebSocket management, business logic | All other components | Internal Python calls, asyncpg, AsyncSSH |
| **Terminal Manager** | Multiplex WebSocket connections to PTY/SSH sessions, handle resize, reconnect | SSH Pool (for remote), local PTY (for local) | WebSocket in, PTY/SSH out |
| **SSH Pool** | Maintain persistent AsyncSSH connections to remote machines, channel multiplexing | Remote machines | SSH |
| **Git Ops Layer** | Status polling, diff generation, branch ops across repos (local and remote via SSH) | SSH Pool (remote repos), local filesystem | Git CLI via subprocess / AsyncSSH exec |
| **Feed Engine** | Ingest API, smart categorization, storage, notification dispatch | Postgres, Event Bus | REST in, asyncpg out |
| **Event Bus** | In-process pub/sub for broadcasting state changes to WebSocket clients | Terminal Manager, Feed Engine, Git Ops, GSD Reader | Python async queues |
| **GSD Reader** | Parse `.planning/` directories, surface phase state, track transitions | Filesystem (local), SSH Pool (remote) | File I/O |
| **Integrations Runner** | Execute polling workers built by Claude, POST results to Feed ingest API | API Server (REST), external services | REST, various APIs |
| **Postgres** | Persist credentials, feed items, integration configs, repo/machine metadata, SSH keys | API Server (asyncpg) | PostgreSQL protocol |

### Data Flow

**Terminal session (remote machine):**
```
Browser xterm.js
  --> WS /ws/terminal/{session_id}
  --> Terminal Manager (API server)
  --> SSH Pool (reuse or create AsyncSSH connection)
  --> Remote machine tmux session (attach or create)
  --> stdout flows back through same path
```

**Work feed ingest:**
```
External source (or Integrations Runner)
  --> POST /api/feed/ingest (structured payload)
  --> Feed Engine validates, categorizes (Now/Respond/Review/Prep/Follow up)
  --> INSERT into Postgres feed_items table
  --> Event Bus publishes "new_feed_item"
  --> WebSocket /ws/events pushes to connected browser
  --> React re-renders feed panel
```

**Git status polling:**
```
Scheduler (every N seconds per repo)
  --> Git Ops: run `git status --porcelain`, `git log`, `git rev-list`
  --> For remote repos: execute via SSH Pool channel
  --> Compare with cached state in memory
  --> If changed: Event Bus publishes "repo_state_changed"
  --> WebSocket pushes update to browser
  --> Sidebar re-renders branch/dirty state
```

**GSD phase state:**
```
Scheduler or on-demand trigger
  --> GSD Reader: read .planning/ROADMAP.md, phase status files
  --> For remote repos: cat files via SSH Pool
  --> Parse phase state, current milestone, blockers
  --> Cache in memory, persist summary to Postgres
  --> Event Bus publishes "gsd_state_changed"
  --> GSD panel in UI updates
```

**Integration worker lifecycle:**
```
User tells Claude to build a Jira integration
  --> Claude writes a polling worker script (Python)
  --> POST /api/integrations/deploy with script content + config
  --> API server writes script to shared volume
  --> API server signals Integrations Runner via REST or file watch
  --> Runner loads and starts new worker in its asyncio loop
  --> Worker polls Jira on interval
  --> Worker POSTs results to /api/feed/ingest
  --> Feed Engine processes as any other ingest
```

## Patterns to Follow

### Pattern 1: WebSocket Channel Multiplexing
**What:** Single WebSocket connection per client, multiplexed with message types/channels rather than one WS per feature.
**When:** Always. The browser opens one primary WS for events and one WS per terminal session.
**Why:** Reduces connection overhead, simplifies auth (authenticate once), makes reconnection logic simpler.
**Example:**
```python
# Event WebSocket message format
{
    "channel": "feed" | "repo_state" | "gsd" | "system",
    "event": "new_item" | "state_changed" | "connected",
    "payload": { ... }
}
```
**Confidence:** HIGH -- this is standard practice for real-time web apps.

### Pattern 2: SSH Connection Pool with Channel Reuse
**What:** One AsyncSSH connection per remote machine, multiple channels (terminal sessions, git commands, file reads) multiplexed over it.
**When:** Any remote machine interaction.
**Why:** SSH handshake is expensive (key exchange, auth). Reusing connections and opening new channels is cheap. AsyncSSH natively supports this via `conn.create_session()` and `conn.run()`.
**Example:**
```python
class SSHPool:
    _connections: dict[str, asyncssh.SSHClientConnection]

    async def get_connection(self, machine_id: str) -> asyncssh.SSHClientConnection:
        if machine_id not in self._connections or self._connections[machine_id].is_closed():
            config = await self._get_machine_config(machine_id)
            self._connections[machine_id] = await asyncssh.connect(
                config.host, port=config.port,
                username=config.user, client_keys=[config.key_path],
                keepalive_interval=30
            )
        return self._connections[machine_id]

    async def exec_command(self, machine_id: str, cmd: str) -> str:
        conn = await self.get_connection(machine_id)
        result = await conn.run(cmd)
        return result.stdout

    async def open_terminal(self, machine_id: str) -> asyncssh.SSHClientProcess:
        conn = await self.get_connection(machine_id)
        return await conn.create_process(term_type='xterm-256color', term_size=(80, 24))
```
**Confidence:** HIGH -- AsyncSSH documentation explicitly supports this pattern.

### Pattern 3: In-Process Event Bus (not Redis)
**What:** Use Python `asyncio.Queue` based pub/sub for broadcasting state changes, not Redis pub/sub.
**When:** Single-instance, single-user deployment.
**Why:** Locus is explicitly single-user. Redis adds operational complexity for zero benefit. An in-process bus has lower latency, zero additional infrastructure, and is simpler to debug.
**Example:**
```python
class EventBus:
    _subscribers: dict[str, list[asyncio.Queue]]

    def subscribe(self, channel: str) -> asyncio.Queue:
        queue = asyncio.Queue(maxsize=100)
        self._subscribers.setdefault(channel, []).append(queue)
        return queue

    async def publish(self, channel: str, event: dict):
        for queue in self._subscribers.get(channel, []):
            try:
                queue.put_nowait(event)
            except asyncio.QueueFull:
                # Drop oldest, prevent backpressure from blocking publishers
                queue.get_nowait()
                queue.put_nowait(event)
```
**Confidence:** HIGH -- single-user constraint eliminates the need for distributed pub/sub.

### Pattern 4: Git Operations via CLI Subprocess, Not Library
**What:** Shell out to `git` CLI rather than using GitPython or pygit2 for status/diff/branch operations.
**When:** All git operations, both local and remote.
**Why:** GitPython wraps the CLI anyway but adds abstraction bugs. For remote repos, you need to run commands over SSH regardless. Using the CLI directly means the same code path works locally (`subprocess`) and remotely (`ssh_pool.exec_command`). Diff output can be passed directly to the frontend diff viewer.
**Example:**
```python
class GitOps:
    async def status(self, repo: RepoConfig) -> RepoState:
        cmd = "git -C {path} status --porcelain -b"
        if repo.is_remote:
            output = await self.ssh_pool.exec_command(repo.machine_id, cmd.format(path=repo.path))
        else:
            proc = await asyncio.create_subprocess_shell(cmd.format(path=repo.path), ...)
            output = await proc.communicate()
        return self._parse_status(output)
```
**Confidence:** MEDIUM -- GitPython is more common in Python projects, but the remote-first requirement makes CLI the pragmatic choice.

### Pattern 5: Feed Ingest as Universal Gateway
**What:** Every external signal enters through a single `POST /api/feed/ingest` endpoint with a structured schema. No special-purpose ingestion paths.
**When:** All integrations, webhooks, meeting transcripts, manual entries.
**Why:** Keeps the core system simple. The API server never needs to know about Jira, GitLab, Calendar internals. Integration workers handle translation. Adding a new source means writing a new worker, not modifying the core.
**Example:**
```python
class FeedIngestPayload(BaseModel):
    source: str           # "jira", "gitlab", "gcal", "manual"
    source_id: str        # unique ID from source system
    title: str
    body: str | None
    url: str | None       # link back to source
    category_hint: str | None  # "review", "respond", etc.
    urgency: int | None   # 1-5, used in auto-categorization
    mentions_me: bool = False
    timestamp: datetime
    metadata: dict = {}   # source-specific data
```
**Confidence:** HIGH -- this is the core architectural decision already validated in PROJECT.md.

### Pattern 6: Polling with Smart Intervals (Adaptive Backoff)
**What:** Git status polling and integration polling use adaptive intervals rather than fixed timers.
**When:** Any background polling loop (git status, integration workers).
**Why:** Fixed 5-second polling across 20 repos wastes resources when nothing changes. Adaptive polling increases interval when idle, decreases on activity.
**Example:**
```python
class AdaptivePoller:
    def __init__(self, min_interval=2, max_interval=30, backoff_factor=1.5):
        self.interval = min_interval
        self.min = min_interval
        self.max = max_interval
        self.factor = backoff_factor

    async def poll_loop(self, check_fn, on_change_fn):
        last_state = None
        while True:
            state = await check_fn()
            if state != last_state:
                await on_change_fn(state)
                last_state = state
                self.interval = self.min  # Reset to fast polling
            else:
                self.interval = min(self.interval * self.factor, self.max)
            await asyncio.sleep(self.interval)
```
**Confidence:** HIGH -- standard pattern, well-suited to the use case.

## Anti-Patterns to Avoid

### Anti-Pattern 1: One WebSocket Per Feature
**What:** Opening separate WebSocket connections for terminal, feed updates, git state, GSD state.
**Why bad:** Browser connection limits (6 per origin for HTTP/1.1), multiplied auth overhead, complex reconnection, resource waste.
**Instead:** One multiplexed event WebSocket + one WS per active terminal session.

### Anti-Pattern 2: Embedding Integration Logic in the API Server
**What:** Writing Jira polling, GitLab polling, etc. directly in the API server codebase.
**Why bad:** Couples the core to external services, makes the API server's dependency tree enormous, any integration bug can crash the whole system.
**Instead:** Integrations Runner container with isolated workers. Workers only communicate via the feed ingest REST API.

### Anti-Pattern 3: ORM-Heavy Database Access
**What:** Using SQLAlchemy ORM with complex relationship models for feed items, repo state, etc.
**Why bad:** Feed items are high-write, simple-schema. ORM overhead adds latency and complexity for data that maps naturally to flat tables. Single-user means no concurrency concerns that ORMs help with.
**Instead:** Use asyncpg directly with raw SQL or a lightweight query builder. Keep the schema simple and flat. Use SQLAlchemy Core (not ORM) if you want migration support.

### Anti-Pattern 4: Storing SSH Connections State in Postgres
**What:** Tracking SSH connection status, terminal sessions, etc. in the database.
**Why bad:** Connection state is ephemeral and changes rapidly. Database writes for every terminal keystroke or connection heartbeat are wasteful.
**Instead:** Keep connection state in-memory in the API server. Only persist machine configs and credentials in Postgres.

### Anti-Pattern 5: Polling Remote Repos by Cloning
**What:** Cloning remote repos locally to check their status.
**Why bad:** Wastes disk, bandwidth, and time. A repo you want to monitor might be 10GB.
**Instead:** Run git commands directly on the remote machine via SSH. The repo already exists there.

## Component Dependency Graph (Build Order)

The dependency chain determines what must exist before each component can function:

```
Phase 1: Foundation
  Postgres schema + migrations
  API Server skeleton (FastAPI + uvicorn)
  Docker Compose (app + db)
  Auth (single-user, JWT or session)

Phase 2: Connectivity
  SSH Pool (AsyncSSH connection management)
  Terminal Manager (WebSocket <-> SSH PTY bridge)
  Frontend shell (React + xterm.js, basic layout)
  --> Requires: Phase 1

Phase 3: Repository Intelligence
  Git Ops layer (status, diff, branch ops)
  Repo/Machine management (CRUD, sidebar display)
  Diff viewer component
  Adaptive polling for git state
  --> Requires: Phase 2 (SSH Pool for remote repos)

Phase 4: Work Feed
  Feed ingest API
  Smart categorization engine
  Feed panel UI
  Event Bus + WebSocket push for real-time updates
  --> Requires: Phase 1 (Postgres), partially Phase 2 (event WS)

Phase 5: Integrations
  Integrations Runner container
  Worker deployment API
  Worker lifecycle management
  --> Requires: Phase 4 (feed ingest API to POST results to)

Phase 6: GSD + Polish
  GSD Reader (parse .planning/ directories)
  GSD panel UI
  Command palette
  AI-assisted MR review
  Skills system
  --> Requires: Phase 3 (git/repo layer), Phase 4 (feed for GSD events)
```

**Key ordering rationale:**
- SSH Pool is foundational -- terminals, git ops, and GSD reading on remote machines all depend on it
- Feed ingest API must exist before integrations runner can be useful
- Git Ops layer must exist before GSD reader (GSD state lives in git repos)
- The Event Bus and WebSocket push cut across everything but are simple enough to build incrementally alongside each phase

## Scalability Considerations

| Concern | Single user (target) | Future: mobile + notifications | Notes |
|---------|---------------------|-------------------------------|-------|
| WebSocket connections | 1-3 browser tabs = trivial | Add push notification service | In-process event bus is fine |
| SSH connections | 5-15 machines = fine in memory | Same | AsyncSSH handles this well |
| Git polling | 20-30 repos, adaptive intervals | Same | CPU-bound diff parsing is the limit |
| Feed items | Thousands over months | Add pagination, archival | Simple Postgres queries suffice |
| Integration workers | 5-15 concurrent pollers | Same | Single container, asyncio tasks |
| Database | Single-user writes are trivial | Same | Postgres is massively overkill, which is good |

## Technology Specifics

| Layer | Technology | Why This |
|-------|-----------|----------|
| API framework | FastAPI | Async-native, WebSocket support, Pydantic validation, auto-docs |
| ASGI server | uvicorn | Standard for FastAPI, handles WS well |
| SSH | AsyncSSH | Only mature async SSH library for Python, channel multiplexing |
| Database driver | asyncpg | Fastest Python Postgres driver, async-native |
| Migrations | Alembic | Standard, works standalone without ORM |
| Frontend framework | React 18+ | Specified in constraints |
| Terminal emulator | xterm.js | De facto standard for web terminals |
| Diff viewer | react-diff-viewer or Monaco diff | Monaco if you want syntax highlighting, react-diff-viewer for simpler needs |
| State management | Zustand | Lightweight, no boilerplate, good for real-time state |
| WebSocket client | Native WebSocket API + reconnecting-websocket | Simple, no framework needed |
| CSS framework | Tailwind CSS | Utility-first, good for custom layouts like three-panel |
| Build tool | Vite | Fast, standard for React in 2026 |

## Docker Compose Structure

```yaml
services:
  app:
    build: .
    ports: ["8080:8080"]
    depends_on: [db]
    volumes:
      - integrations:/app/integrations  # shared with runner
      - ssh-keys:/app/ssh-keys
    environment:
      DATABASE_URL: postgresql://...

  db:
    image: postgres:16-alpine
    volumes: [pgdata:/var/lib/postgresql/data]

  integrations-runner:
    build: ./integrations-runner
    volumes:
      - integrations:/app/workers  # reads worker scripts from shared vol
    environment:
      LOCUS_API_URL: http://app:8080
    depends_on: [app]

volumes:
  pgdata:
  integrations:
  ssh-keys:
```

**Key decisions:**
- Frontend is built and served by the `app` container (no separate nginx container for v1)
- Integrations Runner shares a volume with app for worker script deployment
- Runner communicates with API server over Docker internal network via REST
- SSH keys stored in a named volume, not bind-mounted (portable across hosts)

## Sources

- [AsyncSSH documentation](https://asyncssh.readthedocs.io/) -- SSH connection multiplexing patterns
- [AsyncSSH connection pooling discussion](https://github.com/ronf/asyncssh/issues/172) -- channel reuse over single connection
- [FastAPI WebSocket documentation](https://fastapi.tiangolo.com/advanced/websockets/) -- WebSocket endpoint patterns
- [FastAPI WebSocket architecture (2025)](https://hexshift.medium.com/how-to-incorporate-advanced-websocket-architectures-in-fastapi-for-high-performance-real-time-b48ac992f401) -- connection management, rooms, reconnection
- [WebSocket/SSE with FastAPI (2025)](https://blog.greeden.me/en/2025/10/28/weaponizing-real-time-websocket-sse-notifications-with-fastapi-connection-management-rooms-reconnection-scale-out-and-observability/) -- operational best practices
- [pyxtermjs](https://github.com/cs01/pyxtermjs) -- Python + xterm.js reference implementation
- [IDP Reference Architectures](https://devops.com/internal-developer-platform-idp-reference-architectures/) -- developer platform component patterns
- [Port.io platform architecture](https://www.port.io/blog/building-a-platform-an-architecture-for-developer-autonomy) -- developer autonomy architecture
- [asyncio-connection-pool](https://pypi.org/project/asyncio-connection-pool/) -- generic async connection pooling pattern
