<!-- GSD:project-start source:PROJECT.md -->
## Project

**Locus**

Locus is a Dockerized web app that gives engineers a single control plane for managing multiple repos, machines, Claude Code sessions, and work items. It combines a multi-machine terminal with an integrated diff/review surface and a universal work feed that ingests signals from any source — Jira, GitLab, GitHub, Google Calendar, Google Chat, Google Tasks, meeting transcripts, and anything else that can hit a webhook. GSD framework support is native and first-class across all repos.

**Core Value:** Open one tool and immediately know what needs attention, across every repo, machine, agent session, and work stream — then act on it without switching context.

### Constraints

- **Tech stack**: Python backend, React frontend, Postgres, Docker Compose — no negotiation
- **Deployment**: Must work with a single `docker compose up` — zero manual setup beyond env vars
- **Single-user**: No multi-tenancy, no shared state between instances
- **Git providers**: Must support both GitLab and GitHub from day 1
- **GSD compatibility**: Must work with existing `.planning/` directory structure and GSD command set
- **SSH**: Must handle persistent SSH connections with tmux support and graceful reconnection
<!-- GSD:project-end -->

<!-- GSD:stack-start source:research/STACK.md -->
## Technology Stack

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
### Real-Time Communication
| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| FastAPI WebSocket | (built-in) | Terminal streams, feed updates, repo state | Native WebSocket support in FastAPI. No need for Socket.IO -- it adds abstraction overhead and the fallback transports (long polling) are unnecessary for a desktop browser app. | HIGH |
- `/ws/terminal/{session_id}` -- terminal I/O streams
- `/ws/feed` -- work feed real-time updates
- `/ws/repos` -- repository state changes (branch, dirty status)
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
# Core
# SSH + Git
# HTTP client + scheduling
# Auth + security
# Dev dependencies
### Frontend (Node)
# Core
# Terminal
# Diff viewer
# UI
# CSS
# Dev
## Docker Compose Structure
## Key Architecture Decisions
### Why Not Socket.IO
### Why Separate WebSocket Endpoints (Not Multiplexing)
### Why GitPython Over Subprocess
### Why APScheduler Over Celery
### Why @git-diff-view/react (With Caution)
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
<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->
## Conventions

Conventions not yet established. Will populate as patterns emerge during development.
<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->
## Architecture

Architecture not yet mapped. Follow existing patterns found in the codebase.
<!-- GSD:architecture-end -->

<!-- GSD:workflow-start source:GSD defaults -->
## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:
- `/gsd:quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd:debug` for investigation and bug fixing
- `/gsd:execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.
<!-- GSD:workflow-end -->



<!-- GSD:profile-start -->
## Developer Profile

> Profile not yet configured. Run `/gsd:profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.
<!-- GSD:profile-end -->
