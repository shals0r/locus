---
phase: 05-host-agent
plan: 08
subsystem: api, ssh, agent
tags: [asyncssh, agent-deploy, machine-registry, claude-detection, remote-agent]

# Dependency graph
requires:
  - phase: 05-host-agent (plans 04-06)
    provides: "Agent client, deployer, and machine registry with local agent support"
provides:
  - "Remote agent auto-deploy on SSH connect"
  - "Remote agent client storage and lookup in machine_registry"
  - "Agent-first Claude detection for remote machines"
  - "Agent-first command execution for remote machines"
affects: [05-host-agent (plans 09-10), remote-machine-operations]

# Tech tracking
tech-stack:
  added: []
  patterns: ["Remote agent auto-deploy on SSH connect with SSH fallback", "Module-level agent client registry for remote machines"]

key-files:
  modified:
    - backend/app/services/machine_registry.py
    - backend/app/api/machines.py
    - backend/app/main.py
    - backend/app/services/claude.py

key-decisions:
  - "Non-blocking agent deploy: _try_deploy_agent wraps ensure_agent in try/except so SSH always works even if agent fails"
  - "Module-level dict for remote agent clients: _remote_agent_clients keyed by machine_id, closed on unregister"
  - "Agent-first with SSH fallback: run_command_on_machine tries agent.run_command before ssh_manager.run"

patterns-established:
  - "Remote agent lifecycle: register on connect, unregister on disconnect, cleanup on shutdown"
  - "Agent auto-deploy in startup lifespan: deploy to all connected machines after SSH reconnect loop"

requirements-completed: [AGENT-01, AGENT-05, AGENT-06]

# Metrics
duration: 3min
completed: 2026-04-03
---

# Phase 05 Plan 08: Remote Agent Auto-Deploy Summary

**Remote agent auto-deploy on SSH connect with machine_registry storage, enabling agent-first Claude detection and command execution on VPS machines**

## Performance

- **Duration:** 3 min
- **Started:** 2026-04-03T10:56:32Z
- **Completed:** 2026-04-03T10:59:24Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- Remote agent clients stored in machine_registry via _remote_agent_clients dict with register/unregister lifecycle
- Agent auto-deploy wired into create_machine, connect_machine, and lifespan startup
- Claude session detection on remote machines now routes through agent when available, falling back to SSH
- Command execution on remote machines prefers agent HTTP API over SSH exec

## Task Commits

Each task was committed atomically:

1. **Task 1: Wire remote agent storage and lookup in machine_registry** - `015f0d1` (feat)
2. **Task 2: Auto-deploy agent on SSH connect and fix Claude detection for remote machines** - `2100b3b` (feat)

## Files Created/Modified
- `backend/app/services/machine_registry.py` - Added _remote_agent_clients dict, register/unregister functions, updated get_agent_client_for_machine and run_command_on_machine to use remote agents
- `backend/app/api/machines.py` - Added _try_deploy_agent helper, wired into create_machine/connect_machine/disconnect_machine
- `backend/app/main.py` - Added agent auto-deploy loop after SSH reconnect, remote agent cleanup on shutdown
- `backend/app/services/claude.py` - Added debug log for SSH fallback path on remote machines

## Decisions Made
- Non-blocking agent deploy: _try_deploy_agent wraps ensure_agent in try/except so SSH always works even if agent fails to deploy
- Module-level dict for remote agent clients: simple _remote_agent_clients dict keyed by machine_id, with close-on-replace semantics
- Agent-first with SSH fallback in run_command_on_machine: tries agent.run_command first, logs warning and falls back to SSH on failure

## Deviations from Plan

None - plan executed exactly as written.

## Known Stubs

None - all functions are fully wired to existing agent client and deployer implementations.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Remote agent infrastructure is connected end-to-end
- Plans 09-10 can build on agent-backed file/git operations for remote machines
- Claude sessions on VPS will now appear in UI when agent is deployed

## Self-Check: PASSED

All files verified present. All commit hashes found in git log.

---
*Phase: 05-host-agent*
*Completed: 2026-04-03*
