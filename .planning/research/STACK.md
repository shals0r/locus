# Technology Stack

**Project:** Locus -- Engineering Control Plane
**Researched:** 2026-03-23

## Recommended Stack

### Core Backend

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| FastAPI | ~0.135 | API framework + WebSocket server | Native async, WebSocket first-class, Pydantic validation built in, Starlette 1.0+ underneath. The standard Python API framework for 2025+. | HIGH |
| Uvicorn | ~0.34 | ASGI server | Production-grade async server, pairs with FastAPI. Single-worker sufficient for single-user app. | HIGH |
| Pydantic | v2 (bundled) | Request/response validation | Ships with FastAPI, used for webhook payload validation, settings management. V2 is 5-17x faster than v1. | HIGH |
| Python | 3.12+ | Runtime | 3.12 has major perf improvements, 3.13 available but 3.12 better tested in ecosystem. Docker base image `python:3.12-slim`. | HIGH |

### Database

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| PostgreSQL | 16 | Primary datastore | Required by project constraints. v16 stable, good Docker image support. | HIGH |
| SQLAlchemy | ~2.0.48 | ORM + async DB access | Industry standard Python ORM. 2.0 has first-class async support via `create_async_engine`. | HIGH |
| asyncpg | ~0.30 | Async Postgres driver | 3-5x faster than psycopg2 for async workloads. Required for SQLAlchemy async engine. | HIGH |
| Alembic | ~1.18 | Database migrations | Only real option for SQLAlchemy migrations. Auto-generates from model changes. | HIGH |

### SSH and Terminal

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| AsyncSSH | ~2.22.0 | SSH connection management | Native asyncio integration -- critical for FastAPI's async event loop. 2x faster than Paramiko in benchmarks. Supports tunneling, SFTP, and persistent connections. Paramiko is sync-only and would require thread executors. | HIGH |
| @xterm/xterm | ~6.0 | Browser terminal emulator | Industry standard -- powers VS Code, Theia, Hyper terminals. No real competitor. Scoped `@xterm/*` packages are the current maintained version (old `xterm` package is deprecated). | HIGH |
| @xterm/addon-fit | ~6.0 | Terminal auto-resize | Handles terminal resize events when panels collapse/expand. Essential for the three-panel layout. | HIGH |
| @xterm/addon-web-links | ~6.0 | Clickable URLs in terminal | Quality-of-life for terminal output. | MEDIUM |

### Git Operations

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| GitPython | ~3.1.46 | Git operations from Python | Higher-level API than pygit2, wraps git CLI. Easier for status/diff/branch/checkout operations Locus needs. pygit2 is faster but requires libgit2 C dependency and lower-level API -- overkill for this use case. | HIGH |

**Note on GitPython:** It shells out to `git` under the hood, which means it requires `git` installed in the Docker container. This is fine -- add `git` to the Dockerfile apt-get. The benefit is the API maps directly to git concepts developers already know.

### Frontend Core

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| React | 19 | UI framework | Required by project constraints. v19 is current stable. | HIGH |
| TypeScript | ~5.7 | Type safety | Non-negotiable for a project this complex. Catches terminal/WebSocket/state bugs at compile time. | HIGH |
| Vite | 8.x | Build tool + dev server | Current standard, replaced CRA entirely. v8 uses Rolldown bundler -- Linear reported builds dropping from 46s to 6s. | HIGH |
| Zustand | ~5.0 | Client state management | Lightweight, hook-based, no boilerplate. Perfect for single-user app. Redux Toolkit is overkill here -- Locus has no complex cross-cutting state logic, just panel states, connection status, and feed items. | HIGH |
| TanStack Query | ~5.95 | Server state / API caching | Handles API data fetching, caching, refetching, and WebSocket-triggered invalidation. Separates server state from UI state cleanly. ~20% smaller than v4. | HIGH |

### Diff Rendering

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| @git-diff-view/react | ~0.1.3 | Diff viewer component | GitHub-style UI out of the box, split + unified views, syntax highlighting, virtual scrolling for large diffs. Newer and better maintained than react-diff-viewer-continued. Supports both git unified diff parsing and direct file comparison. | MEDIUM |

**Fallback:** `react-diff-view` (~3.x) is more mature (higher downloads) but requires more manual setup. If `@git-diff-view/react` proves too immature at integration time, switch to `react-diff-view` with `refractor` for syntax highlighting.

### Real-Time Communication

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| FastAPI WebSocket | (built-in) | Terminal streams, feed updates, repo state | Native WebSocket support in FastAPI. No need for Socket.IO -- it adds abstraction overhead and the fallback transports (long polling) are unnecessary for a desktop browser app. | HIGH |

