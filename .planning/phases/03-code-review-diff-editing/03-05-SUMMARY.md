---
phase: 03-code-review-diff-editing
plan: 05
subsystem: review-api-ui
tags: [review, api, comments, metadata, mr, pr, github, gitlab]
dependency_graph:
  requires: ["03-02", "03-04"]
  provides: ["review-api", "mr-metadata-header", "comment-threads", "review-store"]
  affects: ["frontend-diff-viewer", "center-panel", "session-store"]
tech_stack:
  added: []
  patterns: ["provider-pattern", "task-credential-chain", "zustand-store", "tanstack-query-hooks"]
key_files:
  created:
    - backend/app/api/review.py
    - backend/app/schemas/review.py
    - backend/app/services/review_service.py
    - frontend/src/hooks/useReviewApi.ts
    - frontend/src/stores/reviewStore.ts
    - frontend/src/components/diff/MrMetadataHeader.tsx
    - frontend/src/components/diff/CommentThread.tsx
  modified:
    - backend/app/main.py
    - frontend/src/components/diff/DiffViewer.tsx
    - frontend/src/components/layout/CenterPanel.tsx
    - frontend/src/stores/sessionStore.ts
decisions:
  - "Task-to-provider credential chain: task -> feed_item -> source_type + raw_payload -> IntegrationSource -> credential -> decrypt -> provider factory"
  - "Inline comment rendering via line number mapping in DiffViewer (to be replaced by extendData when Plan 04 lands)"
  - "DiffTab type extended with taskId and isMrDiff for MR/PR tab support"
metrics:
  duration: "9min"
  completed: "2026-03-28T12:19:34Z"
  tasks: 2
  files_changed: 11
---

# Phase 03 Plan 05: Review API + MR Metadata + Comments Summary

Review API with 6 endpoints wired through task-to-credential provider chain, MrMetadataHeader with collapsible metadata card, inline CommentThread with reply mutations, and reviewStore for annotations/comments/chat state.

## What Was Built

### Task 1: Review API endpoints + reviewStore + hooks (a69cd29)

**Backend Review API** (`backend/app/api/review.py`):
- 6 endpoints: GET /metadata, GET /diff, GET /comments, POST /reply, POST /submit, POST /approve
- `_get_provider_for_task()` helper chains task -> feed_item -> source_type + raw_payload -> IntegrationSource -> credential_id -> decrypt -> provider factory
- Handles both GitHub and GitLab credential extraction from raw_payload
- Router registered in main.py via `app.include_router(review_router)`

**Review Schemas** (`backend/app/schemas/review.py`):
- MrMetadata, CommentThread, CommentNote, ReviewComment, ReviewSubmission, ReplyRequest

**Review Service** (`backend/app/services/review_service.py`):
- ReviewProvider ABC with 7 abstract methods
- GitHubReviewProvider: uses GitHub REST API, groups comments into threads by in_reply_to_id
- GitLabReviewProvider: uses GitLab API v4, maps discussions to threads, handles atomic review gap (loop + individual discussions)
- `get_review_provider()` factory function

**reviewStore** (`frontend/src/stores/reviewStore.ts`):
- State: annotations, comments, reviewChatMessages, isReviewing, annotationPanelOpen, chatPanelOpen
- Actions: setAnnotations, setComments, addAnnotation, updateAnnotation, removeAnnotation, toggleAnnotationPanel, toggleChatPanel, addChatMessage, setIsReviewing

**useReviewApi hooks** (`frontend/src/hooks/useReviewApi.ts`):
- useMrMetadata, useMrDiff, useMrComments (TanStack queries with stale times)
- useReplyToComment (mutation + comments query invalidation)
- useSubmitReview, useApprove (mutations)

### Task 2: MR metadata header + inline comment threads (f4f3d04)

**MrMetadataHeader** (`frontend/src/components/diff/MrMetadataHeader.tsx`):
- Collapsed: single line with "MR !/PR #" prefix, title, author, status badge (color-coded), pipeline status
- Expanded: full card with description, branches (source -> target), reviewers, external link
- StatusBadge component with open/merged/closed color coding
- PipelineBadge component with success/failed/running/pending colors

**CommentThread** (`frontend/src/components/diff/CommentThread.tsx`):
- Renders parent comment + indented replies with relative timestamps
- Reply input: textarea that appears on "Reply" click, with Post (mutation) and Cancel
- Loading state during reply submission
- Resolved thread indicator

**DiffViewer updates**:
- Extended with optional comments, taskId, isMrDiff, diffText props
- Builds commentsByLine map for inline rendering at correct positions
- Renders CommentThread components below matching lines

**CenterPanel updates**:
- DiffViewerWithComments wrapper loads MR comments and passes to DiffViewer
- MrMetadataHeader rendered between diff tab header and diff content for MR/PR tabs
- GitPullRequest icon for MR/PR tab type
- DiffTab interface extended with taskId and isMrDiff fields

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Created review_service.py, schemas/review.py, github/gitlab providers**
- **Found during:** Task 1
- **Issue:** Plan 02 (which creates review_service.py, schemas/review.py) runs in parallel and hasn't landed yet. Plan 05's API layer needs to import from these modules.
- **Fix:** Created review_service.py with ReviewProvider ABC, GitHubReviewProvider, GitLabReviewProvider, get_review_provider factory. Created schemas/review.py with all required schemas. These match Plan 02's specification exactly so there should be no conflict when Plan 02 lands (or Plan 02 can skip creating these since they already exist).
- **Files created:** backend/app/services/review_service.py, backend/app/schemas/review.py
- **Commit:** a69cd29

**2. [Rule 3 - Blocking] Inline comment rendering without @git-diff-view/react extendData**
- **Found during:** Task 2
- **Issue:** Plan 04 (which replaces DiffViewer with @git-diff-view/react) runs in parallel. Current DiffViewer is the Phase 2 manual renderer with no widget/extendData system.
- **Fix:** Implemented inline comments via a line-number-to-comments map, rendering CommentThread components below matching diff lines. When Plan 04 lands with @git-diff-view/react, this will be upgraded to use the extendData + renderExtendLine API for proper inline widget rendering.
- **Files modified:** frontend/src/components/diff/DiffViewer.tsx
- **Commit:** f4f3d04

## Known Stubs

None. All components are fully wired to their data sources. MR/PR features will only display data when a task has a linked feed item with proper GitHub/GitLab credentials configured -- this is by design, not a stub.

## Self-Check: PASSED

All 7 created files verified present. Both commit hashes (a69cd29, f4f3d04) found in git history. TypeScript compiles with zero errors.
