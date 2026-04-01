# Phase 5: Host Agent - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-01
**Phase:** 05-host-agent
**Areas discussed:** Communication Protocol, Agent Lifecycle & Packaging, Session Persistence, Windows Support

---

## Communication Protocol

| Option | Description | Selected |
|--------|-------------|----------|
| HTTP REST over TCP | Agent listens on TCP port, Docker connects via host.docker.internal. WebSocket upgrade for terminals. | ✓ |
| Unix socket (volume mount) | Agent creates .sock on host, mounted into Docker. No network exposure. | |
| gRPC | Typed RPC with protobuf. Bidirectional streaming. | |

**User's choice:** HTTP REST over TCP
**Notes:** Simple, debuggable with curl, no socket mount needed.

| Option | Description | Selected |
|--------|-------------|----------|
| Shared secret | Agent generates token, Docker mounts file | ✓ |
| Localhost-only, no auth | Bind to 127.0.0.1 only | |
| You decide | Claude picks | |

**User's choice:** Shared secret

| Option | Description | Selected |
|--------|-------------|----------|
| Port 7700 | Easy to remember, env var override | ✓ |
| Random + discovery | Free port, write to file | |
| You decide | Claude picks | |

**User's choice:** Port 7700

| Option | Description | Selected |
|--------|-------------|----------|
| Same port, WS upgrade | HTTP + WS on :7700, /ws/terminal/{session_id} | ✓ |
| Separate port for terminals | Dedicated port for raw PTY streams | |

**User's choice:** Same port, WS upgrade

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, /ws/logs endpoint | Locus can show agent health/logs | ✓ |
| No, just file logs | Agent logs to file on host | |
| You decide | Claude picks | |

**User's choice:** Yes, /ws/logs endpoint

| Option | Description | Selected |
|--------|-------------|----------|
| Python + FastAPI | Same stack as Locus backend, shared schemas | ✓ |
| Python + aiohttp | Lighter, different patterns | |
| Go single binary | No runtime dependency, separate language | |

**User's choice:** Python + FastAPI

| Option | Description | Selected |
|--------|-------------|----------|
| Environment variable | LOCUS_AGENT_URL in docker-compose.yml | ✓ |
| Auto-probe on startup | Try host.docker.internal:7700 | |
| Both: env var + fallback probe | Use env var if set, otherwise probe | |

**User's choice:** Environment variable

---

## Agent Lifecycle & Packaging

**Major scope change:** User clarified the agent should be deployed to ALL machines (not just local host), similar to VS Code's SSH remote server. Zero setup for the end user.

| Option | Description | Selected |
|--------|-------------|----------|
| SCP + SSH exec | Upload tarball via SCP, start via SSH exec | ✓ |
| SSH + pip install from PyPI | pip install on remote, needs internet | |
| You decide | Claude picks | |

**User's choice:** SCP + SSH exec
**Notes:** Same flow as VS Code deploying vscode-server.

| Option | Description | Selected |
|--------|-------------|----------|
| Docker entrypoint starts it | Extract agent to host-mounted volume, start automatically | ✓ |
| First-launch prompt | One-time copy-paste command | |
| You decide | Claude picks | |

**User's choice:** Docker entrypoint starts it

| Option | Description | Selected |
|--------|-------------|----------|
| Auto-update on version mismatch | Agent reports version via /health, re-deploy if mismatch | ✓ |
| Notify + manual | Banner in UI, user clicks to update | |
| You decide | Claude picks | |

**User's choice:** Auto-update on version mismatch

| Option | Description | Selected |
|--------|-------------|----------|
| Keep SSH as fallback | SSH stays as control channel, restart agent if it crashes | ✓ |
| Drop SSH after deploy | Close SSH once agent is running | |
| You decide | Claude picks | |

**User's choice:** Keep SSH as fallback

| Option | Description | Selected |
|--------|-------------|----------|
| ~/.locus-agent/ | Hidden dir in user's home, like ~/.vscode-server/ | ✓ |
| /opt/locus-agent/ | System-level path, may need sudo | |
| You decide | Claude picks | |

**User's choice:** ~/.locus-agent/

| Option | Description | Selected |
|--------|-------------|----------|
| Minimal CLI | status, stop, logs commands for debugging | ✓ |
| No CLI, fully managed | Invisible to user | |
| You decide | Claude picks | |

**User's choice:** Minimal CLI

| Option | Description | Selected |
|--------|-------------|----------|
| Bundled venv | Pre-built virtualenv with all deps in tarball | ✓ |
| pip install in venv | Create venv on remote, pip install | |
| Stdlib only | No external deps | |

**User's choice:** Bundled venv
**Notes:** Guaranteed to work on airgapped machines. ~20-30MB upload.

---

## Session Persistence

| Option | Description | Selected |
|--------|-------------|----------|
| tmux scrollback on Unix, agent buffer on Windows | No duplication on Unix, 64KB buffer on Windows only | ✓ |
| Agent buffer always | 64KB ring buffer on all platforms | |
| You decide | Claude picks | |

**User's choice:** tmux scrollback on Unix, agent buffer on Windows only

| Option | Description | Selected |
|--------|-------------|----------|
| Sessions + scrollback survive | Unix: tmux survives. Windows: save state to disk, show "session ended" on restart | ✓ |
| Unix survives, Windows doesn't | Accept Windows limitations | |
| You decide | Claude picks | |

**User's choice:** Sessions + scrollback survive

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, full file API | read, write, list, stat, search endpoints | ✓ |
| Terminals + Claude only | File ops still via SSH | |
| You decide | Claude picks | |

**User's choice:** Yes, full file API

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, git API endpoints | /git/* endpoints for all git operations | ✓ |
| Git stays over SSH exec | Keep current approach | |
| You decide | Claude picks | |

**User's choice:** Yes, git API endpoints

| Option | Description | Selected |
|--------|-------------|----------|
| Agent pushes events | Filesystem watchers + persistent WebSocket to Locus | ✓ |
| Locus polls the agent | Periodic API calls | |
| You decide | Claude picks | |

**User's choice:** Agent pushes events

---

## Windows Support

| Option | Description | Selected |
|--------|-------------|----------|
| PowerShell | Default on modern Windows | ✓ |
| cmd.exe | Classic Windows shell | |
| Detect and offer choice | Let user pick per-session | |

**User's choice:** PowerShell

| Option | Description | Selected |
|--------|-------------|----------|
| SCP + SSH exec, same as Unix | Requires OpenSSH Server + Python on Windows | ✓ |
| Different Windows flow | Separate installer (MSI/exe) | |

**User's choice:** SCP + SSH exec, same as Unix

| Option | Description | Selected |
|--------|-------------|----------|
| ConPTY (pywinpty) | Native Windows pseudo-terminal, full VT100 support | ✓ |
| Raw subprocess (no PTY) | Pipe stdin/stdout, degraded experience | |
| You decide | Claude picks | |

**User's choice:** ConPTY

| Option | Description | Selected |
|--------|-------------|----------|
| Per-platform tarballs | linux-x64, darwin-arm64, win-x64 bundled in Docker image | ✓ |
| Single universal package | One tarball with conditional imports | |

**User's choice:** Per-platform tarballs

---

## Claude's Discretion

- Agent startup timeout and retry logic
- Filesystem watcher debounce intervals
- Exact tarball compression format and structure
- Agent process supervision details
- Scrollback buffer size on Windows

## Deferred Ideas

None — discussion stayed within phase scope
