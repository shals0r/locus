# Feature Landscape

**Domain:** Engineering Cockpit / Developer Control Plane
**Researched:** 2026-03-23
**Overall confidence:** MEDIUM-HIGH

## Table Stakes

Features users expect. Missing = product feels incomplete or unusable.

### Terminal & Machine Management

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| SSH connection to remote machines | Core premise -- control plane must reach machines | Medium | Persistent connections with auto-reconnect are non-negotiable. Termius, MobaXterm, and every SSH client does this. |
| Terminal emulation (xterm.js) | Users need real shell access, not a toy | Medium | Warp, Zed, VS Code Remote all embed full terminal. Must support 256-color, mouse events, resize. |
| Tabbed/multi-session terminals | Engineers work across repos simultaneously | Low | Every modern terminal (iTerm2, Warp, Windows Terminal) has tabs. Users will revolt without them. |
| tmux session attach/reconnect | Target users are heavy tmux users per PROJECT.md | Medium | Must detect existing tmux sessions and offer attach. Graceful reconnection on SSH drop is critical. |
| Machine connection status indicators | Users need to know what's alive at a glance | Low | Green/yellow/red dot per machine. Standard in Termius, MobaXterm. |

### Git & Repository Management

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Current branch display per repo | GitKraken, VS Code, every Git UI shows this | Low | Poll or watch `.git/HEAD`. Absolute baseline. |
| Clean/dirty/ahead/behind status | Standard in GitKraken, VS Code Git, Tower | Low | `git status --porcelain` + `git rev-list --left-right`. Must update on focus/interval. |
| Basic git operations (fetch, pull, push) | If you show branch state, users expect to act on it | Medium | Confirmation dialogs for push. Error handling for conflicts. |
| Branch checkout/creation | Any git UI that doesn't let you switch branches is decoration | Low | Dropdown or command palette. Must handle dirty working tree warnings. |

### Work Feed & Notifications

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Unified feed from multiple sources | Core value prop. Without this, it's just a terminal app. | High | Webhook ingest API is the right architecture (per PROJECT.md). Must handle GitHub, GitLab, Jira, calendar at minimum. |
| Feed item categorization/priority | Raw chronological feed is noise. Users need signal. | Medium | Linear's triage model (Now/Later/Archive) is well-understood. Locus proposes Now/Respond/Review/Prep/Follow up -- good but validate categories with usage. |
| Clickable links to source systems | Users need to drill into Jira/GitLab for deep operations | Low | Every aggregator (Raycast, Linear, Backstage) links out. Per PROJECT.md, Locus explicitly does NOT replace source UIs. |
| Read/dismiss/snooze on feed items | Without state management on items, feed becomes unusable in days | Low | Basic but essential. Every inbox/feed tool has this. |

### UI & Navigation

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Command palette / quick navigation | Raycast built an entire product on this. VS Code, Linear, Zed all have it. | Medium | Jump to repo, machine, ticket, feed item. Fuzzy matching. Keyboard-first users demand this. |
| Keyboard shortcuts throughout | Target users (terminal power users) expect keyboard-driven UI | Medium | Linear's keyboard-first design is the benchmark. Every action should have a shortcut. |
| Collapsible/resizable panels | Focus modes (full terminal, full feed) are essential for small screens | Medium | VS Code's panel system is the standard. Three-panel layout per PROJECT.md. |
| Responsive layout for different screen sizes | Engineers use various monitor setups | Medium | Not mobile (out of scope for v1), but must handle 13" laptop to ultrawide. |

### Authentication & Security

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Secure credential storage for services | Storing GitLab/GitHub/Jira tokens securely | Medium | Hashed in Postgres per PROJECT.md. Must encrypt at rest. Standard practice. |
| SSH key management | Users need to configure SSH access to machines | Low | Store references to keys, don't store private keys themselves. |
| Single-user auth for the instance | Prevent unauthorized access to a running instance | Low | Basic session auth. Not multi-tenant per constraints. |

## Differentiators

Features that set Locus apart. Not expected in any single competing product, but create the unique value proposition.

### AI Agent Session Management

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Claude Code session visibility across repos | No tool shows all your AI coding sessions in one place. Warp shows its own agents; VS Code shows Copilot. Nobody aggregates across repos/machines. | High | This is Locus's strongest differentiator. Must show: active/waiting/completed sessions, what each is doing, which repo. |
| AI session "needs attention" notifications | Claude Code often blocks waiting for human input. No tool surfaces this across multiple sessions today. | Medium | Poll or detect when Claude is waiting. Surface in feed with high priority. Massive time-saver. |
| Session history and context carry-over | VS Code Agent HQ (Nov 2025) introduced this concept. Still nascent across the industry. | High | Store session summaries, allow context injection into new sessions. The "land the plane" pattern from multi-agent research. |
| Multi-agent orchestration view | Warp 2.0 runs multiple agents. VS Code 1.107 has Agent HQ. But neither provides a cross-machine orchestration view. | High | Future differentiator. v1 can start with visibility only. |

