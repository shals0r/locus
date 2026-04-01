# Locus

## What This Is

Locus is a Dockerized web app that gives engineers a single control plane for managing multiple repos, machines, Claude Code sessions, and work items. It combines a multi-machine terminal with an integrated diff/review surface and a universal work feed that ingests signals from any source — Jira, GitLab, GitHub, Google Calendar, Google Chat, Google Tasks, meeting transcripts, and anything else that can hit a webhook. GSD framework support is native and first-class across all repos.

## Core Value

Open one tool and immediately know what needs attention, across every repo, machine, agent session, and work stream — then act on it without switching context.

## Requirements

### Validated

- [x] Host agent enables Docker-to-host terminal access, session persistence, and Claude detection without SSH — Validated in Phase 5: Host Agent

### Active

- [ ] Multi-machine repo management with SSH/tmux support and persistent reconnection
- [ ] Embedded Claude Code terminal sessions per repo with seamless SSH tunneling to remote machines
- [ ] Three-panel collapsible layout: repo/machine sidebar, terminal+diff center, work feed right
- [ ] Diff/review panel for both local Claude Code changes and MR review (GitLab + GitHub)
- [ ] AI-assisted MR review: Claude reviews locally, user promotes annotations to actual MR comments
- [ ] Universal work feed with ingest API (`POST /api/feed/ingest`) accepting structured payloads from any source
- [ ] Self-building integrations: Claude builds polling workers via an Integrator skill, deployed to a shared integrations runner container
- [ ] Smart feed categorization (Now/Respond/Review/Prep/Follow up) based on time sensitivity, source, and user mentions
- [ ] Per-repo skills system matching Claude Code's native skill model, with UI for triggering and management
- [ ] GSD native support: sidebar shows phase state per repo, action feed surfaces GSD events, next-action buttons for phase progression
- [ ] GSD flexibility: supports freeform Claude Code conversations and arbitrary skills alongside structured GSD workflows
- [ ] Command palette for fast navigation (jump to repo, machine, ticket, integration)
- [ ] Git operations from UI: fetch, pull, push, checkout, rebase, new branch
- [ ] Branch state visibility: current branch, clean/dirty, ahead/behind per repo
- [ ] Meeting transcript ingestion via simple API endpoint with auto-extraction of action items
- [ ] Single-user auth per instance with service credentials hashed in Postgres
- [ ] Top bar with connected services status indicators
- [ ] Dockerized deployment: docker compose up for the full stack

### Out of Scope

- Full IDE replacement — Locus is a control plane, not an editor
- Slack integration — not used; Google Chat covers messaging
- Autonomous AI prioritization that takes action — feed auto-sorts but never auto-acts
- Team collaboration / multi-user — each engineer runs their own instance
- Plugin marketplace — integrations are self-built via Claude
- Replacing Jira/GitLab/GitHub UIs entirely — Locus links out for deep operations
- Mobile UI for v1 — future addition with push notifications
- Full-text search across feed content — v1 command palette is navigation-only

## Context

**Architecture:**
- Python backend (API server, WebSocket management, SSH connection handling)
- React frontend with xterm.js for terminal embedding
- Postgres database (separate Docker service) for user config, credentials, integration state, feed items
- Integrations runner container: a single container managing multiple polling workers built by Claude via the Integrator skill
- Docker Compose orchestration for the full stack (app, db, integrations runner)

**Key architectural decisions:**
- Everything flows through the work feed ingest API — there are no special-purpose panels for individual integrations
- Integrations are not hardcoded; they're built interactively by Claude and deployed as workers in the integrations runner
- GSD is a first-class concept but not mandatory — repos without `.planning/` directories work fine
- AI reviews MR diffs locally; comments are only posted to GitLab/GitHub when the user explicitly promotes them
- Skills work the same way as Claude Code's native skill system, just with a visual UI layer

**User environment:**
- Engineers working across multiple repos on multiple machines (local + remote SSH)
- Heavy tmux users who need persistent session reconnection
- Using GSD framework for structured project execution
- Primary deployment: DigitalOcean droplet or local machine, accessed via browser

**Future direction:**
- Mobile-responsive UI
- Push notifications (Claude waiting for input, CI failures, GSD discussion phases needing answers, @mentions)
- Full-text search across accumulated feed data
- Cross-repo GSD roadmaps spanning multiple projects
- Morning brief synthesizing GSD state + feed + calendar into a daily action plan

## Constraints

- **Tech stack**: Python backend, React frontend, Postgres, Docker Compose — no negotiation
- **Deployment**: Must work with a single `docker compose up` — zero manual setup beyond env vars
- **Single-user**: No multi-tenancy, no shared state between instances
- **Git providers**: Must support both GitLab and GitHub from day 1
- **GSD compatibility**: Must work with existing `.planning/` directory structure and GSD command set
- **SSH**: Must handle persistent SSH connections with tmux support and graceful reconnection

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Python backend over Node | User preference, better SSH/system tooling libraries | -- Pending |
| Universal ingest API over hardcoded integrations | Self-building integrations are more powerful and lower maintenance | -- Pending |
| Single integrations runner container over per-integration containers | Lighter weight, easier to manage multiple polling workers | -- Pending |
| Claude reviews locally, user promotes to MR comments | Prevents bot noise in GitLab/GitHub, keeps user in control | -- Pending |
| Collapsible three-panel layout over fixed panels | Accommodates focus modes (full terminal, full feed, etc.) | -- Pending |
| Navigation-only command palette for v1 | Full-text search needs data volume; navigation is immediately useful | -- Pending |
| Everything through work feed, no special integration panels | Simplifies architecture, all sources are equal | -- Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd:transition`):
1. Requirements invalidated? -> Move to Out of Scope with reason
2. Requirements validated? -> Move to Validated with phase reference
3. New requirements emerged? -> Add to Active
4. Decisions to log? -> Add to Key Decisions
5. "What This Is" still accurate? -> Update if drifted

**After each milestone** (via `/gsd:complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-04-01 after Phase 5 completion*
