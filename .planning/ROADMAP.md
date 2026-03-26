# Roadmap: Locus

## Overview

Locus delivers an engineering control plane in four phases: first the Docker stack, auth, SSH terminals, and three-panel layout shell; then the two core data surfaces (multi-repo git sidebar and unified work feed); then the diff viewer and AI-assisted code review; finally the self-building integrations runner and skills system. Each phase produces a usable, verifiable capability layer that the next phase builds on.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Infrastructure & Terminal Core** - Docker stack, auth, SSH terminals, machine management, and three-panel layout shell
- [ ] **Phase 1.1: Local Machine Support** (INSERTED) - Local terminals, repos, and Claude sessions without SSH — "This Machine" as first-class citizen
- [ ] **Phase 2: Repository Management & Work Feed** - Multi-repo git sidebar with GSD state, unified work feed with ingest API, command palette
- [ ] **Phase 3: Code Review & Diff** - Local and MR diff viewing, AI-assisted review with comment promotion
- [ ] **Phase 4: Integrations Runner & Skills** - Self-building integration workers, skills system, Integrator meta-skill
- [ ] **Phase 5: Host Agent** - Lightweight host-side agent enabling Docker-to-host terminal access, session persistence, and Claude detection without SSH

## Phase Details

### Phase 1: Infrastructure & Terminal Core
**Goal**: User can launch Locus with one command, log in, connect to remote machines, and work in full terminal sessions across a collapsible three-panel layout
**Depends on**: Nothing (first phase)
**Requirements**: TERM-01, TERM-02, TERM-03, TERM-04, TERM-05, TERM-06, TERM-07, AUTH-01, AUTH-02, AUTH-03, AUTH-04, DEPL-01, DEPL-02, DEPL-03, UI-03, UI-04
**Success Criteria** (what must be TRUE):
  1. User can run `docker compose up` and access Locus in a browser with a working login
  2. User can connect to a remote machine via SSH and get a full terminal (256-color, mouse, resize) in the browser
  3. User can open multiple terminal tabs across different repos and machines, and see all active Claude Code sessions in one view
  4. User can attach to existing tmux sessions on remote machines and reconnect gracefully after SSH drops
  5. User can see machine online/offline status, connected service indicators, and collapse/expand/resize the three main panels
**Plans**: 10 plans

Plans:
- [x] 01-01-PLAN.md — Docker + backend skeleton + DB models + frontend skeleton
- [x] 01-02-PLAN.md — Auth backend (password, JWT, Fernet encryption)
- [x] 01-03-PLAN.md — SSH manager + tmux + WebSocket-SSH bridge
- [x] 01-04-PLAN.md — Frontend panel layout + stores + navigation
- [x] 01-05-PLAN.md — Machine CRUD API + session API + settings API
- [x] 01-06-PLAN.md — Auth UI (login, setup wizard) + settings pages
- [x] 01-07-PLAN.md — Terminal rendering + Claude detection + status indicators
- [x] 01-08-PLAN.md — [GAP] Backend tmux detach-on-disconnect, reattach-on-reconnect
- [x] 01-09-PLAN.md — [GAP] Frontend terminal persistence across tab switches
- [ ] 01-10-PLAN.md — [GAP] Mount ClaudeOverview + add /tmux-sessions endpoints

**UI hint**: yes

### Phase 1.1: Local Machine Support (INSERTED)
**Goal**: User can open terminals, browse repos, and run Claude Code sessions on the machine running Locus without any SSH setup — "This Machine" is always present and always connected
**Depends on**: Phase 1
**Requirements**: Derived from TERM-01 through TERM-07 (local equivalents)
**Success Criteria** (what must be TRUE):
  1. A "This Machine" entry appears in the sidebar automatically on first launch — no manual setup, always shows as connected
  2. User can open terminal tabs on the local machine that use local PTY/tmux (not SSH-to-localhost), with the same full terminal UX (256-color, mouse, resize)
  3. User can see and attach to local tmux sessions, with the same detach/reattach behavior as remote machines
  4. Local Claude Code sessions are detected and shown in the Claude overview, same as remote sessions
  5. Local repo discovery works via filesystem scan, surfacing repos for Phase 2's git sidebar
**Plans**: 3 plans

Plans:
- [ ] 01.1-01-PLAN.md — Local machine module, machine registry, DB migration, Docker config
- [ ] 01.1-02-PLAN.md — Wire backend API routes and WebSocket handlers for local machine
- [ ] 01.1-03-PLAN.md — Frontend local machine display and visual verification

