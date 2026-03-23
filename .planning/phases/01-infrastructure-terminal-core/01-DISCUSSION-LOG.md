# Phase 1: Infrastructure & Terminal Core - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-03-23
**Phase:** 01-infrastructure-terminal-core
**Areas discussed:** Terminal session model, Panel layout & shell, Auth & first-run setup, SSH & machine management, Dark/light theme, Repo discovery on machines, Docker compose structure

---

## Terminal Session Model

### Terminal organization

| Option | Description | Selected |
|--------|-------------|----------|
| Tab per machine | Each machine gets a tab, sub-tabs for sessions within | ✓ |
| Flat tab bar | All terminals in one flat bar with machine prefix | |
| Tree in sidebar | Machines/sessions as tree in left sidebar | |

**User's choice:** Tab per machine

### Claude Code session display

| Option | Description | Selected |
|--------|-------------|----------|
| Mixed in tab bar | Claude sessions as tabs alongside shell tabs with distinct indicator | ✓ |
| Separate section | Claude sessions in own row/section below regular tabs | |

**User's choice:** Mixed in tab bar

### Claude Code sessions overview (TERM-06)

| Option | Description | Selected |
|--------|-------------|----------|
| Feed-style list | Dedicated view showing all Claude sessions across machines with status | ✓ |
| Badge counts only | Badge counts on machine tabs, rely on feed notifications | |

**User's choice:** Feed-style list

### New terminal default

| Option | Description | Selected |
|--------|-------------|----------|
| Home directory | Opens at ~ on selected machine | |
| Repo picker | Quick repo picker on new tab, with plain shell option | ✓ |
| Last used directory | Opens at last working directory on that machine | |

**User's choice:** Repo picker

---

## Panel Layout & Shell

### Sidebar content in Phase 1

| Option | Description | Selected |
|--------|-------------|----------|
| Machine list | Connected machines with online/offline status, expandable sessions | ✓ |
| Empty with placeholder | Placeholder text, machines managed via tab bar only | |
| Collapsed by default | Sidebar starts collapsed, terminal takes full width | |

**User's choice:** Machine list

### Right panel in Phase 1

| Option | Description | Selected |
|--------|-------------|----------|
| Collapsed by default | Right panel collapsed, terminal gets max width | ✓ |
| Claude sessions overview | Use right panel for Claude sessions overview | |

**User's choice:** Collapsed by default

### Panel resize handles

| Option | Description | Selected |
|--------|-------------|----------|
| Drag handles | Visible drag handles, click header to collapse, double-click to reset | ✓ |
| Invisible handles + keyboard | Minimal chrome, resize via keyboard shortcuts | |

**User's choice:** Drag handles

### Top bar content

| Option | Description | Selected |
|--------|-------------|----------|
| Logo + service indicators + user menu | Full top bar with logo, service status dots, user menu | ✓ |
| Minimal — just logo + logout | Ultra-simple for Phase 1 | |

**User's choice:** Logo + service indicators + user menu

---

## Auth & First-Run Setup

### First-run flow

| Option | Description | Selected |
|--------|-------------|----------|
| Setup wizard | Step-by-step: password → machine → optional credentials | ✓ |
| Password only, rest in settings | First-run just sets password | |
| Env vars + password | Pre-configure via env vars, first-run sets UI password | |

**User's choice:** Setup wizard

### Credential storage

| Option | Description | Selected |
|--------|-------------|----------|
| Settings page with test button | Per-service credential management with test connectivity | ✓ |

**User's choice:** Settings page with test button
**Notes:** User noted the credential input UI should be extensible for future service types added via the Integrator skill

### Claude Code auth replication (AUTH-04)

| Option | Description | Selected |
|--------|-------------|----------|
| Store in Locus, push to machines | Central auth config, pushed to machines via SSH | ✓ |
| Manual per machine | User sets up auth on each machine manually | |

**User's choice:** Store in Locus, push to machines

---

## SSH & Machine Management

### Adding machines

| Option | Description | Selected |
|--------|-------------|----------|
| Form in settings | Name, host, port, username, SSH key path form with test button | ✓ |
| SSH config import | Parse ~/.ssh/config and pick hosts | |
| Both | Import from SSH config plus manual form | |

**User's choice:** Form in settings

### Reconnection behavior

| Option | Description | Selected |
|--------|-------------|----------|
| Auto-reconnect with status | Auto-retry with exponential backoff, reconnection overlay | |
| Manual reconnect | Connection lost banner with reconnect button | |

**User's choice:** Custom — auto-reconnect with exponential backoff up to a set max retries, then show "Connection lost" with manual reconnect button. On successful reconnect, auto-attach to tmux.

### Tmux session attachment

| Option | Description | Selected |
|--------|-------------|----------|
| Auto-detect and offer | Check for existing tmux sessions, show picker or create new | ✓ |
| Always create new | Fresh tmux session every time | |
| Always attach to default | Attach to default-named session | |

**User's choice:** Auto-detect and offer

### Machine status

| Option | Description | Selected |
|--------|-------------|----------|
| Periodic heartbeat | Ping machines on interval, show green/red dot | ✓ |
| On-demand only | Check status only when user connects | |

**User's choice:** Periodic heartbeat

---

## Dark/Light Theme

| Option | Description | Selected |
|--------|-------------|----------|
| Dark only | Dark theme only for v1 | ✓ |
| System-following | Follow OS dark/light preference | |
| Both with toggle | Manual toggle, dark default | |

**User's choice:** Dark only

---

## Repo Discovery on Machines

| Option | Description | Selected |
|--------|-------------|----------|
| Configured scan paths | User sets root directories, Locus scans for git repos | ✓ |
| Manual add only | User manually adds repo paths | |
| Home directory scan | Auto-scan entire home directory | |

**User's choice:** Configured scan paths

---

## Docker Compose Structure

| Option | Description | Selected |
|--------|-------------|----------|
| docker-compose.dev.yml override | Base + override file for dev mode | |
| Single compose with profiles | One file with dev/prod profiles | ✓ |

**User's choice:** Single compose with profiles

---

## Claude's Discretion

- Panel default proportions and breakpoints
- Heartbeat interval tuning
- Terminal color scheme specifics within dark theme
- Reconnection backoff parameters

## Deferred Ideas

None — discussion stayed within phase scope
