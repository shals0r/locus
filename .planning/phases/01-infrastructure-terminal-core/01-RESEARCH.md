# Phase 1: Infrastructure & Terminal Core - Research

**Researched:** 2026-03-23
**Domain:** Docker infrastructure, SSH terminal management, WebSocket terminal streaming, single-user auth, three-panel layout
**Confidence:** HIGH

## Summary

Phase 1 is a greenfield build delivering the Docker Compose stack, single-user authentication, SSH-based terminal management with tmux support, and the three-panel layout shell. The technology stack is fully locked in CLAUDE.md and CONTEXT.md -- FastAPI + AsyncSSH on the backend, xterm.js + react-resizable-panels on the frontend, PostgreSQL for persistence.

The critical technical challenge is the WebSocket-to-SSH bridge: each browser terminal tab opens a WebSocket to FastAPI, which maintains an AsyncSSH process with a PTY, bidirectionally streaming raw bytes between xterm.js and the remote shell. Terminal resize events must propagate from the browser through the WebSocket to `SSHClientChannel.set_terminal_size()`. The secondary challenge is connection lifecycle management -- persistent SSH connections with heartbeats, exponential backoff reconnection, and tmux session detection/reattachment.

Auth is straightforward: single-user password set on first run, JWT tokens for session management, Fernet-encrypted credential storage in Postgres keyed by an env var.

**Primary recommendation:** Build the WebSocket-SSH bridge and terminal rendering first, then layer on connection management, tmux support, auth, and the panel layout. The bridge is the highest-risk component and should be validated early.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Tab-per-machine organization -- each machine gets a top-level tab, with sub-tabs for individual sessions (shell or Claude Code) within that machine
- **D-02:** Claude Code sessions appear mixed in the sub-tab bar alongside regular shell tabs, distinguished by a visual indicator (icon/color)
- **D-03:** A dedicated Claude Code sessions overview (feed-style list) shows all active sessions across all machines with status (idle/running/waiting), last activity, and repo name. Click to jump to that session's tab.
- **D-04:** New terminal tab opens a quick repo picker (repos known to that machine), with option to open a plain shell instead
- **D-05:** Left sidebar shows machine list in Phase 1 -- connected machines with online/offline status, expandable to show active sessions. This tree becomes the machine/repo navigator in Phase 2.
- **D-06:** Right panel (future work feed) starts collapsed by default in Phase 1. Panel infrastructure is built but not shown until Phase 2.
- **D-07:** Drag handles between panels for resizing. Click panel header to collapse/expand. Double-click handle to reset to default width.
- **D-08:** Top bar contains: left -- Locus logo/name; center -- connected service status indicators (SSH, DB, Claude Code); right -- user menu (settings, logout). Machine tabs live below the top bar.
- **D-09:** First-run setup wizard: create password -> add first machine (SSH host/key) -> optionally add service credentials. Optional steps can be skipped and configured later via settings.
- **D-10:** Service credentials managed via a settings page with per-credential "Test connection" button. Stored encrypted in Postgres with a per-instance encryption key from env var. UI should be extensible for future service types added via the Integrator skill.
- **D-11:** Claude Code auth (API key or OAuth) stored centrally in Locus settings. When connecting to a machine, Locus pushes the auth config to that machine via SSH (writes to ~/.claude/ or sets env vars).
- **D-12:** Machines added via a form in settings: name, host, port, username, SSH key path. Test connection button. Also accessible from sidebar "+ Add machine" shortcut.
- **D-13:** SSH reconnection: auto-reconnect with exponential backoff up to a set max retries. On max retries exhausted, show "Connection lost" banner with manual "Reconnect" button. On successful reconnect, auto-reattach to tmux session.
- **D-14:** Tmux session handling on connect: auto-detect existing tmux sessions, show picker to attach to one or create new. If none found, create new tmux session automatically.
- **D-15:** Machine status via periodic heartbeat (e.g., every 30s). Sidebar shows green/red dot. Keeps SSH control connection alive for fast terminal opens.
- **D-16:** User configures 1-2 root directories per machine (e.g., ~/projects, ~/work). Locus scans those paths for git repos on connect. New repos auto-discovered on subsequent scans.
- **D-17:** Dark theme only for v1. Terminal-heavy UI looks best dark, avoids theming complexity.
- **D-18:** Single docker-compose.yml with Docker Compose profiles for dev vs prod. `docker compose --profile dev up` enables hot-reload volumes, Vite dev server, and debug mode.

