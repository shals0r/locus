---
phase: 05-host-agent
plan: 05
subsystem: infra
tags: [agent, fastapi, websocket, docker-compose, machine-registry]

requires:
  - phase: 05-host-agent/04
    provides: AgentClient, proxy_terminal_to_agent, probe_agent, deployer
provides:
  - Updated machine_registry routing through agent client
  - Terminal WS proxy through agent for agent-backed machines
  - Claude detection via agent endpoint
  - Docker Compose agent volume and env var configuration
  - Agent-side POST /exec endpoint for command execution
affects: [05-host-agent/06, terminal, claude-status]

tech-stack:
  added: []
  patterns: [agent-first-then-ssh-fallback, unified-machine-detection]

key-files:
  created:
    - backend/app/agent/exec.py
    - agent/locus_agent/api/exec.py
  modified:
    - backend/app/config.py
    - backend/app/local/manager.py
    - backend/app/services/machine_registry.py
    - backend/app/ws/terminal.py
    - backend/app/services/claude.py
    - docker-compose.yml
    - agent/locus_agent/app.py

key-decisions:
  - "Agent-first fallback: LocalMachineManager probes agent on startup, falls back to SSH then subprocess"
  - "get_agent_client_for_machine in registry returns AgentClient or None, keeping SSH path backward-compatible"
  - "Terminal WS agent proxy falls back to SSH on failure (graceful degradation)"
  - "docker-compose agent-data volume uses bind mount to ~/.locus-agent for token file sharing"

patterns-established:
  - "Agent-first routing: all local machine operations check agent before SSH/subprocess"
  - "Unified detection: detect_claude_sessions_for_machine routes to agent/subprocess/SSH based on availability"

requirements-completed: [AGENT-01, AGENT-02, AGENT-05, AGENT-06]

duration: 4min
completed: 2026-04-01
---

# Phase 05 Plan 05: Backend Integration Summary

**Rewired Locus backend to route local machine ops through host agent with SSH fallback for terminals, commands, and Claude detection**

## Performance

- **Duration:** 4 min
- **Started:** 2026-04-01T11:40:07Z
- **Completed:** 2026-04-01T11:44:02Z
- **Tasks:** 2
- **Files modified:** 9

## Accomplishments
- LocalMachineManager probes host agent on startup, uses agent for all operations when available
- Machine registry exposes get_agent_client_for_machine() for agent-aware routing
- Terminal WebSocket proxies through agent with graceful fallback to SSH/subprocess
- Claude session detection unified across agent, SSH, and subprocess paths
- Docker Compose configured with LOCUS_AGENT_URL, LOCUS_AGENT_TOKEN_FILE, and agent-data volume
- Agent-side POST /exec endpoint added for arbitrary command execution on host

## Task Commits

Each task was committed atomically:

1. **Task 1: Update local/manager.py, config.py, agent exec** - `5b03103` (feat)
2. **Task 2: Rewire registry, terminal WS, claude, docker-compose** - `c683154` (feat)

## Files Created/Modified
- `backend/app/config.py` - Added agent_url and agent_token_file settings
- `backend/app/local/manager.py` - Agent-first initialization with SSH fallback
- `backend/app/agent/exec.py` - Backend wrapper for agent command execution
- `agent/locus_agent/api/exec.py` - Agent-side POST /exec endpoint
- `agent/locus_agent/app.py` - Wired exec router into agent app
- `backend/app/services/machine_registry.py` - Added get_agent_client_for_machine()
- `backend/app/ws/terminal.py` - Agent proxy path before SSH fallback
- `backend/app/services/claude.py` - Agent-based and unified detection functions
- `docker-compose.yml` - Agent env vars, volume mount for app and app-dev

## Decisions Made
- Agent-first fallback pattern: probe agent on startup, use SSH only when agent unavailable
- get_agent_client_for_machine returns AgentClient or None, keeping SSH backward-compatible
- Terminal WS catches agent proxy exceptions and falls back to SSH path
- docker-compose agent-data volume uses bind mount (not named volume) for host file access

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Backend fully wired to route through host agent when available
- Plan 06 (testing/verification) can validate the full agent integration path

---
*Phase: 05-host-agent*
*Completed: 2026-04-01*
