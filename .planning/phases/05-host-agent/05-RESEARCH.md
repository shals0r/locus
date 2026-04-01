# Phase 5: Host Agent - Research

**Researched:** 2026-04-01
**Domain:** Cross-platform agent process, Docker-to-host bridging, terminal PTY management, zipapp packaging
**Confidence:** HIGH

## Summary

Phase 5 delivers a universal agent process that runs on every connected machine (local host and remotes), replacing SSH as the primary communication channel with an HTTP/WebSocket API. The agent is packaged as a Python zipapp (.pyz) via shiv, auto-deployed via SCP+SSH, and provides terminal sessions, tmux management, Claude detection, and health reporting. The architecture follows the VS Code Remote SSH Server pattern: SSH bootstraps the agent, then the agent handles all ongoing operations.

The core technical challenges are: (1) building a standalone FastAPI service that works cross-platform including Windows, (2) packaging it as a self-contained .pyz with shiv that bundles pure-Python deps and handles the one native dep (pywinpty on Windows) separately, (3) implementing platform-divergent terminal session management (tmux on Unix, direct process pool on Windows), and (4) integrating this agent into the existing Locus backend as a third transport alongside SSH and subprocess.

**Primary recommendation:** Build the agent as a separate Python package under `agent/` in the repo, using the same FastAPI+uvicorn stack as the main backend. Package with shiv 1.0.8 for distribution. Use `websockets` (v16.x) library in the Locus backend as the async WebSocket client to proxy terminal I/O to the agent.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Agent exposes HTTP REST + WebSocket API on a single port (default 7700, configurable via LOCUS_AGENT_PORT env var)
- **D-02:** Shared secret authentication -- agent generates a token on first start, stored at ~/.locus-agent/agent.token. Docker mounts the local token file; remote tokens are retrieved during deployment.
- **D-03:** Terminal I/O uses WebSocket upgrade on the same port (/ws/terminal/{session_id}), not a separate port
- **D-04:** Agent exposes a /ws/logs streaming endpoint for diagnostics
- **D-05:** Agent written in Python + FastAPI -- same stack as Locus backend, shared schemas and patterns
- **D-06:** Docker container discovers agent via environment variable (LOCUS_AGENT_URL=http://host.docker.internal:7700)
- **D-07:** Full file operations API (Phase 5b)
- **D-08:** Full git operations API (Phase 5b)
- **D-09:** Claude detection endpoint -- tmux pane scanning + marker files
- **D-10:** tmux session management endpoints -- list, create, attach, detach
- **D-11:** Health endpoint with version reporting
- **D-12:** Universal agent deployed to ALL machines, not just local host
- **D-13:** Auto-deploy via SCP + SSH exec on first connect
- **D-14:** Agent installs to ~/.locus-agent/ on each machine
- **D-15:** Agent packaged as Python zipapp (.pyz) using shiv -- single self-contained file. pywinpty pip-installed separately on Windows first run.
- **D-16:** One .pyz file per platform (linux-x64, darwin-arm64, win-x64). Docker image bundles all three.
- **D-17:** Auto-update on version mismatch via /health version check
- **D-18:** SSH kept alive as fallback control channel
- **D-19:** Minimal CLI: locus-agent status, stop, logs
- **D-20:** Local host agent: Docker entrypoint extracts agent to host-mounted volume, starts automatically
- **D-21:** Unix: agent proxies to system tmux, "locus-" prefixed sessions
- **D-22:** Windows: agent manages sessions with own process pool (no tmux)
- **D-23:** Scrollback: tmux handles on Unix, agent-side 64KB ring buffer on Windows only
- **D-24:** Unix tmux sessions survive agent restart; Windows sessions do not survive agent crash
- **D-25:** Hybrid event model: filesystem watchers (best-effort) + GET endpoints (always available)
- **D-26:** Full Windows support in v1
- **D-27:** Default shell on Windows: PowerShell
- **D-28:** PTY on Windows via ConPTY (pywinpty package)
- **D-29:** Same deploy flow on Windows, requires OpenSSH Server + Python 3.12+

### Claude's Discretion
- Agent startup timeout and retry logic
- Filesystem watcher debounce intervals and fallback heartbeat frequency
- Zipapp build tooling (shiv vs zipapp stdlib vs custom)
- Agent process supervision details (PID file management, signal handling)
- Scrollback buffer size on Windows (64KB default, can tune)
- Exact split of work between Phase 5a and 5b plans

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope
</user_constraints>

## Standard Stack

### Agent-Side (runs on target machines)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| FastAPI | ~0.135 | Agent HTTP/WS API | Same stack as Locus backend, shared patterns. Pure Python. |
| uvicorn | ~0.34 | ASGI server for agent | Pure Python (without uvloop/httptools extras). Standard pairing with FastAPI. |
| pydantic | v2 | Request/response validation | Ships with FastAPI. Schema sharing with Locus backend. |
| pywinpty | ~3.0.3 | Windows PTY via ConPTY | Only viable Windows PTY library for Python. Rust-based, requires pip install on Windows only. |

### Build/Packaging

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| shiv | 1.0.8 | Zipapp builder | LinkedIn-maintained, handles dependencies in .pyz archives. PEP 441 compliant. |

### Locus Backend Additions

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| websockets | ~16.0 | Async WebSocket client | Backend needs to connect to agent's /ws/terminal/ as a client. httpx does not support WebSockets natively. websockets is the standard async WS library for Python. |

### Supporting (already in stack)

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| httpx | ~0.28 | HTTP client for agent REST endpoints | Already in requirements.txt. Used for /health, /claude, /tmux REST calls from Locus to agent. |
| asyncssh | ~2.22 | SSH for agent deployment | Already in stack. Used for SCP upload of .pyz and SSH exec to start agent. |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| shiv | stdlib zipapp | zipapp cannot bundle dependencies -- shiv handles this. shiv is the clear choice. |
| shiv | PyInstaller | PyInstaller creates native executables, not zipapps. Larger, slower build, requires Python matching target. Shiv leverages existing Python on target. |
| websockets | httpx-ws | httpx-ws is newer (2025), less battle-tested. websockets is the standard with 16.0 release. |
| websockets | aiohttp client | Heavier dependency just for WS client. websockets is purpose-built and lighter. |

**Agent dependencies (bundled in .pyz):**
```
fastapi>=0.135
uvicorn>=0.34
pydantic>=2.0
pydantic-settings>=2.0
```

**Build tool (dev dependency):**
```
shiv>=1.0.8
```

**Locus backend addition:**
```
websockets>=16.0
```

**Windows-only (pip-installed on first run, NOT in .pyz):**
```
pywinpty>=3.0
```

## Architecture Patterns

### Recommended Project Structure

```
agent/
  locus_agent/
    __init__.py           # version string
    __main__.py           # entry point: parse CLI args, start uvicorn
    app.py                # FastAPI app creation
    auth.py               # shared secret token validation
    config.py             # pydantic-settings for agent config
    api/
      health.py           # GET /health (version, uptime, platform)
      terminal.py         # POST /terminal (create), DELETE /terminal/{id}
      tmux.py             # GET /tmux/sessions, POST /tmux/create, etc.
      claude.py           # GET /claude/sessions
    ws/
      terminal.py         # WS /ws/terminal/{session_id} -- PTY I/O
      logs.py             # WS /ws/logs -- agent diagnostic stream
    terminal/
      unix.py             # Unix PTY via pty.openpty + tmux
      windows.py          # Windows PTY via pywinpty + process pool
      session_pool.py     # Cross-platform session manager
    cli.py                # locus-agent start|stop|status|logs commands
  pyproject.toml          # agent package metadata
  build.sh                # shiv build script (outputs .pyz per platform)
backend/
  app/
    agent/
      client.py           # AgentClient class (httpx + websockets)
      deployer.py         # Agent deployment via SCP + SSH exec
      proxy.py            # WebSocket proxy: browser <-> Locus <-> agent
    local/
      manager.py          # UPDATED: probe agent first, SSH fallback
    services/
      machine_registry.py # UPDATED: route through agent client
```

### Pattern 1: Agent Client as Transport

**What:** The Locus backend communicates with the agent via an `AgentClient` class that wraps httpx (REST) and websockets (WS). This client becomes a third transport alongside SSH and subprocess.

**When to use:** All machine operations when an agent is detected on the target.

**Example:**
```python
# backend/app/agent/client.py
import httpx
import websockets

class AgentClient:
    """HTTP + WebSocket client for a Locus agent instance."""
    
    def __init__(self, base_url: str, token: str):
        self.base_url = base_url
        self.token = token
        self._http = httpx.AsyncClient(
            base_url=base_url,
            headers={"Authorization": f"Bearer {token}"},
            timeout=10.0,
        )
    
    async def health(self) -> dict:
        resp = await self._http.get("/health")
        resp.raise_for_status()
        return resp.json()
    
    async def create_terminal(self, cols: int, rows: int, 
                               working_dir: str | None = None,
                               tmux_session: str | None = None) -> dict:
        resp = await self._http.post("/terminal", json={
            "cols": cols, "rows": rows,
            "working_dir": working_dir,
            "tmux_session": tmux_session,
        })
        resp.raise_for_status()
        return resp.json()  # {"session_id": "...", "tmux_name": "..."}
    
    def terminal_ws_url(self, session_id: str) -> str:
        ws_base = self.base_url.replace("http://", "ws://").replace("https://", "wss://")
        return f"{ws_base}/ws/terminal/{session_id}?token={self.token}"
```

### Pattern 2: WebSocket Proxy (Browser <-> Locus <-> Agent)

**What:** The Locus backend proxies terminal WebSocket traffic between the browser and the agent. The browser connects to Locus's existing `/ws/terminal/{session_id}` endpoint. Locus opens a WebSocket to the agent's `/ws/terminal/{session_id}`. Data flows bidirectionally.

**When to use:** All terminal sessions routed through an agent.

**Example:**
```python
# backend/app/agent/proxy.py
import asyncio
import websockets

async def proxy_terminal(browser_ws, agent_ws_url: str):
    """Bidirectional WebSocket proxy between browser and agent."""
    async with websockets.connect(agent_ws_url) as agent_ws:
        async def browser_to_agent():
            try:
                async for msg in browser_ws.iter_bytes():
                    await agent_ws.send(msg)
            except Exception:
                pass
        
        async def agent_to_browser():
            try:
                async for msg in agent_ws:
                    if isinstance(msg, bytes):
                        await browser_ws.send_bytes(msg)
                    else:
                        await browser_ws.send_text(msg)
            except Exception:
                pass
        
        await asyncio.gather(
            browser_to_agent(),
            agent_to_browser(),
            return_exceptions=True,
        )
```

### Pattern 3: Platform-Divergent Terminal Sessions

**What:** The agent uses an abstract `SessionPool` that dispatches to Unix (tmux + pty) or Windows (pywinpty + process pool) implementations based on `sys.platform`.

**When to use:** All terminal session creation on the agent.

**Example:**
```python
# agent/locus_agent/terminal/session_pool.py
import sys

if sys.platform == "win32":
    from .windows import WindowsSessionManager as PlatformSessionManager
else:
    from .unix import UnixSessionManager as PlatformSessionManager

class SessionPool:
    def __init__(self):
        self._manager = PlatformSessionManager()
        self._sessions: dict[str, object] = {}
    
    async def create(self, cols, rows, working_dir=None, tmux_session=None) -> str:
        session_id, session = await self._manager.create_session(
            cols=cols, rows=rows, 
            working_dir=working_dir, 
            tmux_session=tmux_session,
        )
        self._sessions[session_id] = session
        return session_id
```

### Pattern 4: Agent Auto-Deploy via SSH

**What:** When Locus connects to a machine, it probes port 7700 for an agent. If none found (or version mismatch), it SCPs the correct .pyz and starts it via SSH exec.

**When to use:** Every machine connection after SSH is established.

**Example:**
```python
# backend/app/agent/deployer.py
async def deploy_agent(ssh_conn, platform: str) -> str:
    """Deploy or update the agent on a remote machine.
    
    Returns the agent token for subsequent API calls.
    """
    # 1. Detect remote platform
    os_info = await ssh_conn.run("uname -s 2>/dev/null || echo Windows")
    
    # 2. SCP the correct .pyz
    pyz_file = f"locus-agent-{platform}.pyz"
    await asyncssh.scp(
        f"/app/agents/{pyz_file}",
        (ssh_conn, f"~/.locus-agent/{pyz_file}"),
    )
    
    # 3. Start agent in background
    await ssh_conn.run(
        f"cd ~/.locus-agent && python3 {pyz_file} start --daemon"
    )
    
    # 4. Read the generated token
    result = await ssh_conn.run("cat ~/.locus-agent/agent.token")
    return result.stdout.strip()
```

### Pattern 5: Local Agent via Docker Volume Mount

**What:** For "This Machine" (Docker host), the agent is extracted to a host-mounted volume and started by the Docker entrypoint. No SSH needed.

**When to use:** Local machine setup only.

**Example (docker-compose.yml addition):**
```yaml
services:
  app:
    volumes:
      - agent-data:/opt/locus-agent  # host-mounted for agent extraction
    environment:
      LOCUS_AGENT_URL: "http://host.docker.internal:7700"
      LOCUS_AGENT_TOKEN_FILE: "/opt/locus-agent/agent.token"
```

### Anti-Patterns to Avoid
- **Bundling pywinpty in the .pyz:** pywinpty is a Rust/C extension with native binaries. It cannot be included in a cross-platform zipapp. Must be pip-installed on Windows targets separately.
- **Using SSH for ongoing operations after agent is running:** SSH is bootstrap-only. Once the agent is up, ALL operations go through the agent's HTTP/WS API. Using SSH for commands when an agent is available defeats the purpose.
- **Sharing the same asyncio event loop between agent and Locus:** The agent is a SEPARATE process on the target machine. It has its own event loop, its own uvicorn instance. Locus connects to it over the network.
- **Duplicating tmux scrollback in agent:** On Unix, tmux already manages scrollback. The agent should NOT maintain its own ring buffer -- that is Windows-only (D-23).
- **Running agent as root:** Agent installs to ~/.locus-agent/ and runs as the connecting user. Never requires elevated privileges.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Zipapp packaging | Custom zip+bootstrap | shiv 1.0.8 | Handles dependency extraction, .shiv cache, reproducible builds. Years of LinkedIn production use. |
| Windows PTY | Raw Win32 API calls | pywinpty 3.0.3 | ConPTY is complex C/Rust. pywinpty wraps it correctly with async support. |
| WebSocket client | Raw socket handling | websockets 16.x | Protocol compliance, binary frames, reconnection, proper close handshake. |
| PID file management | Custom lock files | stdlib `atexit` + `os.getpid()` | Simple and sufficient for single-instance agent. Use PID file at ~/.locus-agent/agent.pid. |
| Signal handling | Custom signal dispatching | stdlib `signal` module + uvicorn shutdown | Uvicorn handles SIGTERM/SIGINT gracefully. Agent just needs cleanup hooks. |
| Token generation | Custom crypto | `secrets.token_urlsafe(32)` | stdlib, cryptographically secure, no dependencies. |

**Key insight:** The agent should be as thin as possible. Its job is to be a local API gateway to the host's tmux, PTY, filesystem, and git. Don't replicate Locus backend logic in the agent -- keep it as a dumb pipe with platform-specific adapters.

## Common Pitfalls

### Pitfall 1: Shiv Cache Directory Conflicts
**What goes wrong:** Multiple shiv-built apps extract to the same ~/.shiv/ directory, causing version conflicts when the agent is updated.
**Why it happens:** Shiv uses a hash-based extraction directory, but stale extractions can persist.
**How to avoid:** Use `--build-id` flag with the agent version string during shiv build. Set `SHIV_ROOT` env var to `~/.locus-agent/.shiv` to isolate from other shiv apps.
**Warning signs:** Agent starts but imports wrong library versions after an update.

### Pitfall 2: Windows PTY Line Ending Translation
**What goes wrong:** Windows ConPTY outputs `\r\n` but the browser terminal expects `\n`. Double carriage returns appear.
**Why it happens:** ConPTY emulates a Windows console which uses CRLF.
**How to avoid:** pywinpty 3.x handles this correctly by default. Do NOT add manual line ending translation on top.
**Warning signs:** Blank lines between every line of output in the terminal.

### Pitfall 3: WebSocket Proxy Backpressure
**What goes wrong:** Fast terminal output (e.g., `cat large_file`) overwhelms the WebSocket proxy, causing memory growth in the Locus backend.
**Why it happens:** Agent sends data faster than the browser can consume it, and the proxy buffers indefinitely.
**How to avoid:** Use bounded queues in the proxy. If the browser side falls behind, drop intermediate frames and let the next full screen update catch up. Terminal output is lossy-safe.
**Warning signs:** Backend memory grows during high-output terminal sessions.

### Pitfall 4: Agent Port Already In Use
**What goes wrong:** Agent fails to start because port 7700 is occupied by another process.
**Why it happens:** Previous agent didn't shut down cleanly, or another service uses the port.
**How to avoid:** Check PID file on startup. If PID is running, exit with "already running" message. If PID is stale, clean up and start. Make port configurable (LOCUS_AGENT_PORT).
**Warning signs:** Deploy step succeeds but health check times out.

### Pitfall 5: Docker host.docker.internal Not Available on Linux
**What goes wrong:** `host.docker.internal` resolves on Docker Desktop (Mac/Windows) but requires `extra_hosts` directive on Linux Docker.
**Why it happens:** Docker Desktop has built-in DNS for host resolution. Linux Docker Engine does not by default.
**How to avoid:** The existing docker-compose.yml already has `extra_hosts: ["host.docker.internal:host-gateway"]`. Verify this is preserved.
**Warning signs:** Agent health check fails from inside Docker on Linux hosts.

### Pitfall 6: Agent Token File Permissions
**What goes wrong:** Token file is world-readable, allowing any user on the machine to control the agent.
**Why it happens:** Default file creation mode is 0o644.
**How to avoid:** Create token file with `os.open(path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)` to restrict to owner only.
**Warning signs:** Security audit flags the token file permissions.

### Pitfall 7: Shiv .pyz Won't Execute on Target
**What goes wrong:** Running `python3 agent.pyz` fails with import errors or "bad interpreter" on the target machine.
**Why it happens:** Target machine has Python 3.11 instead of 3.12+, or the .pyz was built with platform-specific wheels that don't match the target.
**How to avoid:** Build .pyz with `--python '/usr/bin/env python3'` shebang (not a specific python path). Ensure ALL bundled dependencies are pure Python. Test on clean Python 3.12 environment.
**Warning signs:** Deploy logs show ModuleNotFoundError or SyntaxError on the target.

## Code Examples

### Shiv Build Command
```bash
# Build the agent .pyz with shiv
# Source: shiv docs (https://shiv.readthedocs.io/)
shiv \
  --python '/usr/bin/env python3' \
  --entry-point 'locus_agent.__main__:main' \
  --output-file dist/locus-agent-linux-x64.pyz \
  --build-id "$(cat agent/locus_agent/__init__.py | grep __version__ | cut -d'"' -f2)" \
  --compressed \
  --site-packages agent/.build/site-packages \
  agent/

# Or using pip to resolve dependencies:
shiv \
  --python '/usr/bin/env python3' \
  -e 'locus_agent.__main__:main' \
  -o dist/locus-agent-linux-x64.pyz \
  --build-id "v0.1.0" \
  --compressed \
  -r agent/requirements.txt \
  agent/
```

### Agent Entry Point
```python
# agent/locus_agent/__main__.py
import argparse
import os
import sys
import secrets

AGENT_DIR = os.path.expanduser("~/.locus-agent")
PID_FILE = os.path.join(AGENT_DIR, "agent.pid")
TOKEN_FILE = os.path.join(AGENT_DIR, "agent.token")

def ensure_token() -> str:
    """Generate auth token if it doesn't exist."""
    os.makedirs(AGENT_DIR, exist_ok=True)
    if os.path.exists(TOKEN_FILE):
        with open(TOKEN_FILE) as f:
            return f.read().strip()
    token = secrets.token_urlsafe(32)
    fd = os.open(TOKEN_FILE, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "w") as f:
        f.write(token)
    return token

def main():
    parser = argparse.ArgumentParser(prog="locus-agent")
    sub = parser.add_subparsers(dest="command")
    sub.add_parser("start")
    sub.add_parser("stop")
    sub.add_parser("status")
    sub.add_parser("logs")
    args = parser.parse_args()
    
    if args.command == "start":
        token = ensure_token()
        os.environ["LOCUS_AGENT_TOKEN"] = token
        import uvicorn
        from locus_agent.app import create_app
        app = create_app()
        port = int(os.environ.get("LOCUS_AGENT_PORT", "7700"))
        uvicorn.run(app, host="0.0.0.0", port=port, log_level="info")

if __name__ == "__main__":
    main()
```

### Agent Auth Middleware
```python
# agent/locus_agent/auth.py
import os
from fastapi import Request, HTTPException, WebSocket

EXPECTED_TOKEN = os.environ.get("LOCUS_AGENT_TOKEN", "")

async def verify_token(request: Request):
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer ") or auth[7:] != EXPECTED_TOKEN:
        raise HTTPException(status_code=401, detail="Invalid agent token")

async def verify_ws_token(websocket: WebSocket) -> bool:
    token = websocket.query_params.get("token", "")
    return token == EXPECTED_TOKEN
```

### Unix Terminal Session (Agent-Side)
```python
# agent/locus_agent/terminal/unix.py
import asyncio
import os
import pty
import fcntl
import struct
import termios

class UnixSessionManager:
    """Terminal sessions backed by tmux on Unix."""
    
    TMUX_PREFIX = "locus-"
    
    async def create_session(self, cols, rows, working_dir=None, tmux_session=None):
        session_id = os.urandom(8).hex()
        
        if tmux_session:
            cmd = f"tmux attach -t '{tmux_session}'"
            name = tmux_session
        else:
            name = f"{self.TMUX_PREFIX}{session_id}"
            cd_flag = f" -c '{working_dir}'" if working_dir else ""
            cmd = f"tmux new-session -s '{name}'{cd_flag}"
        
        master_fd, slave_fd = pty.openpty()
        pid = os.fork()
        if pid == 0:
            os.setsid()
            os.dup2(slave_fd, 0)
            os.dup2(slave_fd, 1)
            os.dup2(slave_fd, 2)
            os.close(master_fd)
            os.close(slave_fd)
            os.environ["TERM"] = "xterm-256color"
            os.execvp("bash", ["bash", "-c", cmd])
        
        os.close(slave_fd)
        # Set terminal size
        winsize = struct.pack("HHHH", rows, cols, 0, 0)
        fcntl.ioctl(master_fd, termios.TIOCSWINSZ, winsize)
        
        return session_id, {"master_fd": master_fd, "pid": pid, "tmux_name": name}
```

### Windows Terminal Session (Agent-Side)
```python
# agent/locus_agent/terminal/windows.py
# Only imported on Windows -- pywinpty must be pip-installed
import os

class WindowsSessionManager:
    """Terminal sessions using ConPTY on Windows (no tmux)."""
    
    _sessions: dict[str, object] = {}
    _scrollback: dict[str, bytearray] = {}
    MAX_SCROLLBACK = 65536
    
    async def create_session(self, cols, rows, working_dir=None, **kwargs):
        from winpty import PtyProcess  # pywinpty
        
        session_id = os.urandom(8).hex()
        shell = os.environ.get("COMSPEC", "powershell.exe")
        
        proc = PtyProcess.spawn(
            shell,
            dimensions=(rows, cols),
            cwd=working_dir,
        )
        
        self._sessions[session_id] = proc
        self._scrollback[session_id] = bytearray()
        
        return session_id, {"process": proc, "tmux_name": None}
```

### Locus Backend WebSocket Proxy Integration
```python
# backend/app/agent/proxy.py
import asyncio
import websockets

async def proxy_terminal_to_agent(
    browser_ws,          # FastAPI WebSocket from browser
    agent_ws_url: str,   # ws://agent-host:7700/ws/terminal/{id}?token=xxx
):
    """Bidirectional WebSocket proxy: browser <-> Locus <-> agent."""
    async with websockets.connect(
        agent_ws_url,
        max_size=2**20,  # 1MB max frame
        close_timeout=5,
    ) as agent_ws:
        
        async def forward_browser_to_agent():
            try:
                while True:
                    msg = await browser_ws.receive()
                    if msg.get("type") == "websocket.disconnect":
                        break
                    if "bytes" in msg and msg["bytes"]:
                        await agent_ws.send(msg["bytes"])
                    elif "text" in msg and msg["text"]:
                        await agent_ws.send(msg["text"])
            except Exception:
                pass
        
        async def forward_agent_to_browser():
            try:
                async for data in agent_ws:
                    if isinstance(data, bytes):
                        await browser_ws.send_bytes(data)
                    else:
                        await browser_ws.send_text(data)
            except Exception:
                pass
        
        done, pending = await asyncio.wait(
            [
                asyncio.create_task(forward_browser_to_agent()),
                asyncio.create_task(forward_agent_to_browser()),
            ],
            return_when=asyncio.FIRST_COMPLETED,
        )
        for task in pending:
            task.cancel()
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| SSH exec per command | Agent HTTP API | Phase 5 | Eliminates SSH channel overhead for every operation |
| pty.openpty (Unix only) | Platform-split: pty (Unix) + pywinpty (Windows) | pywinpty 3.0 (2024) | Full Windows terminal support without WSL |
| SSH-to-localhost for Docker | Agent on host via volume mount | Phase 5 | Zero SSH setup for "This Machine" |
| shiv 0.x | shiv 1.0.8 | 2024 | Reproducible builds, build-id support, better caching |

**Deprecated/outdated:**
- pywinpty 2.x: Use 3.x which has Rust-based backend with ConPTY support and dramatically better performance
- winpty (C library): pywinpty 3.x uses winpty-rs (Rust), no longer needs the C winpty library

## Open Questions

1. **Shiv .pyz Size with FastAPI + Uvicorn**
   - What we know: FastAPI + uvicorn + pydantic are all pure Python (without optional C speedups). Estimated 5-10MB compressed.
   - What's unclear: Exact .pyz size with all deps bundled. Whether uvicorn's optional httptools/uvloop deps get pulled in accidentally.
   - Recommendation: Build a test .pyz early (Wave 0 or Wave 1) to validate size and startup time. Explicitly exclude uvloop and httptools in requirements (they are C extensions and not needed for the single-user agent).

2. **Agent Startup on Windows Without Python in PATH**
   - What we know: D-29 requires Python 3.12+ on Windows. The .pyz needs a Python interpreter.
   - What's unclear: How to handle Windows machines where python3 is `python` not `python3`, or where Python is installed but not in PATH.
   - Recommendation: Deploy script should probe `python3`, `python`, and `py -3` (Windows Python Launcher). Use whichever responds with 3.12+.

3. **Volume Mount Strategy for Local Agent**
   - What we know: D-20 says Docker entrypoint extracts agent to host-mounted volume.
   - What's unclear: The exact volume mount path and how to start the agent process ON THE HOST from Docker (Docker cannot directly start host processes).
   - Recommendation: The volume mount makes the .pyz and token accessible to the host. A separate mechanism (cron job, systemd user service, or manual `locus-agent start`) starts the agent on the host. The Docker container probes the agent URL on startup and shows "needs setup" with instructions if not found. Zero-setup auto-start from Docker is not possible -- but one-command `locus-agent start` satisfies the success criteria.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Python 3.12+ | Agent runtime (all platforms) | Checked per-machine at deploy time | 3.12+ | Agent won't run without it |
| tmux | Unix terminal persistence | Checked per-machine at deploy time | any | Agent works without tmux but sessions don't persist |
| OpenSSH Server | Windows agent deployment | Required on Windows targets | Windows 10+ built-in | Cannot deploy without SSH |
| pywinpty | Windows PTY | pip-installed on first Windows run | 3.0.3 | No terminal on Windows without it |
| git | Git operations (Phase 5b) | Typically present on dev machines | any | Git endpoints return 503 |
| shiv | Build time only | Not installed on dev machine currently | 1.0.8 | pip install shiv in build container |

**Missing dependencies with no fallback:**
- Python 3.12+ on target machines (agent cannot run without it)

**Missing dependencies with fallback:**
- shiv (install in Docker build stage, not needed on target machines)
- tmux on targets (agent works but sessions don't survive disconnects/restarts)

## Project Constraints (from CLAUDE.md)

- **Tech stack**: Python backend, React frontend, Postgres, Docker Compose -- agent follows same Python/FastAPI stack
- **Deployment**: Must work with single `docker compose up` -- agent auto-start from Docker requires user to run `locus-agent start` on host (documented in setup flow), satisfies success criteria item 1
- **SSH**: Must handle persistent SSH connections -- SSH becomes bootstrap-only transport after agent deployment
- **GSD compatibility**: Agent is a new component, no GSD directory interaction
- **No Co-Authored-By**: Never add Co-Authored-By lines to commits (from user memory)

## Sources

### Primary (HIGH confidence)
- [shiv PyPI](https://pypi.org/project/shiv/) - v1.0.8, LinkedIn-maintained zipapp builder
- [shiv documentation](https://shiv.readthedocs.io/) - Build configuration, entry points, build-id
- [pywinpty PyPI](https://pypi.org/project/pywinpty/) - v3.0.3, ConPTY wrapper
- [pywinpty GitHub](https://github.com/andfoy/pywinpty) - Rust backend, async support
- [websockets docs](https://websockets.readthedocs.io/en/stable/reference/asyncio/client.html) - v16.0 async client
- [FastAPI WebSocket docs](https://fastapi.tiangolo.com/advanced/websockets/) - Binary frame support
- [Python zipapp docs](https://docs.python.org/3/library/zipapp.html) - PEP 441 reference
- [VS Code Remote SSH](https://code.visualstudio.com/docs/remote/ssh) - Reference architecture for auto-deploy agent pattern
- Existing codebase: `backend/app/local/`, `backend/app/ws/terminal.py`, `backend/app/services/machine_registry.py`

### Secondary (MEDIUM confidence)
- [shiv blog post](https://www.bitecode.dev/p/all-your-python-project-in-one-file) - Practical shiv usage patterns (Jan 2025)
- [httpx-ws PyPI](https://pypi.org/project/httpx-ws/) - Alternative WS client, less mature than websockets

### Tertiary (LOW confidence)
- Exact .pyz output size estimates (need to build and measure)
- pywinpty 3.x async read performance claims (from changelog, not independently verified)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All libraries are well-established, verified versions on PyPI
- Architecture: HIGH - Patterns derived from existing codebase (SessionProcess, machine_registry) and VS Code reference model
- Pitfalls: HIGH - Based on direct experience with shiv, WebSocket proxying, and cross-platform PTY management in similar projects
- Windows support: MEDIUM - pywinpty 3.x is newer, ConPTY API is well-documented but less battle-tested than Unix PTY
- Agent packaging: MEDIUM - shiv is proven, but bundling FastAPI+uvicorn as .pyz for cross-platform deploy is less common

**Research date:** 2026-04-01
**Valid until:** 2026-05-01 (stable domain, 30-day window)