### Claude's Discretion
- Panel default proportions and breakpoints
- Heartbeat interval tuning
- Terminal color scheme specifics within dark theme
- Reconnection backoff parameters (initial delay, max delay, max retries)

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| TERM-01 | SSH persistent auto-reconnecting connections | AsyncSSH connection lifecycle, `connection_lost` callback, exponential backoff pattern |
| TERM-02 | Full terminal emulator (256-color, mouse, resize) | xterm.js + WebSocket bridge to AsyncSSH PTY with `term_type='xterm-256color'`, `set_terminal_size()` |
| TERM-03 | Multiple terminal tabs bound to repo+machine | Tab-per-machine model (D-01), Zustand store for session state |
| TERM-04 | Attach to tmux sessions, reconnect gracefully | `tmux ls` parsing via AsyncSSH, `tmux attach -t`, tmux reattach on reconnect |
| TERM-05 | Machine connection status indicators | Heartbeat via SSH keepalive + periodic probe, Zustand store for status |
| TERM-06 | All active Claude Code sessions in one view | Detect `claude` processes via `ps` or tmux window names, overview panel |
| TERM-07 | Feed notification when Claude Code waiting for input | Monitor terminal output for Claude Code prompt patterns |
| AUTH-01 | Password setup on first run | bcrypt hashing via passlib, first-run wizard flow |
| AUTH-02 | Encrypted credential storage in Postgres | Fernet encryption via SQLAlchemy TypeDecorator, key from env var |
| AUTH-03 | SSH key references stored securely | Store paths only (not key content), validate path exists on machine add |
| AUTH-04 | Claude Code auth config pushed to machines | SSH file write to `~/.claude/` or env var injection via AsyncSSH |
| DEPL-01 | Single `docker compose up` | Multi-stage Dockerfile, Compose with profiles for dev/prod |
| DEPL-02 | Config via env vars + first-run flow | Pydantic Settings for env parsing, setup wizard UI |
| DEPL-03 | Connected service status indicators in top bar | WebSocket-pushed status updates, top bar component |
| UI-03 | Collapse, expand, resize three panels | react-resizable-panels with collapsible prop |
| UI-04 | Focus mode via panel collapse | Panel collapse to 0 width, keyboard shortcut |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

- **Tech stack**: Python backend (FastAPI), React frontend, Postgres, Docker Compose -- no negotiation
- **Deployment**: Single `docker compose up` -- zero manual setup beyond env vars
- **Single-user**: No multi-tenancy
- **SSH**: Persistent connections with tmux support and graceful reconnection
- **GSD compatibility**: Must preserve `.planning/` directory structure
- **Security**: Secrets in .env files (gitignored), never in code

## Standard Stack

### Core (Phase 1 Subset)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| FastAPI | 0.135.2 | API + WebSocket server | Async-native, WebSocket first-class, Pydantic built in |
| Uvicorn | 0.42.0 | ASGI server | Production-grade, pairs with FastAPI |
| AsyncSSH | 2.22.0 | SSH connection management | Native asyncio, PTY support, `create_process` with terminal params |
| SQLAlchemy | 2.0.48 | Async ORM | `create_async_engine` with asyncpg driver |
| asyncpg | 0.31.0 | Postgres async driver | Required for SQLAlchemy async engine |
| Alembic | 1.18.4 | Database migrations | Auto-generates from SQLAlchemy models |
| PyJWT | 2.12.1 | JWT token handling | Lightweight, standard for FastAPI auth |
| passlib | 1.7.4 | Password hashing (bcrypt) | FastAPI official docs recommend this |
| bcrypt | 5.0.0 | Bcrypt backend for passlib | Industry standard password hashing |
| cryptography | 46.0.5 | Fernet encryption for credentials | Provides Fernet symmetric encryption |
| React | 19.2.4 | UI framework | Current stable, project constraint |
| TypeScript | 6.0.2 | Type safety | Required for WebSocket/terminal type safety |
| Vite | 8.0.2 | Build + dev server | Current standard, Rolldown bundler |
| @xterm/xterm | 6.0.0 | Terminal emulator | Industry standard, powers VS Code |
| @xterm/addon-fit | 0.11.0 | Terminal auto-resize | Resize on panel change |
| @xterm/addon-attach | 0.12.0 | WebSocket attachment | Connects xterm.js to WebSocket stream |
| @xterm/addon-web-links | 0.12.0 | Clickable URLs | Quality-of-life for terminal |
| react-resizable-panels | 4.7.5 | Three-panel layout | Purpose-built for collapsible/resizable panels |
| Zustand | 5.0.12 | Client state | Lightweight store for sessions, panels, connections |
| TanStack Query | 5.95.2 | Server state | API fetching, caching, WebSocket invalidation |
| Tailwind CSS | 4.2.2 | Styling | Utility-first, zero-runtime, dark theme straightforward |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| python-multipart | latest | Form data parsing | Required by FastAPI for OAuth2 password flow |
| pydantic-settings | latest | Env var configuration | `LOCUS_SECRET_KEY`, `LOCUS_DB_URL`, etc. |

