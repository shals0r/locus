# Phase 4: Integrations Runner & Skills - Context

**Gathered:** 2026-03-28
**Status:** Ready for planning

<domain>
## Phase Boundary

User can build, deploy, and manage integration workers through Claude, and trigger per-repo skills from the UI. All workers (built-in and user-built) run as supervised subprocesses that POST to the existing ingest API. The Integrator meta-skill is a dedicated chat interface backed by Claude Code CLI. Per-repo skills are discovered via SSH scan of `.claude/commands/` and triggered from the sidebar. Creating diffs/reviews (Phase 3) and host agent (Phase 5) are out of scope.

</domain>

<decisions>
## Implementation Decisions

### Worker architecture
- **D-01:** All workers (including the 4 existing built-in adapters: GitHub, GitLab, Jira, Calendar) run as supervised subprocesses, not in-process. Uniform model for all workers.
- **D-02:** Workers are standalone Python scripts with a standard contract: a `poll()` function that returns items, plus a main loop that calls `poll()` on an interval and POSTs results to the ingest API (`POST /api/feed/ingest`). No class inheritance required.
- **D-03:** Worker code lives on the filesystem in a dedicated directory (e.g., `/data/workers/`). Easy to inspect, edit, and version.
- **D-04:** The existing 4 built-in adapters (currently using `BasePollingAdapter` in-process with APScheduler) must be migrated to the subprocess model. This means rewriting them as standalone scripts and moving mention detection/tier elevation into the ingest API endpoint.
- **D-05:** Workers run in subprocess isolation. The main app process never imports untrusted code. Each worker runs as its own Python process managed by a supervisor.
- **D-06:** Per-worker `requirements.txt` for dependencies. Deploy step runs `pip install` into a per-worker venv before starting the worker.
- **D-07:** Pre-install common integration libraries in the Docker image (httpx, requests, beautifulsoup4, lxml, feedparser, google-api-python-client, python-dateutil) so most workers need no extra deps.

### Worker lifecycle & crash handling
- **D-08:** Auto-restart with exponential backoff on worker crash. After 5 consecutive failures, auto-disable the worker and post a feed notification ("Worker X disabled after repeated failures").
- **D-09:** User can re-enable disabled workers from the management UI.

### Integrator skill flow
- **D-10:** The Integrator is a dedicated chat interface (side panel), NOT a terminal session. Custom chat UI purpose-built for building integration workers.
- **D-11:** Chat panel slides in from the right edge (resizable, like Phase 3 review chat). Shows conversation with Claude plus structured cards for config steps, test results, and deploy actions.
- **D-12:** AI backend is Claude Code CLI running on a connected machine. Chat messages route through a Claude Code session with the `/integrator` skill loaded. Leverages existing Claude auth and session infrastructure.
- **D-13:** Credentials are stored directly in Locus DB (Fernet-encrypted, Phase 1 pattern). Credentials are NEVER sent to Claude. The chat UI shows clear feedback: "Credentials saved securely -- Claude will reference them by name, not by value." Workers access credentials via environment variables injected by the supervisor.
- **D-14:** Build flow: user describes what to connect -> Claude writes worker script -> dry-run test against live API -> preview ingested items as cards -> user clicks Deploy.
- **D-15:** Dry-run testing: Claude runs the worker's `poll()` once against the real external API. Shows preview cards of what items would be ingested. If API call fails, Claude iterates on the code.
- **D-16:** Users can edit existing workers by reopening the Integrator chat. Claude loads current worker code, user describes changes, Claude edits and redeploys.
- **D-17:** Quick config UI on worker cards: adjust poll interval, update credentials, toggle enabled/disabled without opening the Integrator chat. Only structural code changes need Claude.

### Worker management UI
- **D-18:** Worker management lives in the Settings page as an "Integrations" section, alongside credentials and machine config.
- **D-19:** "New Integration" button opens the Integrator chat panel.
- **D-20:** Worker cards show: status dot (green=running, yellow=degraded, red=crashed/disabled), worker name, poll interval, last poll time, total items ingested, gear icon for quick config, play/pause button.
- **D-21:** Expandable log panel per worker: click a card to expand and show recent log lines (tail -f style). Streaming live output with auto-scroll. Last 100 lines by default with "Load more" option.

### Skills system
- **D-22:** Skills discovered via SSH scan of `.claude/commands/*.md` per repo. On repo selection, backend reads the directory over SSH. Results cached with 5-minute TTL.
- **D-23:** For each skill file: filename parsed as skill name, first line of file content used as description.
- **D-24:** Skills displayed as clickable chips/buttons in the sidebar under the selected repo's info section.
- **D-25:** Clicking a skill chip opens a new Claude Code terminal session in the center panel, pre-loaded with the skill command (e.g., `/commit`). User can interact with Claude during execution.
- **D-26:** Skills are sidebar-only. NOT searchable via command palette.

