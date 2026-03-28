---
phase: 03-code-review-diff-editing
plan: 06
subsystem: ai-review-ui
tags: [ai-review, annotations, gutter-icons, review-dialog, batch-post, zustand]

# Dependency graph
requires:
  - phase: 03-code-review-diff-editing
    plan: 02
    provides: "ai_review_service.py with review_diff() and chat_about_review()"
  - phase: 03-code-review-diff-editing
    plan: 04
    provides: "DiffViewer.tsx with @git-diff-view/react, DiffToolbar.tsx with placeholder buttons"
provides:
  - "POST /api/review/ai-review endpoint returning structured annotations"
  - "useAiReview hook for triggering AI review from frontend"
  - "reviewStore for annotation state (edit, select, panel open/close)"
  - "AnnotationGutter component with severity-colored icons"
  - "AnnotationPanel with editable annotations, batch select, and MR/PR comment posting"
  - "ReviewSubmitDialog with Approve/Request Changes/Comment event selection"
  - "DiffViewer annotation extendData overlay with inline previews"
  - "DiffToolbar wired with custom prompt popover and loading state"
affects: [03-code-review-diff-editing, frontend-diff-components]

# Tech tracking
tech-stack:
  added: []
  patterns: [reviewStore Zustand store for annotation state, useMutation for AI review trigger, extendData annotation overlay in DiffView, custom prompt popover pattern]

key-files:
  created:
    - backend/app/api/ai_review.py
    - backend/app/services/ai_review_service.py
    - frontend/src/stores/reviewStore.ts
    - frontend/src/hooks/useAiReview.ts
    - frontend/src/components/diff/AnnotationGutter.tsx
    - frontend/src/components/diff/AnnotationPanel.tsx
    - frontend/src/components/diff/ReviewSubmitDialog.tsx
  modified:
    - backend/app/main.py
    - frontend/src/components/diff/DiffViewer.tsx
    - frontend/src/components/diff/DiffToolbar.tsx

key-decisions:
  - "Annotations rendered as extendData in DiffView with inline previews (click to open panel)"
  - "Custom prompt popover on Review with Claude button (not a modal) for quick access"
  - "Post as Comments button disabled for local diffs per locked decision"
  - "ReviewSubmitDialog hidden entirely for local diffs per locked decision"
  - "ai_review_service.py duplicated in worktree for parallel execution compatibility"

patterns-established:
  - "reviewStore: Zustand store per domain for annotation state"
  - "useAiReview: useMutation pattern for API calls with store integration"
  - "AnnotationGutter: severity-colored icon components for diff integration"

requirements-completed: []

# Metrics
duration: 7min
completed: 2026-03-28
tasks: 2
files: 10
---

# Phase 03 Plan 06: AI Review Triggering and Annotation Display Summary

AI review endpoint with custom prompt support, severity-colored gutter annotations, editable annotation panel with batch MR/PR posting, and Approve/Request Changes/Comment review submission dialog.

## Performance

- **Duration:** 7 min
- **Started:** 2026-03-28T12:09:33Z
- **Completed:** 2026-03-28T12:16:14Z
- **Tasks:** 2
- **Files modified:** 10

## Accomplishments

- Backend API endpoint POST /api/review/ai-review that calls ai_review_service.review_diff() and returns structured annotations with 503 for missing LLM key
- Router registered in main.py via app.include_router pattern
- reviewStore (Zustand) managing annotation state: setAnnotations, updateAnnotation, toggleAnnotationSelected, selectAll, panel open/close, focused annotation
- useAiReview hook using TanStack Query useMutation to trigger reviews and store results
- AnnotationGutter component with severity-colored icons (error=red, warning=amber, suggestion=blue, info=gray)
- DiffViewer extended with annotation extendData overlay rendering inline previews below annotated lines
- DiffToolbar wired with custom prompt popover (textarea + Start Review button, Ctrl+Enter shortcut)
- AnnotationPanel (360px sliding overlay) with editable annotations, checkbox selection, batch post, and review submit
- ReviewSubmitDialog with three review events (Comment/Approve/Request Changes), optional summary, and include-annotations toggle
- Local diffs: "Post as Comments" disabled, ReviewSubmitDialog hidden per locked decision