### Installation

**Backend (Python):**
```bash
pip install "fastapi[standard]>=0.135" uvicorn asyncssh sqlalchemy[asyncio] asyncpg alembic pyjwt "passlib[bcrypt]" bcrypt cryptography pydantic-settings python-multipart
```

**Frontend (Node):**
```bash
npm install react react-dom @xterm/xterm @xterm/addon-fit @xterm/addon-attach @xterm/addon-web-links react-resizable-panels zustand @tanstack/react-query tailwindcss
npm install -D typescript @types/react @types/react-dom vite @vitejs/plugin-react vitest
```

## Architecture Patterns

### Recommended Project Structure
```
locus/
├── docker-compose.yml
├── .env.example
├── backend/
│   ├── Dockerfile
│   ├── requirements.txt
│   ├── alembic/
│   │   ├── alembic.ini
│   │   ├── env.py
│   │   └── versions/
│   └── app/
│       ├── main.py              # FastAPI app, lifespan, mount static
│       ├── config.py            # Pydantic Settings
│       ├── database.py          # async engine, session factory
│       ├── models/
│       │   ├── user.py          # single user (password hash)
│       │   ├── machine.py       # SSH machines
│       │   ├── credential.py   # encrypted service credentials
│       │   └── session.py       # terminal sessions
│       ├── api/
│       │   ├── auth.py          # login, JWT, first-run setup
│       │   ├── machines.py      # CRUD + test connection
│       │   ├── settings.py      # credentials, Claude Code config
│       │   └── sessions.py      # terminal session management
│       ├── ws/
│       │   ├── terminal.py      # WebSocket <-> SSH bridge
│       │   └── status.py        # connection status updates
│       ├── ssh/
│       │   ├── manager.py       # connection pool, heartbeats
│       │   ├── terminal.py      # PTY process management
│       │   └── tmux.py          # tmux detection, attach, create
│       ├── services/
│       │   ├── auth.py          # password hashing, JWT creation
│       │   ├── crypto.py        # Fernet encrypt/decrypt
│       │   └── claude.py        # Claude Code session detection
│       └── schemas/
│           ├── auth.py
│           ├── machine.py
│           └── session.py
└── frontend/
    ├── Dockerfile              # multi-stage: build + serve
    ├── package.json
    ├── vite.config.ts
    ├── tailwind.config.ts
    ├── index.html
    └── src/
        ├── main.tsx
        ├── App.tsx
        ├── api/
        │   └── client.ts        # fetch wrapper with JWT
        ├── stores/
        │   ├── authStore.ts
        │   ├── machineStore.ts
        │   ├── sessionStore.ts
        │   └── panelStore.ts
        ├── hooks/
        │   ├── useTerminal.ts   # xterm.js lifecycle
        │   └── useWebSocket.ts  # reconnecting WebSocket
        ├── components/
        │   ├── layout/
        │   │   ├── AppShell.tsx       # PanelGroup wrapper
        │   │   ├── TopBar.tsx
        │   │   ├── Sidebar.tsx        # machine tree
        │   │   ├── CenterPanel.tsx    # terminal tabs
        │   │   └── RightPanel.tsx     # collapsed in Phase 1
        │   ├── terminal/
        │   │   ├── TerminalTab.tsx
        │   │   ├── TerminalView.tsx   # xterm.js mount
        │   │   └── ClaudeOverview.tsx # Claude Code sessions list
        │   ├── auth/
        │   │   ├── LoginPage.tsx
        │   │   └── SetupWizard.tsx
        │   └── machines/
        │       ├── MachineForm.tsx
        │       ├── TmuxPicker.tsx
        │       └── RepoPicker.tsx
        └── types/
            └── index.ts
```

### Pattern 1: WebSocket-SSH Terminal Bridge

**What:** Each terminal tab creates a WebSocket connection to FastAPI, which maintains a corresponding AsyncSSH process with a PTY. Data flows bidirectionally as raw bytes.

**When to use:** Every terminal session.

**Architecture:**
```
Browser (xterm.js)  <--WebSocket-->  FastAPI  <--AsyncSSH PTY-->  Remote Shell
     |                                  |
     |-- onData(input) ----send()-----> |-- process.stdin.write(bytes) -->
     |<-- write(output) <--send()------ |<-- process.stdout.read(n) -----
     |-- onResize(cols,rows) ---------> |-- channel.set_terminal_size() ->
```

