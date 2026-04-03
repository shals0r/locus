---
id: SEED-002
status: dormant
planted: 2026-04-01
planted_during: v1.0 phase 06 (integration gap closure)
trigger_when: after phase 6 completes
scope: Medium
---

# SEED-002: Cross-machine Claude Code session migration

Send running Claude Code sessions from one machine to another so work continues
unattended — start an idea on your laptop, hand it off to a 24/7 server, and let
Claude keep working while you sleep.

## Why This Matters

When working from a phone or laptop, you hit a wall when it's time to shut down.
Claude Code sessions are tied to the machine they started on. If you could serialize
the full conversation context and ship it to a persistent server (like the DigitalOcean
droplet that runs Locus), work never stops. This turns Locus from a "control plane you
watch" into an "always-on agent orchestrator."

The user explicitly said: "Imagine cooking up an idea and just sending it to my 24/7
server and having you smash it out while I sleep."

## When to Surface

**Trigger:** After phase 6 (integration gap closure) completes — when planning what
comes next in v1.0 or the next milestone.

This seed should be presented during `/gsd:new-milestone` when the milestone
scope matches any of these conditions:
- Multi-machine agent orchestration features
- Claude Code session management enhancements
- Post-v1.0 milestone planning
- Any work around remote/background agent execution

## Scope Estimate

**Medium** — A phase or two with planning. Key pieces:
- Session serialization (export full conversation as transferable context)
- Transfer protocol (machine-to-machine via Locus's existing SSH/agent infra)
- Session restoration on target machine (spawn Claude Code with injected context)
- UI surface in Locus to initiate "send session to machine X"
- No need to preserve cache rates — full context transfer is acceptable

## Breadcrumbs

Related code and decisions found in the current codebase:

- `backend/app/services/claude.py` — existing Claude session management
- `backend/app/agent/client.py` — agent client for remote Claude operations
- `agent/locus_agent/api/claude.py` — agent-side Claude API
- `agent/locus_agent/terminal/session_pool.py` — terminal session pooling
- `backend/app/ws/terminal.py` — WebSocket terminal I/O
- `backend/app/api/sessions.py` — session REST API
- `agent/locus_agent/ws/terminal.py` — agent-side terminal WebSocket

## Notes

- The existing Locus agent architecture (host agent + remote agents) already provides
  the machine-to-machine communication layer. Session migration would build on top of
  this rather than creating new transport.
- Cache rate loss is explicitly acceptable per the user — shipping the full conversation
  as context is fine.
- This pairs naturally with Locus's multi-machine terminal capabilities built in phase 5.