### Self-Building Integrations

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Integrator skill: Claude builds polling workers | No other product lets you say "connect to X" and has AI build the integration. Backstage has plugins but they're pre-built. | High | This is architecturally novel. Claude generates the worker code, deploys to integrations runner. Eliminates the "plugin marketplace" problem. |
| Universal ingest API | Everything flows through one endpoint. Hookdeck does this for webhooks but not as a developer control plane feature. | Medium | `POST /api/feed/ingest` with structured payloads. Source-agnostic. Well-defined schema. |
| Hot-deploy integrations without restart | Integrations runner picks up new workers dynamically. | High | Docker-based worker management. Must handle crashes gracefully. |

### GSD Framework Native Support

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| GSD phase state in sidebar per repo | No tool visualizes GSD workflow state. This is unique to Locus. | Medium | Read `.planning/` directory structure. Show current phase, milestone. |
| GSD event surfacing in feed | Phase transitions, discussion needs, research flags become feed items | Medium | Watch for GSD file changes, generate feed events. |
| Next-action buttons for GSD progression | One-click phase transitions from the UI | Medium | Maps to `/gsd:transition` and similar commands. Reduces context switching. |
| Skills system with UI triggers | Per-repo skills matching Claude Code's native skill model, but with visual management | Medium | Skill discovery, parameter entry, execution monitoring. Goes beyond what any CLI offers. |

### AI-Assisted Code Review

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Local AI review of diffs before posting | Prevents bot noise in GitLab/GitHub. Zed has AI in the editor but not review-specific. No tool does "review locally, promote to comments." | High | Claude reviews MR diffs, generates annotations. User selects which to promote. Novel workflow. |
| Diff viewing for both local changes and MRs | Unified surface for "what did Claude Code change?" and "what does this MR contain?" | Medium | Two modes: local git diff viewer + MR diff from GitLab/GitHub API. |
| Comment promotion to MR | User reviews AI suggestions, promotes selected ones to actual MR comments | Medium | Requires GitLab/GitHub API integration for posting comments. Must preserve line context. |

### Attention Management

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Smart feed prioritization (time-sensitive, @mentions) | Research shows 23-minute recovery from interruptions. Smart sorting reduces cognitive load. Linear does this for issues; nobody does it across all work signals. | High | ML/heuristic-based scoring. Source priority, mention detection, deadline proximity. |
| Morning brief / daily action plan | Future feature per PROJECT.md. Synthesizes GSD state + feed + calendar. No competing tool does this for individual developers. | High | Defer to post-v1. High value but high complexity. |
| Focus mode (suppress non-urgent feed) | Developers need uninterrupted coding time. VS Code and Slack have DND; Locus can be smarter. | Low | Filter feed to "Now" category only. Simple toggle. |

## Anti-Features

Features to explicitly NOT build. Each has a clear rationale.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| Full IDE / code editor | Zed, VS Code, Cursor own this space. Competing is suicidal. Locus is a control plane, not an editor. | Embed terminals. Show diffs. Link to editors. Never edit code directly. |
| Plugin marketplace | Backstage's plugin ecosystem requires massive community investment. Locus's user base (single-user instances) makes a marketplace pointless. | Self-building integrations via Claude. The AI IS the plugin system. |
| Multi-user collaboration / team features | Massively increases complexity (RBAC, permissions, conflict resolution). Single-user is a strength -- it's YOUR cockpit. | Each engineer runs their own instance. Share nothing. |
| Autonomous AI actions | AI that takes action without human approval erodes trust. Research shows developers want AI suggestions, not AI autonomy. | Feed auto-sorts but never auto-acts. AI reviews but user promotes comments. Human-in-the-loop always. |
| Full Jira/GitLab/GitHub UI replacement | These are deep, mature products. Recreating their features is a multi-year trap. | Show what needs attention, link out for deep operations. Locus is the router, not the destination. |
| Slack integration | Per PROJECT.md, user doesn't use Slack. Google Chat covers messaging. Building Slack support adds complexity for zero value. | Google Chat integration via ingest API. |
| Mobile UI (v1) | Responsive web on phone is mediocre. Native mobile is a separate product. Premature optimization. | Desktop/laptop browser only for v1. Future milestone for mobile with push notifications. |
| Full-text search across feed (v1) | Requires significant data volume to be useful. Search infrastructure (Elasticsearch/similar) adds operational complexity. | Command palette for navigation. Full-text search in future version. |
| Real-time collaborative editing | Google Docs, Notion, Zed own this. Locus terminals are single-user by design. | Single-user terminal sessions. No shared cursors or co-editing. |
| CI/CD pipeline management | Jenkins, GitLab CI, GitHub Actions have mature UIs. Rebuilding is waste. | Surface CI status in feed (pass/fail notifications). Link to CI UI for details. |