**Example (backend WebSocket handler):**
```python
# Source: AsyncSSH docs + FastAPI WebSocket docs
from fastapi import WebSocket, WebSocketDisconnect
import asyncssh
import asyncio

@app.websocket("/ws/terminal/{session_id}")
async def terminal_ws(websocket: WebSocket, session_id: str):
    await websocket.accept()

    # Get SSH connection from pool
    ssh_conn = await ssh_manager.get_connection(machine_id)

    # Create process with PTY in binary mode
    process = await ssh_conn.create_process(
        command=None,  # interactive shell
        term_type="xterm-256color",
        term_size=(cols, rows),
        encoding=None,  # raw bytes mode
    )

    async def read_from_ssh():
        """Forward SSH stdout to WebSocket."""
        try:
            while True:
                data = await process.stdout.read(4096)
                if not data:
                    break
                await websocket.send_bytes(data)
        except (asyncssh.DisconnectError, asyncssh.ConnectionLost):
            await websocket.close()

    async def read_from_ws():
        """Forward WebSocket input to SSH stdin."""
        try:
            while True:
                data = await websocket.receive()
                if "bytes" in data:
                    process.stdin.write(data["bytes"])
                elif "text" in data:
                    msg = json.loads(data["text"])
                    if msg["type"] == "resize":
                        process.channel.set_terminal_size(
                            msg["cols"], msg["rows"]
                        )
        except WebSocketDisconnect:
            process.close()

    # Run both directions concurrently
    await asyncio.gather(read_from_ssh(), read_from_ws())
```

**Example (frontend terminal component):**
```typescript
// Source: @xterm/xterm docs, @xterm/addon-fit docs
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";

function useTerminal(sessionId: string) {
  const termRef = useRef<HTMLDivElement>(null);
  const termInstance = useRef<Terminal>();

  useEffect(() => {
    const term = new Terminal({
      cursorBlink: true,
      theme: { background: "#1a1b26" },  // dark theme
      fontFamily: "JetBrains Mono, monospace",
      fontSize: 14,
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(termRef.current!);
    fitAddon.fit();

    const ws = new WebSocket(`ws://${host}/ws/terminal/${sessionId}`);
    ws.binaryType = "arraybuffer";

    // SSH output -> terminal display
    ws.onmessage = (event) => {
      term.write(new Uint8Array(event.data));
    };

    // Terminal input -> SSH
    term.onData((data) => {
      ws.send(new TextEncoder().encode(data));
    });

    // Resize events -> SSH
    term.onResize(({ cols, rows }) => {
      ws.send(JSON.stringify({ type: "resize", cols, rows }));
    });

    // Panel resize -> terminal fit
    const observer = new ResizeObserver(() => fitAddon.fit());
    observer.observe(termRef.current!);

    termInstance.current = term;
    return () => { term.dispose(); ws.close(); observer.disconnect(); };
  }, [sessionId]);
}
```

### Pattern 2: SSH Connection Pool with Heartbeat

**What:** Maintain a persistent SSH connection per machine. Use periodic heartbeats to detect failures. Share the connection across multiple terminal sessions on the same machine.

**Example:**
```python
# Source: AsyncSSH docs
class SSHManager:
    def __init__(self):
        self._connections: dict[str, asyncssh.SSHClientConnection] = {}
        self._heartbeat_tasks: dict[str, asyncio.Task] = {}

    async def connect(self, machine: Machine) -> asyncssh.SSHClientConnection:
        conn = await asyncssh.connect(
            machine.host,
            port=machine.port,
            username=machine.username,
            client_keys=[machine.ssh_key_path],
            known_hosts=None,  # single-user, trust on first use
            keepalive_interval=15,  # SSH-level keepalive
        )
        self._connections[machine.id] = conn
        self._heartbeat_tasks[machine.id] = asyncio.create_task(
            self._heartbeat_loop(machine.id, conn)
        )
        return conn

    async def _heartbeat_loop(self, machine_id: str, conn):
        """Periodic probe to detect dead connections."""
        while True:
            await asyncio.sleep(30)
            try:
                result = await asyncio.wait_for(
                    conn.run("echo ok", check=True), timeout=10
                )
            except (asyncssh.Error, asyncio.TimeoutError, OSError):
                await self._handle_disconnect(machine_id)
                break
```

### Pattern 3: Fernet Credential Encryption

**What:** Encrypt service credentials at rest in Postgres using Fernet symmetric encryption. Key comes from `LOCUS_ENCRYPTION_KEY` env var.

**Example:**
```python
# Source: cryptography docs + SQLAlchemy TypeDecorator pattern
from cryptography.fernet import Fernet
from sqlalchemy import TypeDecorator, Text

