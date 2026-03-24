---
phase: 01-infrastructure-terminal-core
plan: 06
subsystem: ui
tags: [react, typescript, tailwind, zustand, auth, settings, forms]

requires:
  - phase: 01-02
    provides: backend auth endpoints, machine CRUD API
  - phase: 01-04
    provides: Zustand stores (authStore, machineStore), apiFetch client, design tokens
  - phase: 01-05
    provides: settings API endpoints (credentials, claude-code)
provides:
  - Login page with JWT authentication
  - Setup wizard (password, machine, credentials)
  - Settings pages (machines, credentials, Claude Code)
  - Machine form with test connection
  - TmuxPicker and RepoPicker modals
  - useApi helper functions (apiGet, apiPost, apiPut, apiDelete)
affects: [02-feed-integration, 03-diff-review]

tech-stack:
  added: []
  patterns: [form-with-test-connection, wizard-step-pattern, dynamic-credential-fields]

key-files:
  created:
    - frontend/src/hooks/useApi.ts
    - frontend/src/components/auth/LoginPage.tsx
    - frontend/src/components/auth/SetupWizard.tsx
    - frontend/src/components/auth/WizardStep.tsx
    - frontend/src/components/machines/MachineForm.tsx
    - frontend/src/components/machines/TmuxPicker.tsx
    - frontend/src/components/machines/RepoPicker.tsx
    - frontend/src/components/settings/SettingsPage.tsx
    - frontend/src/components/settings/MachineSettings.tsx
    - frontend/src/components/settings/CredentialSettings.tsx
    - frontend/src/components/settings/CredentialForm.tsx
    - frontend/src/components/settings/ClaudeCodeSettings.tsx
  modified:
    - frontend/src/App.tsx

key-decisions:
  - "Dynamic credential fields per service type (gitlab/github/jira/google/other) for extensibility"
  - "TmuxPicker auto-creates session when none exist (per D-14)"

patterns-established:
  - "Form-with-test: test connection button alongside submit, separate API call for testing"
  - "Wizard step pattern: WizardStep container with heading/body/active/completed states"
  - "Dynamic form fields: switch on service_type to render appropriate credential inputs"

requirements-completed: [AUTH-01, AUTH-02, AUTH-03, DEPL-02]

duration: 4min
completed: 2026-03-24
---

# Phase 1 Plan 6: Auth UI, Setup Wizard & Settings Pages Summary

**Login page, 3-step setup wizard (password/machine/credentials), and settings pages for machines, credentials, and Claude Code auth with push-to-machine**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-24T00:32:09Z
- **Completed:** 2026-03-24T00:35:50Z
- **Tasks:** 2
- **Files modified:** 13

## Accomplishments
- Login page with JWT auth via POST /api/auth/login, error handling, loading states
- Three-step setup wizard: password creation, machine addition with test connection, optional credential setup
- Settings page with machine CRUD (status dots, delete confirmation), credential management (per-type forms, test buttons), and Claude Code config (API key/OAuth + push-to-machine)
- TmuxPicker modal with auto-create on empty, RepoPicker modal with plain shell option
- App.tsx auth routing: loading -> wizard -> login -> AppShell

## Task Commits

Each task was committed atomically:

1. **Task 1: Login page + Setup wizard + API hook** - `09542b9` (feat)
2. **Task 2: Settings pages (Machines, Credentials, Claude Code)** - `1921218` (feat)

## Files Created/Modified
- `frontend/src/hooks/useApi.ts` - API helper functions wrapping apiFetch
- `frontend/src/components/auth/LoginPage.tsx` - Centered login form with JWT auth
- `frontend/src/components/auth/SetupWizard.tsx` - 3-step first-run wizard
- `frontend/src/components/auth/WizardStep.tsx` - Reusable step container
- `frontend/src/components/machines/MachineForm.tsx` - Machine add/edit with test connection
- `frontend/src/components/machines/TmuxPicker.tsx` - Tmux session picker modal
- `frontend/src/components/machines/RepoPicker.tsx` - Repository picker modal
- `frontend/src/components/settings/SettingsPage.tsx` - Settings layout with 3 sections
- `frontend/src/components/settings/MachineSettings.tsx` - Machine list with CRUD
- `frontend/src/components/settings/CredentialSettings.tsx` - Credential list with test/delete
- `frontend/src/components/settings/CredentialForm.tsx` - Dynamic credential form per service type
- `frontend/src/components/settings/ClaudeCodeSettings.tsx` - Claude Code auth config + push
- `frontend/src/App.tsx` - Auth state routing (wizard/login/shell)

## Decisions Made
- Dynamic credential fields per service type (gitlab/github/jira/google/other) for Phase 4 extensibility
- TmuxPicker auto-creates session when none exist, per D-14 decision
- All UI copy matches the UI-SPEC copywriting contract exactly

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- All auth UI surfaces complete, ready for end-to-end testing
- Settings pages wire to backend APIs from Plans 02 and 05
- Machine management forms ready for SSH connection flow in Plan 07

## Self-Check: PASSED

All 13 files verified present. Both task commits (09542b9, 1921218) verified in git log.

---
*Phase: 01-infrastructure-terminal-core*
*Completed: 2026-03-24*
