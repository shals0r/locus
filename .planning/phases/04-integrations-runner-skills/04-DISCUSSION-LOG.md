# Phase 4: Integrations Runner & Skills - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md -- this log preserves the alternatives considered.

**Date:** 2026-03-28
**Phase:** 04-integrations-runner-skills
**Areas discussed:** Worker architecture, Integrator skill flow, Worker management UI, Skills system

---

## Worker Architecture

### Worker base class

| Option | Description | Selected |
|--------|-------------|----------|
| Same BasePollingAdapter | Generated workers subclass BasePollingAdapter with poll() method. Consistent with existing adapters. | ✓ (initially) |
| Simplified script format | Standalone Python scripts with simple contract (poll function, no class). | |
| You decide | Claude picks during planning. | |

**User's choice:** Same BasePollingAdapter (initially), later revised to standalone script contract after subprocess isolation decision.

### Code storage

| Option | Description | Selected |
|--------|-------------|----------|
| Filesystem directory | Workers saved as .py files in dedicated directory. Easy to inspect, edit, version. | ✓ |
| Database (BLOB/text) | Worker code stored in Postgres alongside IntegrationSource config. | |
| You decide | Claude picks during planning. | |

**User's choice:** Filesystem directory

### Runner host

| Option | Description | Selected |
|--------|-------------|----------|
| Same container, subprocess | Workers run as managed subprocesses within app container. Simpler Docker setup. | ✓ |
| Separate integrations container | Dedicated container for user-built workers. Isolates untrusted code. | |
| You decide | Claude picks during planning. | |

**User's choice:** Same container, subprocess

### Hot deploy mechanism

| Option | Description | Selected |
|--------|-------------|----------|
| Dynamic import + scheduler | importlib.import_module() loads new .py file, adds APScheduler job. | ✓ (initially) |
| Worker subprocess pool | Each worker runs as separate subprocess. Deploy = spawn new process. | |
| You decide | Claude picks during planning. | |

**User's choice:** Dynamic import + scheduler (initially), later revised to subprocess model after sandboxing decision.

### Sandboxing

| Option | Description | Selected |
|--------|-------------|----------|
| Trusted, no sandbox | Single-user app, no isolation overhead. | |
| Light sandboxing | Workers run with restricted access. Protects against accidental damage. | ✓ |

**User's choice:** Light sandboxing

### Sandbox scope

| Option | Description | Selected |
|--------|-------------|----------|
| Subprocess isolation | Each worker runs as separate subprocess. Can't crash main app. Communicates via HTTP. | ✓ |
| Import with restricted builtins | In-process import with restricted globals dict. | |
| Docker sidecar per worker | Each worker gets own lightweight container. | |

**User's choice:** Subprocess isolation
**Notes:** This decision revised the earlier "dynamic import + scheduler" choice. Workers are now standalone processes that POST to the ingest API.

### Worker contract (revised)

| Option | Description | Selected |
|--------|-------------|----------|
| Standalone script with contract | Self-contained .py scripts with poll() function and main loop. POSTs to ingest API. | ✓ |
| Keep BasePollingAdapter subclass | Workers still subclass BasePollingAdapter but run in subprocess. | |
| You decide | Claude picks during planning. | |

**User's choice:** Standalone script with contract

### Built-in adapter migration

| Option | Description | Selected |
|--------|-------------|----------|
| Stay in-process | Built-in adapters keep APScheduler in-process model. Two tiers. | |
| Migrate everything to subprocess | All adapters run as subprocesses. Uniform model. | ✓ |
| You decide | Claude picks during planning. | |

**User's choice:** Migrate everything to subprocess
**Notes:** User asked "do you think I made some bad decisions here?" -- Claude provided trade-off analysis noting this is the most ambitious choice. User confirmed keeping uniform model after hearing trade-offs.

### Dependencies

| Option | Description | Selected |
|--------|-------------|----------|
| Pre-installed common libs | Ship Docker image with common libs. Workers use what's available. | |
| Per-worker requirements.txt | Each worker declares dependencies. Deploy runs pip install. | ✓ |
| You decide | Claude picks during planning. | |

**User's choice:** Per-worker requirements.txt

### Crash policy

| Option | Description | Selected |
|--------|-------------|----------|
| Auto-restart with backoff | After 5 consecutive failures, auto-disable and post feed notification. | ✓ |
| Keep retrying forever | Never auto-disable. Just log errors. | |
| You decide | Claude picks during planning. | |

**User's choice:** Auto-restart with backoff

---

## Integrator Skill Flow

### Build interaction

