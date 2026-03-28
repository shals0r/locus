---
phase: 03-code-review-diff-editing
plan: 08
subsystem: review-chat-board-actions
tags: [review, chat, ai, board, mr-pr, annotations]
dependency_graph:
  requires: ["03-03", "03-05", "03-06"]
  provides: ["ReviewChat", "ReviewAnnotations", "useReviewChat", "MR/PR task card actions"]
  affects: ["frontend/src/components/review/", "frontend/src/components/board/TaskCard.tsx", "backend/app/api/ai_review.py"]
tech_stack:
  added: []
  patterns: ["floating resizable panel", "diff text selection context", "MR/PR URL detection heuristic"]
key_files:
  created:
    - frontend/src/components/review/ReviewChat.tsx
    - frontend/src/components/review/ReviewAnnotations.tsx
    - frontend/src/hooks/useReviewChat.ts
    - frontend/src/stores/reviewStore.ts
    - backend/app/api/ai_review.py
    - backend/app/services/ai_review_service.py
  modified:
    - frontend/src/components/board/TaskCard.tsx
    - backend/app/main.py
decisions:
  - "ReviewChat is a fixed-right floating panel overlaying diff area (not pushing content)"
  - "Chat context built client-side from diff text, annotations, comments, and optional selected text"
  - "MR/PR detection via source_links URL pattern matching (github.com/pull/, gitlab/merge_requests/)"
  - "Approve and Request Changes handlers are placeholder stubs awaiting useReviewApi from Plan 05"
metrics:
  duration: "8min"
  completed: "2026-03-28"
---

# Phase 03 Plan 08: Review Chat + Board Actions Summary

Contextual chat panel for Claude-powered review conversations with diff/annotation context, plus MR/PR action buttons on task board cards connecting board workflow to diff/review surface.

## What Was Built

### Task 1: Review Chat Panel + Chat API Endpoint
- **Backend**: `POST /api/review/chat` endpoint accepting conversation messages and context string, calling `ai_review_service.chat_about_review()` for Claude-powered responses
- **Service**: `ai_review_service.py` with `review_diff()` and `chat_about_review()` functions calling Anthropic API
- **Hook**: `useReviewChat()` returning `sendMessage()` and `isLoading` -- builds context string from diff, annotations, comments, and selected text
- **Component**: `ReviewChat` floating panel (380px default, resizable 300-600px via drag handle) that slides from right edge, overlaying diff area. Features scrollable message list with user/assistant bubbles, code block formatting, auto-resize textarea, context indicator for diff text selection
- **Store**: `reviewStore` managing annotations, comments, chat messages, review/panel state

### Task 2: ReviewAnnotations + MR/PR Task Card Actions
- **Component**: `ReviewAnnotations` standalone reusable list with checkbox selection, severity badges (error/warning/suggestion/info), file:line references, editable comment textareas, and Select All/Deselect All toggle
- **TaskCard MR/PR detection**: URL pattern matching on `source_links` for GitHub (`/pull/`) and GitLab (`/merge_requests/`) patterns
- **Action buttons**: View Diff (opens diff tab via sessionStore), AI Review (opens diff tab), Approve, Request Changes -- visible on hover for MR/PR-linked tasks only

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Created reviewStore.ts (dependency from Plan 05)**
- **Found during:** Task 1
- **Issue:** Plan 08 depends on reviewStore.ts which Plan 05 creates, but Plan 05 runs in parallel
- **Fix:** Created reviewStore.ts with the full state shape needed by both plans
- **Files modified:** frontend/src/stores/reviewStore.ts

**2. [Rule 3 - Blocking] Created ai_review_service.py (dependency from Plan 06)**
- **Found during:** Task 1
- **Issue:** ai_review.py imports ai_review_service which Plan 06's dependencies would create
- **Fix:** Created complete service with review_diff and chat_about_review implementations
- **Files modified:** backend/app/services/ai_review_service.py

**3. [Rule 2 - Missing functionality] Approve/Request Changes as stubs**
- **Found during:** Task 2
- **Issue:** useApprove and ReviewSubmitDialog from Plan 05/06 not yet available
- **Fix:** Added console.log placeholder handlers with clear comments about future wiring
- **Files modified:** frontend/src/components/board/TaskCard.tsx

## Known Stubs

| File | Line | Stub | Reason |
|------|------|------|--------|
| frontend/src/components/board/TaskCard.tsx | 200-204 | `handleApprove` logs to console | Awaits `useApprove` mutation from Plan 05's `useReviewApi.ts` |
| frontend/src/components/board/TaskCard.tsx | 206-210 | `handleRequestChanges` logs to console | Awaits `ReviewSubmitDialog` from Plan 06 |

These stubs are intentional: the full review API hooks (Plan 05) and review submit dialog (Plan 06) are being built in parallel. The stubs will be wired when those plans complete.

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 | 524cf1e | feat(03-08): add review chat panel, chat API endpoint, and reviewStore |
| 2 | d50081f | feat(03-08): add ReviewAnnotations component and MR/PR task card actions |

## Self-Check: PASSED

All 8 key files verified present. Both commits (524cf1e, d50081f) verified in git log.