## Feature Dependencies

```
SSH Connection Management
  -> Terminal Emulation (requires SSH)
  -> tmux Session Attach (requires SSH)
  -> Git Branch State per Repo (requires SSH to remote machines)
    -> Git Operations (requires branch state visibility)

Universal Ingest API
  -> Feed Item Storage & Display
    -> Feed Categorization (requires items to categorize)
    -> Read/Dismiss/Snooze (requires feed display)
    -> Smart Prioritization (requires categorization)
  -> Self-Building Integrations (posts to ingest API)
    -> Integrator Skill (requires skills system + ingest API)

Claude Code Terminal Sessions
  -> AI Session Visibility (requires session tracking)
    -> "Needs Attention" Notifications (requires session state)
    -> Session History (requires session tracking)

Diff Viewing (local)
  -> AI-Assisted Review (requires diff surface)
    -> Comment Promotion to MR (requires AI review + GitLab/GitHub API)

GSD Directory Reading
  -> GSD Phase State Display
    -> GSD Events in Feed (requires feed + GSD state)
    -> Next-Action Buttons (requires GSD state + Claude Code sessions)

Skills System
  -> Skill Discovery & UI Triggers
    -> Integrator Skill (specialized skill for building integrations)

Command Palette
  -> Fuzzy Search across repos/machines/tickets
  (Independent of other features, build early)
```

## MVP Recommendation

### Phase 1: Foundation (must work or nothing else matters)

Prioritize:
1. **SSH connection management with tmux support** -- the entire product depends on reaching machines
2. **Terminal emulation with xterm.js** -- users must be able to work in Locus
3. **Multi-repo sidebar with branch state** -- visual context for what's happening across repos
4. **Basic git operations** -- fetch/pull/push/checkout from UI
5. **Command palette** -- fast navigation is table stakes for keyboard users

### Phase 2: Feed & Integration Foundation

6. **Universal ingest API** -- the architectural foundation for all integrations
7. **Feed display with categorization** -- show incoming signals, let users triage
8. **First integration: GitLab/GitHub webhooks** -- most immediately useful signal source
9. **Read/dismiss/snooze on feed items** -- feed must be manageable

### Phase 3: AI & Claude Code Integration

10. **Claude Code terminal sessions per repo** -- embedded AI coding
11. **AI session visibility across repos** -- the key differentiator
12. **Diff viewer for local changes** -- see what Claude changed
13. **GSD phase state display** -- sidebar shows GSD status per repo

### Phase 4: Review & Advanced Features

14. **AI-assisted MR review** -- Claude reviews, user promotes comments
15. **Self-building integrations via Integrator skill** -- Claude builds polling workers
16. **Skills system with UI** -- visual skill management
17. **Smart feed prioritization** -- ML/heuristic-based attention management

Defer:
- **Morning brief**: Needs feed data volume and usage patterns. Phase 5+.
- **Multi-agent orchestration view**: Industry is still defining patterns. Phase 5+.
- **Session context carry-over**: High complexity, low urgency for v1.
- **Full-text search**: Needs data volume. Future milestone.
- **Mobile UI**: Separate milestone entirely.

## Sources

- [Warp Agentic Development Environment](https://www.warp.dev/) -- terminal + AI agent features
- [Warp 2025 Year in Review](https://www.warp.dev/blog/2025-in-review) -- multi-agent, session sharing
- [VS Code 1.107 Multi-Agent Orchestration](https://visualstudiomagazine.com/articles/2025/12/12/vs-code-1-107-november-2025-update-expands-multi-agent-orchestration-model-management.aspx) -- Agent HQ, background agents
- [Backstage Developer Portal](https://getdx.com/blog/spotify-backstage/) -- service catalog, plugin ecosystem
- [Linear Project Management](https://linear.app/) -- keyboard-first, developer experience benchmark
- [Raycast Extensions](https://www.raycast.com/) -- command palette, extension system
- [Zed Editor AI Features](https://zed.dev/ai) -- agent panel, ACP protocol
- [GitKraken Multi-Repo Workspaces](https://www.gitkraken.com/features/workspaces) -- multi-repo management
- [Hookdeck Webhook Management](https://hookdeck.com) -- webhook ingestion patterns
- [AI Coding Agents Orchestration (Mike Mason)](https://mikemason.ca/writing/ai-coding-agents-jan-2026/) -- multi-agent architectural patterns
- [Developer Focus & Interruption Research](https://dasroot.net/posts/2026/03/building-distraction-free-development-environment/) -- 23-minute recovery cost
- [Termix SSH Management](https://github.com/Termix-SSH/Termix) -- web-based multi-machine terminal
- [DevPod Open Source](https://github.com/loft-sh/devpod) -- remote dev environment patterns
- [Google Antigravity](https://www.marktechpost.com/2025/11/19/google-antigravity-makes-the-ide-a-control-plane-for-agentic-coding/) -- IDE as agent control plane