class EncryptedString(TypeDecorator):
    impl = Text
    cache_ok = True

    def __init__(self, key: bytes):
        super().__init__()
        self.fernet = Fernet(key)

    def process_bind_param(self, value, dialect):
        if value is not None:
            return self.fernet.encrypt(value.encode()).decode()
        return value

    def process_result_value(self, value, dialect):
        if value is not None:
            return self.fernet.decrypt(value.encode()).decode()
        return value
```

### Pattern 4: Three-Panel Layout

**What:** react-resizable-panels with three panels -- sidebar, center (terminals), right (collapsed in Phase 1).

**Example:**
```tsx
// Source: react-resizable-panels docs
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";

function AppShell() {
  return (
    <div className="h-screen flex flex-col bg-gray-950 text-gray-100">
      <TopBar />
      <MachineTabs />
      <PanelGroup direction="horizontal" className="flex-1">
        <Panel
          defaultSize={20}
          minSize={10}
          collapsible
          collapsedSize={0}
        >
          <Sidebar />
        </Panel>
        <PanelResizeHandle className="w-1 bg-gray-800 hover:bg-blue-500 transition-colors" />
        <Panel defaultSize={80} minSize={30}>
          <CenterPanel />
        </Panel>
        <PanelResizeHandle className="w-1 bg-gray-800 hover:bg-blue-500 transition-colors" />
        <Panel
          defaultSize={0}
          minSize={0}
          collapsible
          collapsedSize={0}
        >
          <RightPanel />
        </Panel>
      </PanelGroup>
    </div>
  );
}
```

### Pattern 5: Tmux Session Detection and Attachment

**What:** On SSH connect, run `tmux ls` to detect existing sessions, then either attach to a selected one or create a new one.

**Example:**
```python
# Source: tmux man pages + AsyncSSH docs
async def list_tmux_sessions(conn: asyncssh.SSHClientConnection) -> list[dict]:
    """List tmux sessions on remote machine."""
    try:
        result = await conn.run("tmux ls -F '#{session_name}:#{session_attached}:#{session_activity}'")
        sessions = []
        for line in result.stdout.strip().split("\n"):
            if line:
                name, attached, activity = line.split(":")
                sessions.append({
                    "name": name,
                    "attached": int(attached) > 0,
                    "last_activity": int(activity),
                })
        return sessions
    except asyncssh.ProcessError:
        return []  # no tmux server running

async def create_terminal_in_tmux(
    conn: asyncssh.SSHClientConnection,
    session_name: str | None = None,
    working_dir: str | None = None,
) -> asyncssh.SSHClientProcess:
    """Create or attach to a tmux session with PTY."""
    if session_name:
        command = f"tmux attach -t {session_name}"
    else:
        name = f"locus-{uuid4().hex[:8]}"
        cd = f" -c {working_dir}" if working_dir else ""
        command = f"tmux new-session -s {name}{cd}"

    return await conn.create_process(
        command,
        term_type="xterm-256color",
        term_size=(120, 40),
        encoding=None,
    )