| Option | Description | Selected |
|--------|-------------|----------|
| Terminal session with skill | Claude Code terminal session with Integrator skill. | |
| Dedicated chat interface | Custom chat UI purpose-built for integration building. | ✓ |
| Hybrid: form + Claude | Form for structured setup, Claude for custom logic. | |

**User's choice:** Dedicated chat interface

### Chat UX

| Option | Description | Selected |
|--------|-------------|----------|
| Side panel chat | Resizable panel with conversation + structured cards for config steps. | ✓ |
| Full-screen wizard | Multi-step wizard taking over center panel. | |
| Modal dialog | Centered modal overlay. | |

**User's choice:** Side panel chat
**Notes:** User added: "we'll need a way to pass creds blindly to our DB, not to Claude directly. Showing user feedback that Claude never saw their creds."

### AI backend

| Option | Description | Selected |
|--------|-------------|----------|
| Claude Code CLI on a machine | Chat routes through Claude Code session. Leverages existing auth/session infrastructure. | ✓ |
| Direct Anthropic API | Backend calls Messages API directly. | |
| You decide | Claude picks during planning. | |

**User's choice:** Claude Code CLI on a machine

### Testing before deploy

| Option | Description | Selected |
|--------|-------------|----------|
| Dry-run with live API | Claude runs poll() once against real API. Shows preview cards. | ✓ |
| Mock/simulated test | Claude generates sample data to preview output. | |
| No test, deploy directly | Trust Claude's code, deploy immediately. | |

**User's choice:** Dry-run with live API

### Editing existing workers

| Option | Description | Selected |
|--------|-------------|----------|
| Edit via Integrator chat | Reopen chat for existing worker. Claude loads code, user describes changes. | ✓ |
| Manual code editing only | Edit .py files directly via terminal or editor. | |
| You decide | Claude picks during planning. | |

**User's choice:** Edit via Integrator chat

### Config updates

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, quick config UI | Worker cards have settings gear for interval, credentials, enabled/disabled. | ✓ |
| No, always through Integrator | All changes go through chat interface. | |

**User's choice:** Yes, quick config UI

---

## Worker Management UI

### UI placement

| Option | Description | Selected |
|--------|-------------|----------|
| Settings page section | Integrations management in Settings alongside credentials and machine config. | ✓ |
| Dedicated sidebar tab | New tab in left sidebar. | |
| Top bar status area | Status indicators in top bar, click to expand. | |

**User's choice:** Settings page section

### Log viewing

| Option | Description | Selected |
|--------|-------------|----------|
| Expandable log panel per worker | Click card to expand, show recent log lines (tail -f style). | ✓ |
| Open logs in terminal tab | Clicking 'Logs' opens new terminal tab. | |
| You decide | Claude picks during planning. | |

**User's choice:** Expandable log panel per worker

### Status indicators

| Option | Description | Selected |
|--------|-------------|----------|
| Status dot + last poll + item count | Green/yellow/red dot, last poll time, items ingested. | ✓ |
| Detailed metrics dashboard | Per-worker charts: items/hour, error rate, response times. | |
| You decide | Claude picks during planning. | |

**User's choice:** Status dot + last poll + item count

---

## Skills System

### Discovery

| Option | Description | Selected |
|--------|-------------|----------|
| SSH scan of .claude/commands/ | Read directory over SSH on repo selection. Cache with 5min TTL. | ✓ |
| Git-based discovery | Parse from git tree. Faster but no descriptions. | |
| Manual registration | User explicitly registers skills. | |

**User's choice:** SSH scan of .claude/commands/

### UI placement

| Option | Description | Selected |
|--------|-------------|----------|
| Repo context strip / toolbar | Skills as clickable chips under selected repo in sidebar. | ✓ |
| Command palette only | Skills in palette search results only. | |
| Dedicated sidebar tab | New sidebar tab for Skills. | |

**User's choice:** Repo context strip / toolbar

### Trigger behavior

| Option | Description | Selected |
|--------|-------------|----------|
| Opens Claude Code terminal with skill | New terminal tab, Claude Code session, skill auto-invoked. | ✓ |
| Background execution + notification | Skill runs in background, feed notification on complete. | |
| Modal with output | Skill runs, output in modal dialog. | |

**User's choice:** Opens Claude Code terminal with skill

### Palette search

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, both UI and palette | Skills in sidebar AND command palette. | |
| Sidebar only | Skills only from sidebar chips. | ✓ |

**User's choice:** Sidebar only

---

## Claude's Discretion

- Subprocess supervisor implementation details
- Worker file naming conventions and directory structure
- Log storage format and rotation policy
- Integrator chat message format and structured card design
- Venv management for per-worker dependencies
- Credential injection as environment variables
- Migration strategy for existing adapters

## Deferred Ideas

None -- discussion stayed within phase scope
