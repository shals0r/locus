# Locus

A control plane for engineers who work across multiple repos, machines, and work streams.

Locus puts SSH terminals, git operations, code review, and a work feed into one interface — so you stop bouncing between six browser tabs, four terminal windows, and whatever project tracker your team picked this year.

It runs in Docker. You `docker compose up` and you're done.

## What it actually does

**Terminals everywhere.** SSH into your machines, get real terminals (xterm.js + tmux), persistent sessions that survive disconnects. Your local machine works too — no SSH config needed just to use the tool on localhost.

**Git without the tab switch.** See branch state, dirty files, ahead/behind counts. Fetch, pull, push, checkout, rebase — all from the sidebar. Diffs render inline with split/unified views.

**Work feed.** A single chronological stream of things that need your attention. Jira tickets, GitLab MRs, GitHub PRs, calendar events, chat messages, meeting action items — anything that can hit a webhook or be polled. Items get categorized: Now, Respond, Review, Prep, Follow up.

**Build your own integrations.** This is the weird one. Open the Integrator panel, type "connect to GitLab and watch for MR reviews assigned to me," and Claude writes a worker script, tests it against the live API, shows you a preview of real data, and deploys it. No templates, no config files. If the dry run fails, it rewrites the code and retries. Your credentials stay encrypted in the database — they're injected as env vars, never sent to the AI.

**Command palette.** `Cmd+K` to jump to any repo, machine, session, or action.

**Three-panel layout.** Resizable. Collapsible. Repo/machine sidebar on the left, terminal + diff in the center, work feed on the right. Drag the dividers where you want them.

## Status

This is in active development. Not released. Things that work:

- Docker stack with Postgres, backend, frontend (dev and prod modes)
- SSH terminal sessions with tmux and reconnection
- Local machine terminal (no SSH needed)
- Auth (single-user, JWT)
- Three-panel layout with resizable panels
- Git sidebar with branch state and operations
- Work feed with ingest API and task board
- Command palette
- GSD framework integration
- Integration runner with worker supervision
- Skills system (per-repo Claude commands)
- Integrator meta-skill (AI-built integrations)

Not yet built: code review / diff panel, MR review with AI annotations, host agent.

## Quick start

```bash
cp .env.example .env
# Edit .env — generate real values for LOCUS_SECRET_KEY and LOCUS_ENCRYPTION_KEY

docker compose up
```

Production mode runs on port **8080**. Frontend is bundled into the backend image.

For development (hot reload on both backend and frontend):

```bash
docker compose --profile dev up
```

- Backend: `http://localhost:8000`
- Frontend: `http://localhost:5173`

### Environment variables

| Variable | What it is |
|---|---|
| `LOCUS_DB_PASSWORD` | Postgres password |
| `LOCUS_SECRET_KEY` | JWT signing key. Generate with `openssl rand -hex 32` |
| `LOCUS_ENCRYPTION_KEY` | Fernet key for credential encryption. Generate with `python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"` |
| `SSH_KEY_DIR` | Path to your SSH keys. Defaults to `~/.ssh` |

## Stack

**Backend:** Python 3.12, FastAPI, SQLAlchemy 2 (async), AsyncSSH, APScheduler, Postgres 16

**Frontend:** React 19, TypeScript, Vite 8, Zustand, TanStack Query, xterm.js, Tailwind CSS 4

**Infrastructure:** Docker Compose, four services (db, app, app-dev, frontend-dev)

Everything is async. The backend uses asyncpg, AsyncSSH, and httpx — no sync drivers, no thread pool hacks. WebSocket connections are direct FastAPI endpoints, not Socket.IO.

## Architecture

```
frontend/src/
  components/    # React components (terminal, feed, sidebar, integrator, etc.)
  stores/        # Zustand state stores
  api/           # API client
  hooks/         # Custom hooks

backend/app/
  api/           # Route handlers
  services/      # Business logic
  models/        # SQLAlchemy models
  ssh/           # AsyncSSH connection management
  ws/            # WebSocket handlers (terminal I/O, feed updates)
  integrations/  # Worker runner + supervision
  local/         # Local machine support (no SSH)
```

The integrations runner supervises worker processes — standalone Python scripts that poll external services and POST items to the feed ingest API. Workers are hot-deployable (no restart required) and crash-resistant (auto-restart with backoff).

## Design decisions worth knowing about

**Why separate WebSocket endpoints instead of multiplexing.** `/ws/terminal/{session_id}`, `/ws/feed`, `/ws/repos` — each gets its own connection. Multiplexing adds a framing protocol and makes debugging harder. For a single-user app, a few extra WebSocket connections cost nothing.

**Why AsyncSSH over Paramiko.** Paramiko is sync-only. Wrapping it in thread executors to play nice with FastAPI's async loop is fragile and slow. AsyncSSH is native asyncio.

**Why APScheduler over Celery.** Celery needs a broker (Redis or RabbitMQ). That's another container to manage for a single-user app that just needs to poll APIs on intervals. APScheduler runs in-process.

**Why the Integrator uses Claude Code CLI, not the API.** Claude Code has filesystem access, can write and test worker scripts directly, and supports multi-turn sessions with `--resume`. The API would mean reimplementing all of that.

## License

Not yet decided.