```

### Anti-Patterns to Avoid
- **Multiplexing terminal streams over a single WebSocket:** Each terminal session must have its own WebSocket connection. Multiplexing adds framing complexity and makes flow control per-session impossible.
- **Using `@xterm/addon-attach` directly without a custom protocol:** The addon assumes a simple text WebSocket. Since we need a control channel (resize events, session metadata), use a custom handler that processes both binary terminal data and JSON control messages.
- **Storing SSH private keys in the database:** Store file paths only. Keys stay on disk where SSH agents and system permissions protect them.
- **Blocking the asyncio event loop with synchronous SSH:** AsyncSSH is async-native. Never use Paramiko or synchronous subprocess calls in the FastAPI event loop.
- **Using `command=None` without tmux:** Always wrap terminal sessions in tmux so they survive SSH reconnects (D-14).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Terminal emulation | Custom terminal renderer | @xterm/xterm | VT100/VT220/xterm escape sequence parsing is immensely complex |
| Panel resize/collapse | Custom drag-handle logic | react-resizable-panels | Handles edge cases: min/max sizes, collapse thresholds, persistence |
| Password hashing | Custom bcrypt wrapper | passlib CryptContext | Handles timing attacks, algorithm selection, migration |
| JWT creation/validation | Manual token building | PyJWT | Token expiry, signature verification, claim validation |
| Symmetric encryption | Custom AES wrapper | cryptography.Fernet | Authenticated encryption, timestamp, key rotation support |
| DB migrations | Manual ALTER TABLE | Alembic | Auto-generates from model diffs, rollback support |
| Terminal auto-sizing | Manual dimension calculation | @xterm/addon-fit | Calculates rows/cols from pixel dimensions correctly |

## Common Pitfalls

### Pitfall 1: WebSocket Binary vs Text Mode Confusion
**What goes wrong:** xterm.js sends text input as strings, but terminal output (especially 256-color escape sequences) must be binary. Mixing modes causes encoding errors or garbled output.
**Why it happens:** WebSocket has distinct text and binary frame types. The browser and server must agree on which to use.
**How to avoid:** Use a hybrid protocol -- terminal I/O as binary frames, control messages (resize, metadata) as JSON text frames. On the backend, check `data["type"]` in `websocket.receive()` to distinguish.
**Warning signs:** Garbled characters, Unicode decode errors, missing colors.

### Pitfall 2: Terminal Resize Race Conditions
**What goes wrong:** When a panel resizes, `addon-fit` recalculates dimensions and sends a resize event. If the SSH PTY size update arrives after data is already being rendered at the old size, display glitches occur.
**Why it happens:** Resize events are asynchronous across three systems (browser -> WebSocket -> SSH).
**How to avoid:** Debounce resize events on the frontend (100-150ms). Send resize before any queued input. On the backend, call `set_terminal_size()` immediately.
**Warning signs:** Text wrapping incorrectly after resize, vi/nano display corruption.

### Pitfall 3: SSH Connection Not Truly Dead
**What goes wrong:** TCP connection hangs without sending FIN. AsyncSSH keepalive may not detect it for minutes.
**Why it happens:** Network interruptions (Wi-Fi switch, VPN toggle) can leave TCP sockets in a half-open state.
**How to avoid:** Use both SSH-level `keepalive_interval` (15s) AND application-level heartbeat probes (30s via `conn.run("echo ok")`). Set `keepalive_count_max` to 3.
**Warning signs:** Machine shows "online" but terminals are frozen.

### Pitfall 4: AsyncSSH Process Cleanup on Disconnect
**What goes wrong:** WebSocket closes but the SSH process and PTY remain alive on the remote machine, accumulating zombie processes.
**Why it happens:** FastAPI WebSocket disconnect doesn't automatically clean up AsyncSSH processes.
**How to avoid:** Use `try/finally` blocks in the WebSocket handler. Call `process.close()` and wait for it. Register cleanup in FastAPI's lifespan handler for app shutdown.
**Warning signs:** `ps aux` on remote machines shows orphaned bash/tmux processes.

### Pitfall 5: Alembic with Async SQLAlchemy
**What goes wrong:** Alembic's default `env.py` uses synchronous connections. Running migrations with an async engine fails.
**Why it happens:** Alembic was written before async SQLAlchemy existed.
**How to avoid:** Use `run_async()` in `env.py` with `connectable.run_sync(do_run_migrations)`. See SQLAlchemy async docs for the standard pattern.
**Warning signs:** `MissingGreenlet` errors, migrations hanging.

### Pitfall 6: First-Run State Detection
**What goes wrong:** App doesn't know if it's a fresh install or returning user. Shows setup wizard to an existing user, or skips it for a new user.
**Why it happens:** No reliable flag for "has setup been completed."
**How to avoid:** Check if a user record exists in the database. No user = first run = show wizard. Store a `setup_completed` flag in a settings table as backup.
**Warning signs:** Setup wizard appearing after restart.

### Pitfall 7: Docker Compose Profile Misconfiguration
**What goes wrong:** Dev profile enables Vite dev server but production build tries to serve static files that don't exist (or vice versa).
**Why it happens:** Profile-conditional behavior must be consistent between Dockerfile build stages and Compose service definitions.
**How to avoid:** In production, multi-stage Dockerfile builds frontend and copies to backend's static directory. In dev, Vite runs as a separate process/container with HMR proxy. Use `VITE_API_URL` env var for API base.
**Warning signs:** 404 on frontend assets, CORS errors in dev mode.

## Code Examples

### Docker Compose (dev + prod profiles)
```yaml
# Source: Docker Compose docs
services:
  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: locus
      POSTGRES_USER: locus
      POSTGRES_PASSWORD: ${LOCUS_DB_PASSWORD}
    volumes:
      - pgdata:/var/lib/postgresql/data
    ports:
      - "5432:5432"
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U locus"]
      interval: 5s
      retries: 5

  app:
    build:
      context: .
      dockerfile: backend/Dockerfile
      target: production
    environment:
      LOCUS_DB_URL: postgresql+asyncpg://locus:${LOCUS_DB_PASSWORD}@db:5432/locus
      LOCUS_SECRET_KEY: ${LOCUS_SECRET_KEY}
      LOCUS_ENCRYPTION_KEY: ${LOCUS_ENCRYPTION_KEY}
    ports:
      - "8080:8080"
    depends_on:
      db:
        condition: service_healthy
    volumes:
      - ${SSH_KEY_DIR:-~/.ssh}:/home/locus/.ssh:ro

  app-dev:
    build:
      context: .
      dockerfile: backend/Dockerfile
      target: development
    profiles: ["dev"]
    environment:
      LOCUS_DB_URL: postgresql+asyncpg://locus:${LOCUS_DB_PASSWORD}@db:5432/locus
      LOCUS_SECRET_KEY: ${LOCUS_SECRET_KEY}
      LOCUS_ENCRYPTION_KEY: ${LOCUS_ENCRYPTION_KEY}
    ports:
      - "8000:8000"
    depends_on:
      db:
        condition: service_healthy
    volumes:
      - ./backend:/app
      - ${SSH_KEY_DIR:-~/.ssh}:/home/locus/.ssh:ro

  frontend-dev:
    build:
      context: ./frontend
      dockerfile: Dockerfile
      target: development
    profiles: ["dev"]
    ports:
      - "5173:5173"
    volumes:
      - ./frontend:/app
      - /app/node_modules
    environment:
      VITE_API_URL: http://localhost:8000