**UI hint**: yes

### Phase 2: Repository Management & Work Feed
**Goal**: User can see git state and GSD progress for every repo, perform git operations, and receive a unified prioritized work feed from any source
**Depends on**: Phase 1
**Requirements**: GIT-01, GIT-02, GIT-03, GIT-04, GIT-05, GIT-06, FEED-01, FEED-02, FEED-03, FEED-04, FEED-05, FEED-06, FEED-07, FEED-08, INTG-01, UI-01, UI-02
**Success Criteria** (what must be TRUE):
  1. User can see current branch, clean/dirty state, and ahead/behind counts for every repo in the sidebar
  2. User can fetch, pull, push, checkout branches, and create new branches from the UI
  3. User can see GSD phase and progress per repo in the sidebar, and trigger next GSD actions via one-click buttons
  4. User sees a unified feed of work items categorized into urgency tiers (Now/Respond/Review/Prep/Follow up) with source links, and can mark items read, dismiss, or snooze them
  5. User can open a command palette to fuzzy-search and jump to any repo, machine, ticket, or integration, and every primary action has a keyboard shortcut
**Plans**: TBD
**UI hint**: yes

### Phase 3: Code Review & Diff
**Goal**: User can review diffs from local changes and MRs/PRs, get AI-assisted review annotations, and promote comments to GitLab/GitHub
**Depends on**: Phase 2
**Requirements**: DIFF-01, DIFF-02, DIFF-03, DIFF-04, DIFF-05
**Success Criteria** (what must be TRUE):
  1. User can view diffs of local changes (including Claude Code changes) in a unified or split diff view
  2. User can view MR/PR diffs from GitLab and GitHub in the same diff viewer
  3. User can trigger an AI review of any diff and see Claude's annotations inline, then promote selected annotations to actual MR/PR comments
  4. User can approve or request changes on MRs/PRs from within Locus
**Plans**: TBD
**UI hint**: yes

### Phase 4: Integrations Runner & Skills
**Goal**: User can build, deploy, and manage integration workers through Claude, and trigger per-repo skills from the UI
**Depends on**: Phase 2
**Requirements**: INTG-02, INTG-03, INTG-04, INTG-05, SKIL-01, SKIL-02, SKIL-03
**Success Criteria** (what must be TRUE):
  1. User can interactively build a new integration worker with Claude via the Integrator skill and hot-deploy it without restarting the runner
  2. User can view, start, stop, and inspect logs of running integration workers from the UI, with automatic restart of crashed workers
  3. User can see available skills per repo, trigger them from the UI, and any skill created in a Claude Code session is automatically available in Locus
**Plans**: TBD
**UI hint**: yes

### Phase 5: Host Agent
**Goal**: A lightweight agent process running on the host machine bridges Docker-to-host communication, enabling "This Machine" terminals, tmux session management, Claude detection, and repo scanning without requiring SSH setup on the host
**Depends on**: Phase 1.1
**Success Criteria** (what must be TRUE):
  1. User can start the host agent with a single command (`locus-agent start`) and Locus auto-detects it from Docker
  2. User can open terminal sessions on the host machine from Locus running in Docker, with full terminal UX (colors, mouse, resize)
  3. Terminal sessions survive browser disconnects and Docker restarts — the agent keeps processes alive and replays scrollback on reconnect
  4. On Unix hosts, agent uses real tmux for session persistence; on Windows hosts (no WSL), agent manages sessions directly with its own process pool
  5. Local Claude Code sessions on the host are detected and shown in the Claude overview
  6. "This Machine" shows as "needs setup" with clear instructions when agent is not running, instead of silently giving a container shell
**Plans**: TBD

Plans:
- [ ] TBD (run /gsd:plan-phase 5 to break down)

**UI hint**: no

## Progress

**Execution Order:**
Phases execute in numeric order: 1 -> 1.1 -> 2 -> 3 -> 4 -> 5

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Infrastructure & Terminal Core | 9/10 | Gap closure planned | - |
| 1.1 Local Machine Support (INSERTED) | 0/3 | Planned | - |
| 2. Repository Management & Work Feed | 0/? | Not started | - |
| 3. Code Review & Diff | 0/? | Not started | - |
| 4. Integrations Runner & Skills | 0/? | Not started | - |
| 5. Host Agent | 0/? | Not started | - |
