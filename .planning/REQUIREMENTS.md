# Requirements: Locus

**Defined:** 2026-03-23
**Core Value:** Open one tool and immediately know what needs attention, across every repo, machine, agent session, and work stream — then act on it without switching context.

## v1 Requirements

### Terminal & Machine Management

- [ ] **TERM-01**: User can connect to remote machines via SSH with persistent auto-reconnecting connections
- [ ] **TERM-02**: User gets a full terminal emulator (xterm.js) with 256-color, mouse events, and resize support
- [ ] **TERM-03**: User can open multiple terminal tabs, each bound to a specific repo on a specific machine
- [ ] **TERM-04**: User can attach to existing tmux sessions on remote machines and reconnect gracefully on SSH drop
- [ ] **TERM-05**: User can see machine connection status at a glance (online/offline indicators)
- [ ] **TERM-06**: User can see all active Claude Code sessions across all repos and machines in one view
- [ ] **TERM-07**: User receives a feed notification when a Claude Code session is waiting for input

### Git & Repository Management

- [ ] **GIT-01**: User can see the current branch for every repo across all machines
- [ ] **GIT-02**: User can see clean/dirty state and ahead/behind counts per repo
- [ ] **GIT-03**: User can fetch, pull, and push from the UI per repo
- [ ] **GIT-04**: User can checkout existing branches or create new branches from the UI
- [ ] **GIT-05**: User can see current GSD phase and progress state per repo in the sidebar
- [ ] **GIT-06**: User can trigger the next GSD action (plan, execute, verify, transition) via one-click buttons

### Work Feed

- [ ] **FEED-01**: User sees a unified feed of work items from all connected sources in a single panel
- [ ] **FEED-02**: Feed items are categorized into urgency tiers (Now/Respond/Review/Prep/Follow up)
- [ ] **FEED-03**: Each feed item links back to its source system (Jira, GitLab, GitHub, etc.)
- [ ] **FEED-04**: User can mark feed items as read, dismiss them, or snooze them for later
- [ ] **FEED-05**: Feed items are auto-prioritized based on time sensitivity, mention rules, and source-defined categorization
- [ ] **FEED-06**: GSD events (phase transitions, discussion needs, verification results) appear as feed items
- [ ] **FEED-07**: User can submit meeting transcripts via API endpoint and receive auto-extracted action items in the feed
- [ ] **FEED-08**: Integration workers define their own categorization and mention-detection rules via the ingestion protocol, not hardcoded per source

### Code Review & Diff

- [ ] **DIFF-01**: User can view diffs of local changes (e.g., changes made by Claude Code) in a unified or split diff view
- [ ] **DIFF-02**: User can view MR/PR diffs from GitLab and GitHub in the same diff viewer
- [ ] **DIFF-03**: User can trigger an AI review of any diff, with Claude's observations appearing as local annotations
- [ ] **DIFF-04**: User can promote any local AI annotation to an actual comment on the MR/PR in GitLab or GitHub
- [ ] **DIFF-05**: User can approve or request changes on MRs/PRs from within Locus

### Integrations

- [ ] **INTG-01**: Locus exposes a universal ingest API (`POST /api/feed/ingest`) with a documented payload schema that any service can post to
- [ ] **INTG-02**: User can interactively build a new integration worker with Claude via the Integrator skill (describe what to connect, test API communication, deploy worker)
- [ ] **INTG-03**: New integration workers can be hot-deployed to the integrations runner container without restarting it
- [ ] **INTG-04**: Integration workers run with a process supervisor that monitors health and restarts crashed workers
- [ ] **INTG-05**: User can view, start, stop, and inspect logs of running integration workers from the UI

### UI & Navigation

- [ ] **UI-01**: User can open a command palette to fuzzy-search and jump to any repo, machine, ticket, or integration
- [ ] **UI-02**: Every primary action in Locus has a keyboard shortcut
- [ ] **UI-03**: User can collapse, expand, and resize the three main panels (sidebar, center, feed) independently
- [ ] **UI-04**: User can enter focus mode by collapsing panels to work in full-width terminal or full-width feed

### Skills

- [ ] **SKIL-01**: User can see available skills per repo and trigger them from the UI skills bar
- [ ] **SKIL-02**: Skills match Claude Code's native skill model — any skill created in a Claude Code session is automatically available in Locus's UI
- [ ] **SKIL-03**: The Integrator skill is a built-in meta-skill that guides the user through building and deploying a new integration worker

