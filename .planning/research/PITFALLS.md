# Pitfalls Research

**Domain:** Engineering cockpit / developer control plane (SSH terminals, real-time feeds, multi-machine state)
**Researched:** 2026-03-23
**Confidence:** HIGH (domain-specific, verified against upstream issue trackers and documentation)

## Critical Pitfalls

### Pitfall 1: SSH Connection Silently Dies Without Notification

**What goes wrong:**
Long-running SSH connections (Paramiko/AsyncSSH) drop silently due to NAT timeouts, network interruptions, or remote server restarts. The client-side socket remains "open" but is actually dead. Commands hang indefinitely, and the user sees a frozen terminal with no error message. Paramiko's `set_keepalive()` sends keepalive packets, but if the server stops responding, connection closure depends on OS-level TCP stack behavior -- unpredictable and often takes minutes.

**Why it happens:**
TCP does not detect dead peers without explicit probes. NAT tables typically expire idle connections after 60-300 seconds. Paramiko lacks OpenSSH's `ServerAliveCountMax` equivalent, so there is no reliable "declare dead after N missed keepalives" mechanism built in.

**How to avoid:**
- Use AsyncSSH instead of Paramiko. AsyncSSH is async-native (fits the WebSocket architecture), 15x faster for multi-host scenarios, and has better timeout semantics.
- Implement application-level heartbeats: send a no-op command every 30 seconds, track response. If 3 consecutive heartbeats get no response, declare connection dead.
- Set TCP keepalive at the socket level (`SO_KEEPALIVE`, `TCP_KEEPIDLE=60`, `TCP_KEEPINTVL=10`, `TCP_KEEPCNT=3`) as a safety net below the application layer.
- Build a connection state machine: `CONNECTING -> CONNECTED -> HEARTBEAT_MISSED -> RECONNECTING -> CONNECTED`. Surface this state in the UI.

**Warning signs:**
- Terminals that "freeze" without error messages
- Users manually refreshing the page to recover terminals
- Reconnection logic that only triggers on explicit socket errors, never on timeouts

**Phase to address:**
Phase 1 (SSH/terminal foundation). This is load-bearing infrastructure -- if SSH management is unreliable, every feature built on top is unreliable.

---

### Pitfall 2: xterm.js WebGL Context Exhaustion With Multiple Terminals

**What goes wrong:**
Browsers enforce a hard limit on active WebGL contexts per page (typically 8-16 depending on browser). Each xterm.js instance using the WebGL addon consumes one context. Opening 5+ terminal tabs simultaneously causes context loss events, rendering black/blank terminal panes. The WebGL addon does not gracefully degrade -- it fails silently or throws an unhandled `webglcontextlost` event.

**Why it happens:**
xterm.js's WebGL renderer creates one context per terminal instance. The browser reclaims the oldest contexts when the limit is exceeded. Most developers test with 1-2 terminals and never hit the limit.

**How to avoid:**
- Use the canvas renderer (`@xterm/addon-canvas`) as the default, not WebGL. Canvas has no context limit and is "good enough" for a control plane (not a full-time terminal emulator).
- If WebGL is needed for performance: use a single shared WebGL context with `gl.scissor`/`gl.viewport` to render multiple terminals (this is an upstream-discussed approach but requires custom implementation).
- Only render terminals that are currently visible. Unmount/dispose xterm instances for hidden tabs. Re-attach when the user switches back.
- Listen for `webglcontextlost` events and fall back to canvas renderer automatically.

**Warning signs:**
- Black/blank terminal panes after opening several terminals
- Console errors about WebGL context loss
- Performance degradation that gets worse with each new terminal

**Phase to address:**
Phase 1 (terminal embedding). Must decide renderer strategy before building the multi-terminal UI.

---

### Pitfall 3: WebSocket State Divergence After Reconnection

**What goes wrong:**
After a WebSocket disconnects and reconnects, the server and client have diverged state. The server had active subscriptions, terminal session bindings, and a position in the feed stream. The client had buffered keystrokes and expectations about what data it should receive. Naive reconnection (just open a new socket) loses all of this context. The user sees a blank terminal, missing feed items, or duplicate data.

**Why it happens:**
Raw WebSocket provides zero state recovery. Most tutorials show reconnection as "just reconnect" without addressing the hard problem: state reconciliation. asyncio WebSocket objects are also not thread-safe -- calling `websocket.send()` from a different context (e.g., a background task thread) silently corrupts state.

