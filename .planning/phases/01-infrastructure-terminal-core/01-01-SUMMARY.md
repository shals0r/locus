---
phase: 01-infrastructure-terminal-core
plan: 01
subsystem: infra
tags: [docker, fastapi, sqlalchemy, asyncpg, alembic, react, vite, tailwind, typescript]

requires: []
provides:
  - Docker Compose orchestration with dev/prod profiles
  - FastAPI application skeleton with health endpoint and CORS
  - Async SQLAlchemy database engine with asyncpg driver
  - Database models: User, Machine, Credential, TerminalSession
  - Alembic async migration infrastructure
  - React + Vite + Tailwind v4 frontend skeleton
  - TypeScript types mirroring backend models
  - API client with JWT auth and WebSocket URL builder
  - Pydantic Settings config with LOCUS_ env prefix
affects: [01-02, 01-03, 01-04, 01-05, 01-06, 01-07]

tech-stack:
  added: [fastapi, uvicorn, sqlalchemy, asyncpg, alembic, pyjwt, passlib, bcrypt, cryptography, pydantic-settings, asyncssh, httpx, react, vite, tailwindcss, zustand, tanstack-query, xterm.js, react-resizable-panels, lucide-react]
  patterns: [async-sqlalchemy-engine, pydantic-settings-config, fastapi-lifespan, multi-stage-dockerfile, tailwind-v4-css-themes]

key-files:
  created:
    - docker-compose.yml
    - .env.example
    - backend/Dockerfile
    - backend/requirements.txt
    - backend/app/main.py
    - backend/app/config.py
    - backend/app/database.py
    - backend/app/models/user.py
    - backend/app/models/machine.py
    - backend/app/models/credential.py
    - backend/app/models/session.py
    - backend/alembic.ini
    - backend/alembic/env.py
    - frontend/package.json
    - frontend/Dockerfile
    - frontend/vite.config.ts
    - frontend/src/main.css
    - frontend/src/App.tsx
    - frontend/src/types/index.ts
    - frontend/src/api/client.ts
  modified: []

key-decisions:
  - "Used AliasChoices for LOCUS_DB_URL env var mapping instead of env_mapping (pydantic-settings v2 pattern)"
  - "Used Base.metadata.create_all in lifespan for dev simplicity, Alembic configured for production migrations"
  - "Tailwind v4 CSS-based config with @theme block for design tokens instead of tailwind.config.ts"

patterns-established:
  - "Async SQLAlchemy pattern: create_async_engine + async_sessionmaker + get_db generator"
  - "Pydantic Settings with LOCUS_ env prefix for all config"
  - "Multi-stage Dockerfile: frontend-build, base, development, production"
  - "Docker Compose profiles: dev for hot-reload services"
  - "Tailwind v4 @theme design tokens from UI-SPEC"

requirements-completed: [DEPL-01, DEPL-02]

duration: 3min
completed: 2026-03-24
---

# Phase 01 Plan 01: Docker + Backend + Frontend Skeleton Summary

**Docker Compose with dev/prod profiles, FastAPI skeleton with async SQLAlchemy models (User, Machine, Credential, TerminalSession), Alembic migrations, and React + Vite + Tailwind v4 frontend shell**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-24T00:16:15Z
- **Completed:** 2026-03-24T00:19:00Z
- **Tasks:** 2
- **Files modified:** 27

## Accomplishments
- Docker Compose with 4 services (db, app, app-dev, frontend-dev) and dev profile for hot-reload
- FastAPI backend with async SQLAlchemy, Alembic, CORS, and health endpoint
- 4 database models covering User, Machine, Credential, and TerminalSession entities
- React 19 + Vite 8 + Tailwind v4 frontend with UI-SPEC design tokens and TypeScript types

## Task Commits

Each task was committed atomically:

1. **Task 1: Docker Compose + Backend skeleton + Database models + Alembic** - `65c188b` (feat)
2. **Task 2: Frontend skeleton with React + Vite + Tailwind + TypeScript** - `b490402` (feat)

## Files Created/Modified
- `docker-compose.yml` - Service orchestration with db, app, app-dev, frontend-dev
- `.env.example` - Required environment variables documentation
- `backend/Dockerfile` - Multi-stage build (frontend-build, base, development, production)
- `backend/requirements.txt` - Python dependencies (FastAPI, SQLAlchemy, AsyncSSH, etc.)
- `backend/app/main.py` - FastAPI app with lifespan, CORS, health endpoint, static mount
- `backend/app/config.py` - Pydantic Settings with LOCUS_ env prefix
- `backend/app/database.py` - Async SQLAlchemy engine and session factory
- `backend/app/models/user.py` - User model with password_hash, setup_completed
- `backend/app/models/machine.py` - Machine model with host, port, username, ssh_key_path
- `backend/app/models/credential.py` - Credential model with encrypted_data, service_type
- `backend/app/models/session.py` - TerminalSession model with machine_id, session_type
- `backend/alembic.ini` - Alembic configuration
- `backend/alembic/env.py` - Async Alembic migration environment
- `backend/alembic/script.py.mako` - Migration script template
- `frontend/package.json` - Dependencies: React 19, xterm.js, Zustand, TanStack Query, Tailwind
- `frontend/Dockerfile` - Multi-stage (development, build, production with nginx)
- `frontend/vite.config.ts` - Vite config with API/WS proxy and Tailwind plugin
- `frontend/index.html` - Entry HTML with Inter and JetBrains Mono fonts
- `frontend/src/main.css` - Tailwind v4 with UI-SPEC color and font tokens
- `frontend/src/main.tsx` - React root with QueryClientProvider
- `frontend/src/App.tsx` - Placeholder component with Locus branding
- `frontend/src/types/index.ts` - TypeScript types matching backend models
- `frontend/src/api/client.ts` - JWT-authenticated fetch wrapper and WebSocket URL builder
- `frontend/tsconfig.json` - TypeScript project references
- `frontend/tsconfig.app.json` - Strict TypeScript config with path aliases

## Decisions Made
- Used `AliasChoices` for `LOCUS_DB_URL` env var because pydantic-settings v2 does not support `env_mapping` in model_config
- Used `Base.metadata.create_all` in FastAPI lifespan for automatic table creation; Alembic configured separately for production migration workflows
- Tailwind v4 uses CSS-based `@theme` block for design tokens instead of a JS config file

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed invalid pydantic-settings env_mapping config**
- **Found during:** Task 1 (config.py creation)
- **Issue:** Plan specified `env_mapping` in model_config which is not a valid pydantic-settings v2 option
- **Fix:** Used `AliasChoices("LOCUS_DB_URL", "LOCUS_DATABASE_URL")` on the `database_url` field with `validation_alias`
- **Files modified:** backend/app/config.py
- **Verification:** Python AST parse succeeds
- **Committed in:** 65c188b (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 bug fix)
**Impact on plan:** Essential fix for pydantic-settings v2 compatibility. No scope creep.

## Issues Encountered
None

## Known Stubs
None - all files contain real implementation appropriate for this skeleton plan.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Docker Compose ready for `docker compose --profile dev up`
- Database models ready for API endpoint development (Plan 02+)
- Frontend skeleton ready for layout and component work (Plan 04)
- Alembic ready for migration generation when models change

## Self-Check: PASSED

All 20 created files verified present. Both task commits (65c188b, b490402) verified in git log.

---
*Phase: 01-infrastructure-terminal-core*
*Completed: 2026-03-24*