**Architecture:** Use separate WebSocket endpoints per concern:
- `/ws/terminal/{session_id}` -- terminal I/O streams
- `/ws/feed` -- work feed real-time updates
- `/ws/repos` -- repository state changes (branch, dirty status)

This avoids multiplexing complexity and lets the frontend connect/disconnect per panel.

### Background Tasks / Scheduling

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| APScheduler | ~3.11 | Polling workers in integrations runner | Lightweight, no broker dependency (no Redis/RabbitMQ). Runs in-process. Perfect for single-user polling workers that check Jira/GitLab/Calendar on intervals. Celery would require a separate broker service -- massive overkill for single-user. | HIGH |
| asyncio tasks | (stdlib) | Background async work | For non-scheduled background work (SSH keepalives, git status polling). No library needed, use `asyncio.create_task()`. | HIGH |

### UI Components and Styling

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| Tailwind CSS | ~4.0 | Utility-first styling | Fast iteration, no CSS-in-JS runtime cost. v4 has major engine rewrite, faster builds. Industry standard for new projects. | HIGH |
| cmdk | ~1.0 | Command palette | Lightweight, unstyled command palette. Powers Vercel, Linear, Raycast command palettes. Easy to customize. | MEDIUM |
| react-resizable-panels | ~2.x | Three-panel layout with drag handles | Purpose-built for collapsible/resizable panel layouts. Handles the sidebar + center + feed panel requirement. | MEDIUM |

### API / HTTP Client

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| httpx | ~0.28 | Async HTTP client (backend) | Async-native, used for outbound API calls to GitLab/GitHub/Jira from the integrations runner. Replaces requests for async contexts. | HIGH |

### Docker / Infrastructure

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| Docker Compose | v2 | Orchestration | Required by project constraints. Three services: `app`, `db`, `integrations`. | HIGH |
| PostgreSQL 16 (Docker) | `postgres:16-alpine` | Database container | Alpine for smaller image. | HIGH |
| Python 3.12 slim | `python:3.12-slim` | App + integrations base image | Slim reduces image size. Needs `git` and `openssh-client` added via apt. | HIGH |
| Node 22 LTS | Build stage only | Frontend build | Multi-stage Docker build: Node stage builds frontend, Python stage serves it. | HIGH |

### Testing

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| pytest | ~8.x | Backend testing | Standard Python testing. | HIGH |
| pytest-asyncio | ~0.24 | Async test support | Required for testing FastAPI async endpoints and AsyncSSH. | HIGH |
| httpx (TestClient) | (see above) | API testing | FastAPI's recommended test client. | HIGH |
| Vitest | ~3.x | Frontend testing | Ships with Vite ecosystem, faster than Jest, native ESM. | HIGH |

## Alternatives Considered

| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| API Framework | FastAPI | Django + Channels | Django's ORM is sync-first, Channels adds complexity. FastAPI is async-native. |
| API Framework | FastAPI | Litestar | Smaller ecosystem, fewer examples. FastAPI is more battle-tested. |
| SSH Library | AsyncSSH | Paramiko | Sync-only, requires thread executors in async context. 2x slower in benchmarks. |
| Git Library | GitPython | pygit2 | Requires libgit2 C dependency, lower-level API. GitPython's CLI wrapper is sufficient and simpler. |
| Git Library | GitPython | subprocess + git CLI | GitPython provides structured output parsing. Raw subprocess means manual parsing of every command. |
| State Management | Zustand | Redux Toolkit | Overkill for single-user app. Zustand has less boilerplate, simpler mental model. |
| State Management | Zustand | Jotai | Zustand better for store-based patterns (connection state, panel layout). Jotai better for atomic/granular state. |
| Terminal | @xterm/xterm | Hterm | Less maintained, smaller ecosystem, fewer addons. xterm.js is the industry standard. |
| Diff Viewer | @git-diff-view/react | react-diff-viewer-continued | Doesn't parse git unified diff format natively -- requires pre-processing. |
| Task Queue | APScheduler | Celery | Requires Redis/RabbitMQ broker. Massive overkill for single-user polling. |
| Task Queue | APScheduler | Dramatiq | Also requires broker. Same overkill problem. |
| HTTP Client | httpx | aiohttp | httpx has cleaner API, similar performance, better maintained. |
| Build Tool | Vite 8 | Webpack | Slower, more config. Vite is the standard for new React projects. |
| CSS | Tailwind | styled-components | Runtime CSS-in-JS has performance overhead. Tailwind is zero-runtime. |
| DB Driver | asyncpg | psycopg3 (async) | asyncpg is faster and more battle-tested for async SQLAlchemy. |

## Installation

### Backend (Python)