volumes:
  pgdata:
```

### Multi-stage Dockerfile (backend)
```dockerfile
# Source: Docker best practices
FROM node:22-slim AS frontend-build
WORKDIR /frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ .
RUN npm run build

FROM python:3.12-slim AS base
RUN apt-get update && apt-get install -y --no-install-recommends \
    git openssh-client && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

FROM base AS development
COPY backend/ .
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]

FROM base AS production
COPY backend/ .
COPY --from=frontend-build /frontend/dist /app/static
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8080"]
```

### Async Alembic env.py
```python
# Source: SQLAlchemy async migration docs
import asyncio
from alembic import context
from sqlalchemy.ext.asyncio import create_async_engine
from app.config import settings
from app.models import Base

def do_run_migrations(connection):
    context.configure(connection=connection, target_metadata=Base.metadata)
    with context.begin_transaction():
        context.run_migrations()

async def run_async_migrations():
    engine = create_async_engine(settings.database_url)
    async with engine.connect() as connection:
        await connection.run_sync(do_run_migrations)
    await engine.dispose()

def run_migrations_online():
    asyncio.run(run_async_migrations())

run_migrations_online()
```

### JWT Auth Flow
```python
# Source: FastAPI security docs
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
import jwt
from passlib.context import CryptContext

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")

def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)

def create_access_token(data: dict, expires_delta: timedelta) -> str:
    to_encode = data.copy()
    to_encode["exp"] = datetime.utcnow() + expires_delta
    return jwt.encode(to_encode, settings.secret_key, algorithm="HS256")

async def get_current_user(token: str = Depends(oauth2_scheme)):
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=["HS256"])
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Invalid token")
    # Single-user app: just verify token is valid
    return payload
```

### Claude Code Session Detection
```python
# Source: tmux + ps command patterns
async def detect_claude_sessions(conn: asyncssh.SSHClientConnection) -> list[dict]:
    """Detect running Claude Code sessions on a remote machine."""
    # Method 1: Check tmux windows with claude in the name/command
    try:
        result = await conn.run(
            "tmux list-windows -a -F '#{session_name}:#{window_index}:#{window_name}:#{pane_current_command}' 2>/dev/null"
        )
        sessions = []
        for line in result.stdout.strip().split("\n"):
            if not line:
                continue
            parts = line.split(":")
            if len(parts) >= 4 and "claude" in parts[3].lower():
                sessions.append({
                    "tmux_session": parts[0],
                    "window_index": int(parts[1]),
                    "window_name": parts[2],
                    "command": parts[3],
                })
        return sessions
    except asyncssh.ProcessError:
        return []
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `xterm` (unscoped) npm package | `@xterm/xterm` scoped packages | 2024 | Must use `@xterm/*` imports |
| Paramiko for Python SSH | AsyncSSH for async contexts | Ongoing | AsyncSSH is async-native, no thread executors needed |
| SQLAlchemy 1.x sync only | SQLAlchemy 2.0 async support | 2023 | `create_async_engine` + asyncpg is the standard pattern |
| passlib + python-jose | passlib + PyJWT | Ongoing | python-jose is unmaintained; PyJWT is actively maintained |
| Vite 5/6 | Vite 8 with Rolldown | 2025 | Significantly faster builds |
| Tailwind CSS v3 | Tailwind CSS v4 | 2025 | New engine, no `tailwind.config.js` needed (CSS-based config) |