**How to avoid:**
- Assign monotonically increasing sequence numbers to every server-to-client message. Client tracks last received sequence. On reconnect, client sends last sequence; server replays missed messages.
- Maintain a per-connection outbound buffer with TTL (last 5 minutes of messages). Replay on reconnect.
- Use a session ID that survives reconnection. Client sends session ID on reconnect; server rebinds the session rather than creating a new one.
- Implement exponential backoff with jitter for reconnection (cap at 30 seconds). Without jitter, all clients reconnect simultaneously after an outage (thundering herd).
- Never call WebSocket send from a thread -- use `asyncio.run_coroutine_threadsafe()` to marshal calls to the event loop.

**Warning signs:**
- Feed items appearing twice after reconnection
- Terminal sessions resetting to a blank screen on reconnect
- Server memory growing because old sessions are never cleaned up
- Occasional "silent corruption" where messages arrive garbled

**Phase to address:**
Phase 1 (WebSocket infrastructure). This is the transport layer for everything. Sequence numbers and session rebinding must be designed in from the start -- retrofitting is extremely painful.

---

### Pitfall 4: Browser Memory Exhaustion From Terminal Scrollback Buffers

**What goes wrong:**
Each xterm.js instance allocates memory for its scrollback buffer. A single 160x24 terminal with 5,000-line scrollback consumes ~34MB of memory. With 8 terminals open (one per repo), that is 270MB+ just for scrollback buffers. Add the DOM, React state, and feed data, and the browser tab can easily exceed 1GB, causing sluggishness, tab crashes, and OOM kills.

**Why it happens:**
Developers default to generous scrollback settings (5,000-10,000 lines) because "more is better." xterm.js stores the entire buffer in memory with rich cell metadata (attributes, colors, unicode data per character). This is far more memory-intensive than plain text.

**How to avoid:**
- Set scrollback to 1,000 lines maximum for embedded terminals (this is a control plane, not a primary terminal).
- Implement a "scrollback on demand" pattern: keep only 500 lines in the live buffer; persist older output to the backend and load it via pagination when the user scrolls up.
- Dispose terminal instances when tabs are hidden (not just pause rendering). Recreate and replay recent output when the user switches back.
- Monitor `performance.memory` (Chrome) and warn the user when memory usage exceeds a threshold.
- xterm.js has a 50MB hardcoded buffer limit per instance as a safety valve, but this is still far too much for multi-terminal scenarios.

**Warning signs:**
- Browser tab memory exceeding 500MB
- Page becoming sluggish after extended use (hours)
- Tab crashes on lower-memory devices
- `cat large-file.log` in a terminal causing the entire UI to freeze

**Phase to address:**
Phase 1 (terminal embedding). Scrollback limits and disposal strategy must be set before users start accumulating terminal history.

---

### Pitfall 5: Git Status Polling Storms Across Multiple Remote Machines

**What goes wrong:**
Polling `git status --porcelain` and `git log` across 8-10 repos on multiple remote machines every few seconds creates a cascade of SSH commands. Each poll involves SSH connection overhead + git process spawn + filesystem scan. On large repos, `git status` alone can spike CPU 20-30% per invocation. Multiply by repos and machines, and the polling load becomes the dominant resource consumer on remote machines, degrading the actual work happening there.

**Why it happens:**
Naive implementation polls all repos at a fixed interval regardless of activity. No distinction between "user is actively working in this repo" vs. "this repo hasn't changed in hours."

**How to avoid:**
- Use event-driven git state detection: run `inotifywait` or `fswatch` on the `.git` directory on remote machines, and only poll when a filesystem event occurs.
- Implement adaptive polling: active repo (user has terminal open) = poll every 10 seconds. Inactive repo = poll every 60 seconds. No terminal open = poll every 5 minutes.
- Use `git status --porcelain --untracked-files=no` to skip expensive untracked file scanning when only branch state is needed.
- Enable `core.fsmonitor` and `core.untrackedCache` on remote repos to speed up git status.
- Use SSH connection multiplexing (`ControlMaster`/`ControlPersist`) to avoid SSH handshake overhead on repeated commands to the same host.
- Use `git ls-remote` for remote ahead/behind checks instead of `git fetch` (lighter weight, read-only).

