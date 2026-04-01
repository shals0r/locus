---
phase: 05-host-agent
plan: 04
subsystem: agent
tags: [httpx, websockets, asyncssh, scp, agent-deploy, ws-proxy]

requires:
  - phase: 05-host-agent (plans 01-03)
    provides: Agent API surface (health, terminal, tmux, claude, WS endpoints)
provides:
  - AgentClient wrapping all agent REST and WS endpoints via httpx
  - WebSocket proxy for bidirectional browser-to-agent terminal I/O
  - Auto-deploy pipeline detecting platform, Python, uploading .pyz via SCP
  - Version mismatch detection triggering automatic re-deployment
affects: [05-05, 05-06, integration with existing SSH terminal flow]

tech-stack:
  added: [websockets>=16.0]
  patterns: [agent-client-pattern, ws-proxy-bidirectional, scp-deploy-pipeline]

key-files:
  created:
    - backend/app/agent/__init__.py
    - backend/app/agent/client.py
    - backend/app/agent/proxy.py
    - backend/app/agent/deployer.py
  modified:
    - backend/requirements.txt

key-decisions:
  - "httpx.AsyncClient with Bearer auth header for all agent REST calls"
  - "websockets.connect with 1MB max_size for proxy backpressure control"
  - "asyncio.wait FIRST_COMPLETED for bidirectional proxy cleanup"
  - "Health polling loop (0.5s interval, 10s timeout) for deploy verification"
  - "Python 3.12+ requirement enforced via version parsing on remote"

patterns-established:
  - "AgentClient context manager pattern for lifecycle management"
  - "HTTP-to-WS URL conversion for WebSocket URL building"
  - "Platform detection via uname -s with Darwin arch disambiguation"
  - "Token read from ~/.locus-agent/agent.token after deploy"

requirements-completed: [AGENT-01, AGENT-06]

duration: 3min
completed: 2026-04-01
---

# Phase 05 Plan 04: Locus-Side Agent Client Summary

**AgentClient HTTP+WS wrapper, SCP auto-deploy pipeline, and bidirectional WebSocket terminal proxy bridging browser traffic to host agents**

## Performance

- **Duration:** 3 min
- **Started:** 2026-04-01T11:35:51Z
- **Completed:** 2026-04-01T11:38:33Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- AgentClient wrapping all agent REST endpoints (health, terminal CRUD, tmux, claude sessions, exec) with httpx.AsyncClient
- Bidirectional WebSocket proxy using asyncio.wait FIRST_COMPLETED for clean task cancellation
- Full auto-deploy pipeline: platform detection, Python discovery, SCP upload, background start, health polling, token retrieval
- Version mismatch detection in ensure_agent triggers stop-and-redeploy flow

## Task Commits

Each task was committed atomically:

1. **Task 1: AgentClient HTTP+WS client and WebSocket proxy** - `9ce653a` (feat)
2. **Task 2: Agent auto-deploy pipeline via SCP + SSH exec** - `b126452` (feat)

## Files Created/Modified
- `backend/app/agent/__init__.py` - Package init
- `backend/app/agent/client.py` - AgentClient with REST methods and WS URL builders
- `backend/app/agent/proxy.py` - Bidirectional WebSocket proxy (browser <-> agent)
- `backend/app/agent/deployer.py` - Auto-deploy: detect_platform, detect_python, deploy_agent, ensure_agent
- `backend/requirements.txt` - Added websockets>=16.0

## Decisions Made
- httpx.AsyncClient with Bearer auth for all REST calls (consistent with agent auth model)
- websockets library (not FastAPI WS client) for outbound agent connections with max_size=1MB backpressure
- asyncio.wait with FIRST_COMPLETED for proxy cleanup (cancel pending task when either side disconnects)
- Health polling at 0.5s intervals up to 10s after deploy (balances responsiveness vs overhead)
- Python 3.12+ enforced on remote (parses version string, tries python3/python/py -3)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- Host Python lacks httpx/websockets/asyncssh (expected -- these are Docker-only deps), so verification used AST parsing and pattern matching instead of import execution.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- AgentClient ready for integration into machine connection flow
- Deployer ready to be called from SSH connection lifecycle
- WebSocket proxy ready to replace direct SSH terminal WS for agent-backed machines

---
*Phase: 05-host-agent*
*Completed: 2026-04-01*