```bash
# Core
pip install "fastapi[standard]" uvicorn sqlalchemy[asyncio] asyncpg alembic

# SSH + Git
pip install asyncssh gitpython

# HTTP client + scheduling
pip install httpx apscheduler

# Auth + security
pip install python-jose[cryptography] passlib[bcrypt]

# Dev dependencies
pip install pytest pytest-asyncio ruff mypy
```

### Frontend (Node)

```bash
# Core
npm install react react-dom @tanstack/react-query zustand

# Terminal
npm install @xterm/xterm @xterm/addon-fit @xterm/addon-web-links

# Diff viewer
npm install @git-diff-view/react

# UI
npm install react-resizable-panels cmdk

# CSS
npm install -D tailwindcss @tailwindcss/vite

# Dev
npm install -D typescript @types/react @types/react-dom vite @vitejs/plugin-react vitest
```

## Docker Compose Structure

```yaml
services:
  app:
    build: .
    ports:
      - "8080:8080"
    depends_on:
      db:
        condition: service_healthy
    env_file: .env
    volumes:
      - ssh-keys:/app/ssh-keys

  db:
    image: postgres:16-alpine
    volumes:
      - pgdata:/var/lib/postgresql/data
    environment:
      POSTGRES_DB: locus
      POSTGRES_USER: locus
      POSTGRES_PASSWORD: ${DB_PASSWORD}
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U locus"]
      interval: 5s
      timeout: 5s
      retries: 5

  integrations:
    build:
      context: .
      dockerfile: Dockerfile.integrations
    depends_on:
      db:
        condition: service_healthy
    env_file: .env

volumes:
  pgdata:
  ssh-keys:
```

## Key Architecture Decisions

### Why Not Socket.IO

Socket.IO adds an abstraction layer with fallback transports (long polling, etc.) that are unnecessary when the only client is a modern desktop browser. Native WebSocket via FastAPI is simpler, has less overhead, and avoids the Socket.IO client dependency. The reconnection logic Socket.IO provides can be replicated with 20 lines of client-side code.

### Why Separate WebSocket Endpoints (Not Multiplexing)

Terminal streams are high-throughput binary data. Feed updates are low-frequency JSON. Mixing them on one WebSocket requires a framing protocol. Separate endpoints let each connection type optimize independently and simplify debugging.

### Why GitPython Over Subprocess

While GitPython wraps the git CLI internally, it provides structured Python objects for commits, diffs, branches, and status. Using raw `subprocess.run(["git", ...])` means parsing text output for every operation. GitPython handles encoding, error cases, and output parsing.

### Why APScheduler Over Celery

Locus is single-user. The integrations runner polls external services (Jira, GitLab, Calendar) on intervals. APScheduler runs in-process with no external dependencies. Celery requires a Redis or RabbitMQ broker service, worker processes, and a beat scheduler -- three additional moving parts for a use case that APScheduler handles with zero infrastructure.

### Why @git-diff-view/react (With Caution)

This is the riskiest choice in the stack. It has only ~25K weekly downloads compared to react-diff-viewer's ~73K. However, it natively parses git unified diff output (which is what GitPython produces), has GitHub-style rendering, and supports virtual scrolling for large diffs. If it proves too immature, `react-diff-view` is the fallback -- it's more mature but requires more glue code.

## Sources

- [FastAPI official docs](https://fastapi.tiangolo.com/)
- [FastAPI WebSocket docs](https://fastapi.tiangolo.com/advanced/websockets/)
- [AsyncSSH PyPI](https://pypi.org/project/asyncssh/) -- v2.22.0
- [AsyncSSH docs](https://asyncssh.readthedocs.io/)
- [xterm.js GitHub](https://github.com/xtermjs/xterm.js/) -- migrated to @xterm/* scoped packages
- [GitPython PyPI](https://pypi.org/project/GitPython/) -- v3.1.46
- [SQLAlchemy PyPI](https://pypi.org/project/SQLAlchemy/) -- v2.0.48
- [Alembic docs](https://alembic.sqlalchemy.org/) -- v1.18.4
- [Vite 8 announcement](https://vite.dev/blog/announcing-vite8)
- [Zustand npm](https://www.npmjs.com/package/zustand) -- v5.0.11
- [TanStack Query npm](https://www.npmjs.com/package/@tanstack/react-query) -- v5.95.0
- [@git-diff-view/react npm](https://www.npmjs.com/package/@git-diff-view/react) -- v0.1.3
- [FastAPI release notes](https://fastapi.tiangolo.com/release-notes/) -- v0.135.1
- [Async SQLAlchemy + FastAPI patterns](https://leapcell.io/blog/building-high-performance-async-apis-with-fastapi-sqlalchemy-2-0-and-asyncpg)