**Warning signs:**
- Remote machines showing high CPU when Locus is connected
- Git polling taking longer than the poll interval (polls stacking up)
- SSH connection count growing over time per remote machine

**Phase to address:**
Phase 2 (multi-repo management). This is where repo state visibility is built. The polling strategy must be designed, not just "setInterval everywhere."

---

### Pitfall 6: Credential Storage as Plain Text in Postgres

**What goes wrong:**
Third-party API tokens (GitLab, GitHub, Jira, Google) are stored as plain text in Postgres columns. If the database is compromised (backup leak, SQL injection, exposed port), all service credentials are immediately usable by the attacker. Since Locus connects to highly privileged APIs (git operations, Jira admin, Calendar), this is a severe blast radius.

**Why it happens:**
Single-user self-hosted apps feel "safe" -- the developer thinks "it's my machine, I'm the only user." This leads to skipping encryption because it adds complexity with no perceived benefit. The threat model ignores Docker volume exposure, backup file leaks, and accidental port exposure.

**How to avoid:**
- Encrypt all credentials at rest using Fernet symmetric encryption (from the `cryptography` library). Derive the encryption key from a master passphrase or environment variable, never stored in the database.
- The encryption key lives only in the environment (Docker secret or `.env` file), never in the database or code.
- Use column-level encryption, not full-disk encryption (which doesn't protect against SQL injection or application-level access).
- Implement a credential abstraction layer that decrypts on read and encrypts on write. No other code should ever see raw credential bytes.
- Rotate credentials periodically. Store the last rotation timestamp and surface warnings in the UI when credentials are stale (>90 days).

**Warning signs:**
- Credentials visible in database dumps or pgAdmin queries
- No encryption-related dependencies in `requirements.txt`
- Credential values appearing in application logs

**Phase to address:**
Phase 1 (database schema design). The credential storage pattern must be established before any integrations store tokens.

---

### Pitfall 7: Integration Worker Container Becomes an Unmanageable Process Zoo

**What goes wrong:**
The "single integrations runner container" pattern (multiple polling workers in one container) becomes unmanageable. Workers crash silently, leak memory, or get stuck in infinite retry loops. There is no process supervisor, so a dead worker stays dead until someone notices. A misbehaving worker (e.g., one that leaks file descriptors or memory) degrades all other workers in the same container because they share the same PID namespace and resource limits.

**Why it happens:**
The architecture decision to use one container instead of per-integration containers saves Docker overhead but trades it for process management complexity. Without a proper supervisor, the container's PID 1 process doesn't monitor children.

**How to avoid:**
- Use a process supervisor inside the container: `supervisord` or Python's `multiprocessing` with explicit health monitoring. Each worker is a supervised child process.
- Implement per-worker health checks: each worker exposes a `/health` endpoint or writes a heartbeat file. The supervisor restarts workers that fail health checks.
- Set per-worker resource limits using `resource.setrlimit()` (memory, file descriptors) to prevent one worker from starving others.
- Implement dead-letter handling: after N consecutive failures, disable the worker and surface an alert in the Locus UI rather than silently retrying forever.
- Log worker lifecycle events (start, stop, crash, restart) to the work feed itself so the user sees them.
- Design workers as stateless polling loops that can be killed and restarted at any time without data loss.

**Warning signs:**
- Integration data stops flowing with no error visible to the user
- Container memory growing linearly over time (worker memory leak)
- Workers logging the same error thousands of times (stuck retry loop)
- `docker stats` showing the integrations container consuming disproportionate resources

**Phase to address:**
Phase 3 (integrations framework). The worker lifecycle management and health monitoring must be built before Claude starts generating integration workers.

---

### Pitfall 8: Docker Compose Service Startup Race Conditions

**What goes wrong:**
The API server starts before Postgres has finished initialization. The first database query fails with a connection error. If the app doesn't retry, it crashes. If it retries with a naive loop, it may connect before migrations have run, hitting schema errors. The integrations runner container starts before the API server is ready, failing to register or fetch configuration.

**Why it happens:**
`depends_on` in Docker Compose only waits for the container to start, not for the service inside it to be ready. This is one of the most common Docker Compose mistakes and yet it catches developers every time.

**How to avoid:**
- Use `depends_on` with `condition: service_healthy` for all service dependencies.
- Define proper health checks in `docker-compose.yml`:
  - Postgres: `pg_isready -U locus -d locus` (interval: 5s, timeout: 5s, retries: 5)
  - API server: `curl -f http://localhost:8000/health` (interval: 5s, timeout: 5s, retries: 5)
- Do NOT use `curl` in health checks for minimal images -- use `wget` or write a small Python health check script.
- Run migrations as part of the API server entrypoint, after Postgres health check passes but before starting the web server.
- Implement connection retry with exponential backoff in the application itself as a defense-in-depth measure (do not rely solely on Docker health checks).

**Warning signs:**
- Intermittent "connection refused" errors on first startup
- `docker compose up` working on the second try but not the first
- Different startup behavior on fast vs. slow machines

**Phase to address:**
Phase 1 (Docker Compose setup). The compose file and health checks are foundational. Get this wrong and every developer's first experience is a broken startup.

---

### Pitfall 9: Feed Ingestion Endpoint Blocks on Processing

**What goes wrong:**
The `POST /api/feed/ingest` endpoint processes the webhook payload synchronously -- parsing, enriching, categorizing, and storing -- before returning a response. Webhook providers (GitHub, GitLab, Jira) expect responses within 10 seconds. If processing takes longer, the provider retries, creating duplicate events. Under load (CI pipeline generating many events), the endpoint becomes a bottleneck and starts dropping events or timing out.

**Why it happens:**
Synchronous processing is the obvious implementation. "Just handle it in the request" works fine in development with one event at a time. The failure only appears under real-world webhook burst patterns (e.g., a `git push` triggering 10 webhook events in rapid succession).

**How to avoid:**
- Adopt the verify-enqueue-ACK pattern: validate the webhook signature, write the raw payload to a processing queue (Postgres-backed queue or Redis), return 200 immediately.
- Process events asynchronously in a background worker. This decouples ingestion throughput from processing throughput.
- Implement idempotency: store a hash or provider delivery ID for each processed event. Skip duplicates caused by provider retries.
- For a single-user app, a simple Postgres-backed queue (insert row, background task polls) is sufficient. Do not add Redis/RabbitMQ complexity unless proven necessary.
- Set a 5-second hard timeout on the ingest endpoint. If validation alone takes longer than that, something is wrong.

**Warning signs:**
- Webhook providers showing delivery failures in their dashboards
- Duplicate feed items appearing
- Feed updates lagging behind actual events by minutes during busy periods

**Phase to address:**
Phase 2 (feed ingestion). The async processing pattern must be established before any real integrations start pushing data.

---

## Technical Debt Patterns

Shortcuts that seem reasonable but create long-term problems.

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Storing SSH passwords instead of using key-based auth | Easier initial setup | Security liability, no agent forwarding support | Never -- key-based auth from day 1 |
| Global WebSocket for all features (terminals + feed + state) | Simpler connection management | One slow consumer blocks all channels; no independent backpressure | MVP only, split into topic-based channels before Phase 3 |
| Polling git state from the API server process | No separate worker needed | Blocks API request handling during SSH commands | MVP only, move to background tasks in Phase 2 |
| Hardcoding integration poll intervals | Quick to implement | No way to tune without code changes | MVP only, make configurable in Phase 3 |
| In-memory session store for WebSocket state | No Redis dependency | Lost sessions on server restart, no horizontal scaling path | Acceptable for single-user, but persist session metadata to Postgres |

## Integration Gotchas

Common mistakes when connecting to external services.

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| GitLab API | Using personal access tokens with overly broad scopes | Create project-specific tokens with minimal scopes (read_api, read_repository). Store scope metadata alongside the token. |
| GitHub API | Ignoring rate limits (5,000 requests/hour for authenticated) | Track `X-RateLimit-Remaining` header. Pause polling when under 100 remaining. Surface rate limit status in the UI. |
| Jira API | Polling all issues instead of using JQL with `updated >` filter | Always filter by `updatedDate` in JQL queries. Store the last poll timestamp per integration. |
| Google Calendar | Polling the full event list on every check | Use `syncToken` from the previous response to get only changes since last sync. Store sync tokens in Postgres. |
| Google Chat | Assuming webhook URLs are permanent | Webhook URLs can be revoked or expire. Implement a health check that verifies webhook URL validity on startup. |

## Performance Traps

Patterns that work at small scale but fail as usage grows.

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Rendering all terminals in the DOM simultaneously | UI lag, high memory | Only mount visible terminal; dispose hidden ones | 4+ terminals open |
| Unbounded feed query (SELECT * FROM feed_items) | Slow page load, DB pressure | Always paginate (LIMIT 50), index on created_at | 1,000+ feed items |
| SSH connection per git command | Connection storms, fd exhaustion | Connection pool with multiplexing, max 2 connections per host | 5+ repos on same host |
| Storing full webhook payloads forever | Disk/DB growth | Retain raw payloads for 30 days, keep only extracted data long-term | 10,000+ events |
| Re-rendering React component tree on every WebSocket message | Frame drops, input lag | Batch WebSocket updates (requestAnimationFrame), use React.memo aggressively | 10+ messages/second |

## Security Mistakes

Domain-specific security issues beyond general web security.

| Mistake | Risk | Prevention |
|---------|------|------------|
| SSH private keys stored in Docker image layers | Key extraction from pulled/leaked images | Mount keys as Docker secrets or bind-mount from host. Never COPY keys into Dockerfile. |
| Webhook endpoints without signature verification | Attackers inject fake events into the feed | Verify HMAC signatures (GitHub: X-Hub-Signature-256, GitLab: X-Gitlab-Token) before processing |
| API tokens visible in Docker Compose environment variables | Exposed via `docker inspect` or compose file in version control | Use Docker secrets or `.env` file (gitignored). Never inline tokens in `docker-compose.yml`. |
| Terminal output logged to application logs | Sensitive data (passwords, tokens) from terminal sessions captured in log files | Never log terminal I/O. Only log metadata (session ID, connection state). |
| No HTTPS on the Locus instance | All traffic (including credentials, terminal I/O) sent in plain text | Use a reverse proxy (Caddy/nginx) with TLS even for single-user. Locus handles privileged operations over the wire. |

## UX Pitfalls

Common user experience mistakes in this domain.

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| No visual indicator of SSH connection state | User types into a dead terminal, keystrokes lost | Show connection state badge on each terminal tab (green/yellow/red). Buffer keystrokes during reconnection and replay. |
| Terminal resize flicker during panel resize | Jarring visual when adjusting the three-panel layout | Debounce resize events (150ms). Use CSS `contain: strict` on terminal container. Send SIGWINCH only after resize settles. |
| Feed items with no source attribution | User cannot tell where an item came from | Always show source icon + timestamp. Make items linkable back to the source system. |
| Command palette that searches synchronously | UI freezes on large result sets | Use a Web Worker for fuzzy search, or debounce input with 200ms delay. Pre-index searchable items. |
| Diff viewer that loads the entire file | Slow rendering for large files | Virtualized rendering (only render visible lines). Collapse unchanged sections by default. |

## "Looks Done But Isn't" Checklist

Things that appear complete but are missing critical pieces.

- [ ] **SSH Terminal:** Often missing proper SIGWINCH handling on resize -- verify terminal dimensions match after every panel resize
- [ ] **SSH Terminal:** Often missing UTF-8 encoding negotiation -- verify CJK characters and emoji render correctly
- [ ] **SSH Terminal:** Often missing clipboard integration -- verify Ctrl+Shift+C/V works in the embedded terminal
- [ ] **WebSocket:** Often missing cleanup of abandoned sessions -- verify server-side session timeout after 5 minutes of no heartbeat
- [ ] **Feed Ingest:** Often missing idempotency -- verify that replaying the same webhook payload does not create duplicate items
- [ ] **Feed Ingest:** Often missing timezone handling -- verify all timestamps are stored as UTC and displayed in local time
- [ ] **Git State:** Often missing detached HEAD handling -- verify the UI shows a meaningful state when HEAD is detached (not just "no branch")
- [ ] **Docker:** Often missing volume permissions -- verify Postgres data directory has correct ownership after a `docker compose down && up`
- [ ] **Docker:** Often missing graceful shutdown -- verify `docker compose down` sends SIGTERM to SSH connections and flushes buffers
- [ ] **Integrations:** Often missing rate limit backoff -- verify a 429 response pauses the worker, not triggers immediate retry

## Recovery Strategies

When pitfalls occur despite prevention, how to recover.

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| SSH connection dies silently | LOW | Auto-reconnect with session rebinding. tmux on remote ensures no work is lost. |
| WebGL context exhaustion | MEDIUM | Switch all terminals to canvas renderer at runtime. Requires restart of terminal instances but no data loss. |
| WebSocket state divergence | MEDIUM | Server maintains message buffer. On reconnect, replay from last client sequence number. Worst case: full state refresh. |
| Browser memory exhaustion | LOW | Dispose hidden terminals, reduce scrollback. User loses scrollback history but no active work. |
| Git polling storm | LOW | Immediately switch to event-driven + adaptive polling. No data loss, just reduced refresh frequency. |
| Credential exposure | HIGH | Rotate ALL exposed credentials immediately. Encrypt database column. Audit access logs for unauthorized use. |
| Integration worker stuck | LOW | Kill and restart the worker. If stateless (as designed), no data loss. Missed events caught by next poll cycle. |
| Docker startup race | LOW | Add health checks, restart. No data loss since Postgres has persistent volume. |
| Feed duplicate events | MEDIUM | Deduplicate by provider delivery ID. Run a one-time cleanup query. Add idempotency check to prevent recurrence. |

## Pitfall-to-Phase Mapping

How roadmap phases should address these pitfalls.

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| SSH silent death | Phase 1: SSH foundation | Simulate network interruption (iptables DROP), verify reconnection within 30 seconds |
| WebGL context limit | Phase 1: Terminal embedding | Open 8 terminals simultaneously, verify all render correctly |
| WebSocket state divergence | Phase 1: WebSocket infrastructure | Kill the WebSocket mid-stream, verify reconnection replays missed messages |
| Browser memory exhaustion | Phase 1: Terminal embedding | Open 8 terminals, run `seq 1 100000` in each, verify memory stays under 500MB |
| Git polling storms | Phase 2: Multi-repo management | Connect 10 repos on 3 machines, monitor remote CPU during polling |
| Credential plain text storage | Phase 1: Database schema | Query Postgres directly, verify all credential columns are encrypted |
| Integration worker chaos | Phase 3: Integrations framework | Kill a worker process, verify it restarts and resumes polling within 60 seconds |
| Docker startup race | Phase 1: Docker Compose setup | Run `docker compose up` 10 times on a cold start, verify 100% success rate |
| Feed ingestion blocking | Phase 2: Feed system | Send 50 webhooks in 1 second, verify all return 200 within 5 seconds |

## Sources

- [xterm.js Issue #4379: Support dozens of terminals on a single page](https://github.com/xtermjs/xterm.js/issues/4379)
- [xterm.js Issue #791: Buffer performance improvements](https://github.com/xtermjs/xterm.js/issues/791)
- [xterm.js Issue #2077: Flow control/back pressure](https://github.com/xtermjs/xterm.js/issues/2077)
- [xterm.js Flow Control Guide](https://xtermjs.org/docs/guides/flowcontrol/)
- [Paramiko Issue #2463: ServerAliveCountMax functionality](https://github.com/paramiko/paramiko/issues/2463)
- [Paramiko Issue #2073: Timing out despite constant activity](https://github.com/paramiko/paramiko/issues/2073)
- [Paramiko Transport documentation](https://docs.paramiko.org/en/stable/api/transport.html)
- [AsyncSSH documentation](https://asyncssh.readthedocs.io/)
- [Comparing Python SSH Libraries](https://elegantnetwork.github.io/posts/comparing-ssh/)
- [WebSocket Reconnection: State Sync and Recovery Guide](https://websocket.org/guides/reconnection/)
- [WebSocket Best Practices for Production Applications](https://websocket.org/guides/best-practices/)
- [Docker Compose Health Checks: A Practical Guide](https://www.tvaidyan.com/2025/02/13/health-checks-in-docker-compose-a-practical-guide/)
- [Avoid These Common Docker Compose Pitfalls](https://moldstud.com/articles/p-avoid-these-common-docker-compose-pitfalls-tips-and-best-practices)
- [Enterprise Realtime Webhooks Reliability Guide 2025](https://www.hooklistener.com/learn/realtime-webhooks-reliability)
- [How to Build Webhook Handlers in Python](https://oneuptime.com/blog/post/2026-01-25-webhook-handlers-python/view)
- [How to Optimize Git Repository Performance](https://oneuptime.com/blog/post/2026-01-24-git-repository-performance/view)

---
*Pitfalls research for: Engineering cockpit / developer control plane*
*Researched: 2026-03-23*