### Auth & Security

- [ ] **AUTH-01**: User can set up their Locus instance with a password on first run
- [ ] **AUTH-02**: User can store credentials for external services (GitLab, GitHub, Jira, Google) encrypted in Postgres
- [ ] **AUTH-03**: SSH key references are stored securely (paths to keys, not the keys themselves)

### Deployment

- [ ] **DEPL-01**: The entire stack (app, Postgres, integrations runner) starts with a single `docker compose up`
- [ ] **DEPL-02**: Configuration is done via environment variables and a first-run setup flow
- [ ] **DEPL-03**: User can see connected service status indicators in the top bar

## v2 Requirements

### Mobile & Notifications

- **MOBI-01**: Mobile-responsive UI for phone/tablet access
- **MOBI-02**: Push notifications when Claude Code is waiting for input
- **MOBI-03**: Push notifications for high-priority feed items (@mentions, CI failures)

### Advanced AI

- **AI-01**: Morning brief synthesizing GSD state + feed + calendar into a daily action plan
- **AI-02**: Session history and context carry-over between Claude Code sessions
- **AI-03**: Multi-agent orchestration view across repos/machines

### Advanced Search

- **SRCH-01**: Full-text search across feed item content and transcripts
- **SRCH-02**: Command palette searches message content, not just navigation targets

### Advanced GSD

- **GSD-01**: Cross-repo GSD roadmaps spanning multiple projects
- **GSD-02**: GSD-driven daily prioritization in the feed

## Out of Scope

| Feature | Reason |
|---------|--------|
| Full IDE / code editor | Locus is a control plane, not an editor. Terminals and diffs only. |
| Plugin marketplace | Self-building integrations via Claude replace the need for a marketplace |
| Multi-user / team collaboration | Each engineer runs their own instance. Single-user by design. |
| Autonomous AI actions | Feed auto-sorts but never auto-acts. Human-in-the-loop always. |
| Full Jira/GitLab/GitHub UI replacement | Locus links out for deep operations, doesn't recreate source UIs |
| Slack integration | Not used. Google Chat covers messaging. |
| Real-time collaborative editing | Single-user terminal sessions, no shared cursors |
| CI/CD pipeline management UI | Surface CI status in feed, link to CI UI for details |
| Mobile UI (v1) | Desktop/laptop browser only. Mobile is v2. |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| TERM-01 | - | Pending |
| TERM-02 | - | Pending |
| TERM-03 | - | Pending |
| TERM-04 | - | Pending |
| TERM-05 | - | Pending |
| TERM-06 | - | Pending |
| TERM-07 | - | Pending |
| GIT-01 | - | Pending |
| GIT-02 | - | Pending |
| GIT-03 | - | Pending |
| GIT-04 | - | Pending |
| GIT-05 | - | Pending |
| GIT-06 | - | Pending |
| FEED-01 | - | Pending |
| FEED-02 | - | Pending |
| FEED-03 | - | Pending |
| FEED-04 | - | Pending |
| FEED-05 | - | Pending |
| FEED-06 | - | Pending |
| FEED-07 | - | Pending |
| FEED-08 | - | Pending |
| DIFF-01 | - | Pending |
| DIFF-02 | - | Pending |
| DIFF-03 | - | Pending |
| DIFF-04 | - | Pending |
| DIFF-05 | - | Pending |
| INTG-01 | - | Pending |
| INTG-02 | - | Pending |
| INTG-03 | - | Pending |
| INTG-04 | - | Pending |
| INTG-05 | - | Pending |
| UI-01 | - | Pending |
| UI-02 | - | Pending |
| UI-03 | - | Pending |
| UI-04 | - | Pending |
| SKIL-01 | - | Pending |
| SKIL-02 | - | Pending |
| SKIL-03 | - | Pending |
| AUTH-01 | - | Pending |
| AUTH-02 | - | Pending |
| AUTH-03 | - | Pending |
| DEPL-01 | - | Pending |
| DEPL-02 | - | Pending |
| DEPL-03 | - | Pending |

**Coverage:**
- v1 requirements: 43 total
- Mapped to phases: 0
- Unmapped: 43

---
*Requirements defined: 2026-03-23*
*Last updated: 2026-03-23 after initial definition*