## Task Commits

Each task was committed atomically:

1. **Task 1: AI review API endpoint + frontend hook + gutter icons** - `7f57f62` (feat)
2. **Task 2: Annotation panel + review submit dialog + batch post** - `d58df2c` (feat)

## Files Created/Modified

- `backend/app/api/ai_review.py` - AI review API endpoint with AiReviewRequest/AiReviewResponse schemas
- `backend/app/services/ai_review_service.py` - AI review service (duplicated for parallel worktree compatibility)
- `backend/app/main.py` - Added ai_review_router import and registration
- `frontend/src/stores/reviewStore.ts` - Zustand store for annotation state management
- `frontend/src/hooks/useAiReview.ts` - TanStack Query mutation hook for triggering AI review
- `frontend/src/components/diff/AnnotationGutter.tsx` - Severity-colored gutter icon component
- `frontend/src/components/diff/DiffViewer.tsx` - Extended with annotation extendData overlay and inline previews
- `frontend/src/components/diff/DiffToolbar.tsx` - Wired Review with Claude button with custom prompt popover
- `frontend/src/components/diff/AnnotationPanel.tsx` - Side panel for annotation editing, selection, and batch post
- `frontend/src/components/diff/ReviewSubmitDialog.tsx` - Review submission dialog with event selection

## Decisions Made

- Annotations are rendered via @git-diff-view/react's extendData system with inline previews (clicking opens full panel)
- Custom prompt uses a small popover anchored to the button rather than a separate modal for quick access
- "Post as Comments" button is disabled (not hidden) for local diffs to indicate the capability exists but is context-dependent
- ReviewSubmitDialog returns null for non-MR diffs (hidden entirely per locked decision)
- ai_review_service.py is created in the worktree since the parallel agent for plan 02 has its own copy; merge will reconcile

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Created ai_review_service.py in worktree**
- **Found during:** Task 1
- **Issue:** The service file was created by plan 03-02 in a parallel worktree, not present in this worktree
- **Fix:** Copied the exact file content from the main repo into this worktree
- **Files modified:** backend/app/services/ai_review_service.py
- **Commit:** 7f57f62

**2. [Rule 3 - Blocking] DiffViewer.tsx rewritten from Phase 2 base**
- **Found during:** Task 1
- **Issue:** Worktree has the Phase 2 DiffViewer.tsx (manual DiffLine renderer), not the Plan 04 @git-diff-view/react version
- **Fix:** Wrote the @git-diff-view/react version with annotation support directly (based on Plan 04 output in main repo)
- **Files modified:** frontend/src/components/diff/DiffViewer.tsx
- **Commit:** 7f57f62

**3. [Rule 3 - Blocking] DiffToolbar.tsx created from scratch**
- **Found during:** Task 1
- **Issue:** DiffToolbar.tsx doesn't exist in worktree (created by Plan 04 in parallel)
- **Fix:** Created with all Plan 04 functionality plus Plan 06 wiring (prompt popover, loading state)
- **Files modified:** frontend/src/components/diff/DiffToolbar.tsx
- **Commit:** 7f57f62

## Issues Encountered

None beyond the parallel worktree file availability (addressed as deviations above).

## User Setup Required

None - AI review requires LOCUS_LLM_API_KEY env var but the endpoint returns 503 gracefully if not configured.

## Known Stubs

| File | Line | Stub | Reason |
|------|------|------|--------|
| DiffToolbar.tsx | ~155 | Approve button disabled | Plan 05 will wire MR/PR approval actions |
| DiffToolbar.tsx | ~163 | Request Changes button disabled | Plan 05 will wire MR/PR actions |
| AnnotationPanel.tsx | ~166 | "Post as Comments" button has no mutation wired | Needs useSubmitReview from Plan 05 review API |

All stubs are intentional placeholders for Plan 05 MR/PR review API integration. The AI review trigger, annotation display, editing, selection, and review submission UI are fully functional.

## Self-Check: PASSED