**Deprecated/outdated:**
- `python-jose`: Unmaintained, use `PyJWT` instead
- `xterm` (unscoped): Deprecated, use `@xterm/xterm`
- `xterm-addon-fit` (unscoped): Deprecated, use `@xterm/addon-fit`
- Tailwind `tailwind.config.js`: v4 uses CSS-based configuration via `@config` directive

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Docker | Container orchestration | Yes | 29.3.0 | -- |
| Docker Compose | Service orchestration | Yes | v5.1.0 | -- |
| Node.js | Frontend build | Yes | 24.14.0 | -- |
| Python | Backend runtime | Yes | 3.12.3 | -- |
| npm | Package management | Yes | 11.9.0 | -- |
| PostgreSQL | Database | Via Docker | 16-alpine | -- |

**Missing dependencies with no fallback:** None -- all required tools available.

## Open Questions

1. **xterm.js addon-attach vs custom WebSocket handler**
   - What we know: `@xterm/addon-attach` provides simple WebSocket attachment but assumes pure text/binary data. We need a control channel for resize events.
   - What's unclear: Whether addon-attach can coexist with a custom message handler for control messages.
   - Recommendation: Skip addon-attach entirely. Write a custom hook that sends binary data for terminal I/O and JSON text frames for control messages. This is ~30 lines of code and gives full control.

2. **Claude Code session detection reliability**
   - What we know: Can detect via `tmux list-windows` and checking `pane_current_command`. Can also check for `claude` process via `ps`.
   - What's unclear: How reliably `pane_current_command` reflects the Claude Code process vs. a wrapper script.
   - Recommendation: Use multiple detection methods (tmux + ps) and combine results. Flag as needs-validation during implementation.

3. **SSH key access from Docker container**
   - What we know: Container needs access to SSH keys to connect to remote machines. Keys live on the host.
   - What's unclear: Best practice for mounting keys without copying them into the image.
   - Recommendation: Mount `~/.ssh` as read-only volume. Use `SSH_KEY_DIR` env var for custom paths. Document in `.env.example`.

4. **Tailwind CSS v4 configuration approach**
   - What we know: v4 replaced `tailwind.config.js` with CSS-based configuration.
   - What's unclear: Exact syntax for dark-mode-only setup in v4.
   - Recommendation: Since D-17 locks dark theme only, configure Tailwind with dark colors as defaults. No dark mode toggle needed.

## Sources

### Primary (HIGH confidence)
- [AsyncSSH API docs](https://asyncssh.readthedocs.io/en/latest/api.html) - `create_process`, `set_terminal_size`, `connect` signatures
- [FastAPI WebSocket docs](https://fastapi.tiangolo.com/advanced/websockets/) - WebSocket endpoint patterns
- [FastAPI Security/JWT docs](https://fastapi.tiangolo.com/tutorial/security/oauth2-jwt/) - OAuth2 + JWT pattern
- [react-resizable-panels docs](https://react-resizable-panels.vercel.app/) - collapsible panel API
- [xterm.js GitHub](https://github.com/xtermjs/xterm.js/) - addon-attach source, Terminal API
- npm/PyPI registry - verified all package versions 2026-03-23

### Secondary (MEDIUM confidence)
- [Miguel Grinberg - Encryption at Rest with SQLAlchemy](https://blog.miguelgrinberg.com/post/encryption-at-rest-with-sqlalchemy) - Fernet TypeDecorator pattern
- [SQLAlchemy DatabaseCrypt wiki](https://github.com/sqlalchemy/sqlalchemy/wiki/DatabaseCrypt) - encryption column patterns
- [AsyncSSH Issue #657](https://github.com/ronf/asyncssh/issues/657) - terminal size handling details
- [AsyncSSH Issue #526](https://github.com/ronf/asyncssh/issues/526) - `encoding=None` for binary mode

### Tertiary (LOW confidence)
- Claude Code session detection via tmux - based on tmux CLI documentation, not tested with actual Claude Code processes

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - all versions verified against registries, stack locked in CLAUDE.md
- Architecture: HIGH - WebSocket-SSH bridge pattern is well-documented, AsyncSSH API verified
- Pitfalls: HIGH - drawn from official docs, GitHub issues, and known async Python patterns
- Claude Code detection: LOW - untested detection method, needs validation

**Research date:** 2026-03-23
**Valid until:** 2026-04-22 (30 days -- stable stack, no fast-moving dependencies)