### Claude's Discretion
- Exact subprocess supervisor implementation (asyncio subprocess, custom process manager, etc.)
- Worker file naming conventions and directory structure
- Log storage format and rotation policy
- Integrator chat message format and structured card design
- Exact venv management strategy for per-worker dependencies
- How the supervisor injects credentials as environment variables
- Migration strategy for converting existing BasePollingAdapter adapters to standalone scripts

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Existing integration infrastructure
- `backend/app/integrations/base_adapter.py` -- Current BasePollingAdapter with poll()/execute() lifecycle, mention detection, tier elevation. Must be migrated to standalone script model.
- `backend/app/integrations/scheduler.py` -- Current APScheduler setup with adapter registry. Will be replaced by subprocess supervisor.
- `backend/app/integrations/github_adapter.py` -- Built-in GitHub adapter (migration target)
- `backend/app/integrations/gitlab_adapter.py` -- Built-in GitLab adapter (migration target)
- `backend/app/integrations/jira_adapter.py` -- Built-in Jira adapter (migration target)
- `backend/app/integrations/calendar_adapter.py` -- Built-in Google Calendar adapter (migration target)
- `backend/app/models/integration_source.py` -- IntegrationSource model with config JSON, credential_id, poll_interval, is_enabled

### Feed ingest API
- `backend/app/api/feed.py` -- Existing ingest endpoint that workers will POST to. Mention detection and tier elevation logic needs to move here from BasePollingAdapter.

### Credential storage
- `backend/app/api/settings.py` -- Existing credential management with Fernet encryption. Workers reference credentials by name; supervisor injects values as env vars.

### Docker infrastructure
- `docker-compose.yml` -- Current app + db services. No new containers needed (workers run as subprocesses in the app container).

### Project specification
- `.planning/PROJECT.md` -- Core architecture, constraints, key decisions
- `.planning/REQUIREMENTS.md` -- INTG-02, INTG-03, INTG-04, INTG-05, SKIL-01, SKIL-02, SKIL-03

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `BasePollingAdapter.execute()` lifecycle (poll -> mention check -> tier elevation -> ingest -> broadcast) -- logic to be distributed: mention/tier moves to ingest API, poll/ingest stays in worker scripts
- `IntegrationSource` model -- already has config JSON, credential_id, poll_interval, webhook_secret, is_enabled fields. May need new fields for subprocess state (pid, status, failure_count).
- Feed WebSocket broadcast (`broadcast_feed_update`) -- worker crash notifications can use the same broadcast mechanism
- Credential storage pattern (Fernet encryption in Postgres) -- reuse for worker credential references
- Phase 3 review chat panel pattern -- Integrator chat can follow similar side-panel overlay architecture

### Established Patterns
- Service layer pattern: logic in `services/`, API routes in `api/`, schemas in `schemas/`
- One Zustand store per domain -- will need new stores for `workers` and `skills`
- Settings page pattern with expandable sections and per-item config
- SSH-based file operations (used throughout for git ops, file access)
- WebSocket for real-time updates (status, feed) -- extend for worker log streaming

### Integration Points
- Settings page: add Integrations section alongside existing Credentials and Machines sections
- Sidebar: add skills chips under repo info when a repo is selected
- Center panel: Integrator chat as overlay panel (similar to Phase 3 review chat)
- Center panel: skill trigger opens new Claude Code terminal tab
- Feed: worker crash/disable notifications appear as feed items
- Ingest API: needs to absorb mention detection and tier elevation from BasePollingAdapter

</code_context>

<specifics>
## Specific Ideas

- Credentials must NEVER be sent to Claude -- stored in Locus DB only, injected as env vars by the supervisor. Chat UI must show clear feedback: "Credentials saved securely -- Claude never sees your credentials."
- Integrator chat is a dedicated side panel (not a terminal session) -- purpose-built for the build/test/deploy workflow with structured status cards
- The migration of 4 built-in adapters to subprocess model is a significant refactor -- mention detection and tier elevation logic moves from BasePollingAdapter into the ingest API so all workers (built-in and user-built) benefit from it centrally
- Skills bar in the sidebar should be unobtrusive -- only visible when a repo is selected and has `.claude/commands/` files

</specifics>

<deferred>
## Deferred Ideas

None -- discussion stayed within phase scope

</deferred>

---

*Phase: 04-integrations-runner-skills*
*Context gathered: 2026-03-28*
