---
id: SEED-001
status: dormant
planted: 2026-03-24
planted_during: v1.0 Phase 01
trigger_when: After core UI is stable (post Phase 2)
scope: Large
---

# SEED-001: Integrated Test Mode for Human+AI Pair Verification

## Why This Matters

GSD's `/gsd:verify-work` relies on conversational UAT — the human describes what they see and Claude checks it off. This works but is slow, lossy, and can't verify visual/interaction details. An integrated test mode would let the AI *see* what the human sees, turning verification from a back-and-forth into a collaborative session where both sides have full context.

This also creates a general-purpose testing surface for Locus itself — embedded browser for UI testing, terminal for API/backend testing, with goals tracked on a checklist that auto-resolves as tests pass.

## When to Surface

**Trigger:** After core UI is stable (post Phase 2) — the terminal, panels, and work feed need to be solid before building a testing surface on top of them.

This seed should be presented during `/gsd:new-milestone` when the milestone scope matches any of these conditions:
- Milestone involves testing, QA, or verification workflows
- Milestone builds on completed Phase 2 (repo management + work feed)
- Milestone focuses on developer experience or GSD tooling improvements
- v2 planning begins

## Scope Estimate

**Large** — This is a full milestone. It involves an embedded browser (iframe or DevTools Protocol), screen recording/streaming to LLM, a goal-tracking UI panel, Playwright MCP or DevTools integration, and the orchestration layer connecting terminal/browser actions to verification goals.

## Core Ideas

1. **Embedded browser in Locus** — iframe or CDP-controlled browser panel for UI testing. Option to pop out into a separate tab.
2. **Pair testing model** — Goals/acceptance criteria displayed on one side, human and AI collaborate to check them off. Human clicks through the app or runs commands; AI watches and validates.
3. **Dual testing surfaces:**
   - **UI testing:** Embedded browser with visual feedback to LLM (screen recording, screenshots, or DevTools events)
   - **API/backend testing:** Terminal-based with structured output parsing against goal criteria
4. **Swappable test driver** — Start with DevTools Protocol (screen recording → LLM for visual context), Playwright MCP as alternative. Architecture should allow swapping.
5. **Screen recording → LLM** — Instead of DOM-based testing, record the screen/viewport and send frames to the LLM for visual verification. More robust than element selectors, works with any UI.
6. **GSD integration** — Feeds back into `/gsd:verify-work` and UAT workflows. Test results auto-populate verification artifacts.

## Breadcrumbs

Related code and decisions in the current codebase:

- `.planning/phases/01-infrastructure-terminal-core/01-UAT.md` — Current UAT format (conversational, manual verification)
- `frontend/src/components/terminal/TerminalView.tsx` — Terminal embedding pattern (xterm.js in React) — same pattern needed for embedded browser
- `frontend/src/components/layout/CenterPanel.tsx` — Tab-based panel system where test mode panel would live
- `frontend/src/hooks/useTerminal.ts` — WebSocket-backed real-time I/O — similar pattern needed for browser↔LLM streaming
- `.planning/REQUIREMENTS.md` — No testing-mode requirements yet; this would be a new requirement set

## Notes

- DevTools Protocol might be better than Playwright for this use case — it gives screen recording natively and doesn't require a separate browser process
- The "goals on one side, testing on the other" pattern could reuse the existing three-panel layout (goals in right panel where feed normally lives)
- Consider whether this replaces or complements GSD's existing `/gsd:verify-work` command
- The embedded browser could also serve double duty for previewing Locus's own frontend during development
