---
phase: 03-code-review-diff-editing
verified: 2026-03-28T00:00:00Z
status: gaps_found
score: 3/6 success criteria verified
gaps:
  - truth: "User can view MR/PR diffs from GitLab and GitHub in the same diff viewer"
    status: partial
    reason: "Backend review API exists (review.py, review_service.py, github_review.py, gitlab_review.py), MrMetadataHeader and CommentThread components exist, but neither is rendered anywhere. CenterPanel passes DiffViewer directly without isMrDiff=true, mrId, or task_id. The MR diff pathway is unexercised end-to-end. Deferred pending credentials — human decision."
    artifacts:
      - path: "frontend/src/components/diff/MrMetadataHeader.tsx"
        issue: "Never imported or rendered in CenterPanel or DiffViewer"
      - path: "frontend/src/components/diff/CommentThread.tsx"
        issue: "Never imported or rendered"
      - path: "frontend/src/components/layout/CenterPanel.tsx"
        issue: "DiffViewer rendered without MR/PR props (no isMrDiff, no mrId, no task_id)"
    missing:
      - "CenterPanel must pass mrId and isMrDiff props to DiffViewer when diffData.sourceType === 'mr'"
      - "MrMetadataHeader must be rendered above DiffViewer for MR tabs"

  - truth: "User can trigger an AI review of any diff and see Claude's annotations inline, then promote selected annotations to actual MR/PR comments"
    status: partial
    reason: "AI review backend endpoint exists and is wired. Review trigger in DiffToolbar is implemented. However DiffToolbar is not rendered because DiffPanel (which contains DiffToolbar) is never imported or used. CenterPanel renders DiffViewer directly without DiffToolbar wrapper. Additionally AnnotationPanel is never rendered anywhere — annotationPanelOpen state is toggled but the panel itself is orphaned. ReviewSubmitDialog is never imported anywhere. Post as Comments button in AnnotationPanel has no onClick handler. User decision: AI review to be rearchitected to use Claude Code CLI sessions instead of direct API calls — mark as human_needed for final verification approach."
    artifacts:
      - path: "frontend/src/components/diff/DiffPanel.tsx"
        issue: "ORPHANED — built but never imported or rendered in CenterPanel"
      - path: "frontend/src/components/diff/AnnotationPanel.tsx"
        issue: "ORPHANED — never imported or rendered anywhere in the app"
      - path: "frontend/src/components/diff/ReviewSubmitDialog.tsx"
        issue: "ORPHANED — never imported or rendered anywhere in the app"
      - path: "frontend/src/components/layout/CenterPanel.tsx"
        issue: "Renders DiffViewer directly, bypassing DiffPanel with DiffToolbar, DiffFileList, DiffContextBar"
    missing:
      - "CenterPanel must render DiffPanel (or equivalent) instead of bare DiffViewer so that DiffToolbar, DiffFileList, DiffContextBar are visible"
      - "AnnotationPanel must be imported and rendered (inside DiffPanel or CenterPanel), conditioned on reviewStore.annotationPanelOpen"
      - "ReviewSubmitDialog must be imported and rendered, triggered from AnnotationPanel's Submit Review button"
      - "Post as Comments button in AnnotationPanel needs onClick handler calling useSubmitReview mutation"

  - truth: "User can approve or request changes on MRs/PRs from within Locus"
    status: failed
    reason: "Approve and Request Changes buttons in DiffToolbar are rendered as disabled stubs with title='coming soon'. TaskCard.handleApprove and handleRequestChanges log to console only (no mutation wired). useApprove and useSubmitReview hooks exist in useReviewApi.ts but are not connected to any UI."
    artifacts:
      - path: "frontend/src/components/diff/DiffToolbar.tsx"
        issue: "Approve and Request Changes buttons are disabled (line 181: disabled, title='Approve (coming soon)')"
      - path: "frontend/src/components/board/TaskCard.tsx"
        issue: "handleApprove only console.logs; handleRequestChanges only console.logs"
    missing:
      - "DiffToolbar Approve button must call useApprove mutation (available in useReviewApi.ts)"
      - "DiffToolbar Request Changes button must open ReviewSubmitDialog with REQUEST_CHANGES pre-selected"
      - "TaskCard handleApprove must call useApprove mutation"
      - "TaskCard handleRequestChanges must render ReviewSubmitDialog or call useSubmitReview"

human_verification:
  - test: "MR/PR diff viewing (SC2)"
    expected: "Opening a task card linked to a GitHub or GitLab MR opens the MR diff in the diff viewer with MrMetadataHeader showing title/author/status and existing comments inline"
    why_human: "Requires GitHub/GitLab credentials. Code exists but pipeline not wired in CenterPanel."

  - test: "AI review approach decision (SC3)"
    expected: "After rearchitecting to use Claude Code CLI sessions, user can trigger AI review from diff toolbar and see annotations inline"
    why_human: "User decision to rearchitect AI review. Current Anthropic API implementation works with LOCUS_LLM_API_KEY but user does not want a separate API key. Future implementation path not yet planned."

  - test: "Approve/Request Changes end-to-end (SC4)"
    expected: "Clicking Approve on an MR diff or task card calls the review API and updates the MR status"
    why_human: "Requires GitHub/GitLab credentials. Buttons are stub-disabled in current code."
---

# Phase 03: Code Review, Diff, and Editing Verification Report

**Phase Goal:** User can review diffs, get AI-assisted review annotations, and edit code directly in the browser via an embedded Monaco editor with file tree navigation and save-back to local/remote machines
**Verified:** 2026-03-28
**Status:** gaps_found
**Re-verification:** No — initial verification

## Context: User Testing Results Applied

The following success criteria were verified by the user in direct testing:
- **SC1 (local diffs): VERIFIED** — split/unified views work, per-file diffs correct, tab switching works
- **SC5 (file tree + editor): VERIFIED** — Monaco opens files, Ctrl+S saves, dark theme works
- **SC6 (edit from diff): VERIFIED** — Edit button opens file in editor tab

The following were not tested or require human action:
- **SC2 (MR/PR diffs):** Code exists but no credentials to test
- **SC3 (AI review):** User decision to rearchitect to use Claude Code CLI sessions
- **SC4 (approve/request changes):** Requires credentials; also blocked by stub buttons

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | User can view diffs of local changes in split or unified diff view | ✓ VERIFIED | User tested. DiffViewer renders with @git-diff-view/react, split default, toggle persisted to localStorage |
| 2 | User can view MR/PR diffs from GitLab and GitHub | ? PARTIAL | Backend API wired. Frontend components exist but MrMetadataHeader/CommentThread never rendered. CenterPanel does not pass mrId/isMrDiff to DiffViewer. Human needed for credentials. |
| 3 | User can trigger AI review, see annotations inline, promote to MR/PR comments | ✗ FAILED | DiffPanel (with DiffToolbar) is never rendered — CenterPanel uses bare DiffViewer. AnnotationPanel, ReviewSubmitDialog orphaned. Post as Comments has no onClick. AI review approach being rearchitected. |
| 4 | User can approve or request changes on MRs/PRs from within Locus | ✗ FAILED | Toolbar buttons are disabled stubs. TaskCard actions console.log only. useApprove/useSubmitReview hooks exist but unwired to UI. |
| 5 | User can browse file tree, open files in Monaco, edit, save back to machine | ✓ VERIFIED | User tested. FileTree shows directory structure, Monaco opens with dark theme, Ctrl+S saves. |
| 6 | User can open file from diff view and see diff update after saving | ✓ VERIFIED | User tested. Edit button in diff tab header opens editor tab. useWriteFile invalidates diff query cache. |

**Score:** 3/6 truths verified

---

## Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `backend/app/services/file_service.py` | File CRUD via machine_registry | ✓ VERIFIED | 301 lines, all 7 functions, uses run_command_on_machine |
| `backend/app/schemas/files.py` | Pydantic schemas for file ops | ✓ VERIFIED | 75 lines, 9 schemas, DirectoryEntry has path field |
| `backend/app/schemas/review.py` | Pydantic schemas for reviews | ✓ VERIFIED | 66 lines, ReviewAnnotation, MrMetadata, ReviewSubmission |
| `backend/app/api/files.py` | File CRUD endpoints | ✓ VERIFIED | 345 lines, 7+ endpoints including /search |
| `backend/app/services/review_service.py` | ReviewProvider ABC + factory | ✓ VERIFIED | 383 lines, GitHubReviewProvider and GitLabReviewProvider |
| `backend/app/services/github_review.py` | GitHub review implementation | ✓ VERIFIED | 246 lines, all 7 abstract methods |
| `backend/app/services/gitlab_review.py` | GitLab review implementation | ✓ VERIFIED | 319 lines, all 7 abstract methods |
| `backend/app/services/ai_review_service.py` | Claude API integration | ✓ VERIFIED | 142 lines, review_diff + chat_about_review |
| `backend/app/api/review.py` | Review API endpoints | ✓ VERIFIED | 252 lines, 6 endpoints wired to providers |
| `backend/app/api/ai_review.py` | AI review + chat endpoints | ✓ VERIFIED | 105 lines, /ai-review and /chat endpoints |
| `frontend/src/stores/sessionStore.ts` | Unified CenterTab model | ✓ VERIFIED | 367 lines, CenterTab union, openEditorTab, backward compat |
| `frontend/src/stores/editorStore.ts` | Editor dirty state | ✓ VERIFIED | 74 lines, dirtyFiles, fileContents, originalContents |
| `frontend/src/stores/reviewStore.ts` | Review state management | ✓ VERIFIED | 120 lines, annotations, comments, panel state |
| `frontend/src/stores/fileTreeStore.ts` | File tree expansion state | ✓ VERIFIED | 81 lines, expandedDirs, contextMenuTarget |
| `frontend/src/components/navigation/SessionTabBar.tsx` | Unified tab bar | ✓ VERIFIED | Uses useSessionStore.tabs, UnsavedDialog imported |
| `frontend/src/components/navigation/SidebarTabs.tsx` | Git/Files/Search tabs | ✓ VERIFIED | Three tabs, passed to Sidebar |
| `frontend/src/components/diff/DiffViewer.tsx` | @git-diff-view/react integration | ✓ VERIFIED | 402 lines, DiffView + DiffFile, dark theme, virtual scroll |
| `frontend/src/components/diff/DiffPanel.tsx` | Diff layout compositor | ⚠️ ORPHANED | 143 lines, exists but never imported in CenterPanel |
| `frontend/src/components/diff/DiffFileList.tsx` | Changed file list sidebar | ⚠️ ORPHANED | 93 lines, imported by DiffPanel (orphaned), not by CenterPanel |
| `frontend/src/components/diff/DiffToolbar.tsx` | Split/unified toggle + review | ⚠️ ORPHANED | 200 lines, imported by DiffPanel (orphaned). Approve/Request buttons disabled |
| `frontend/src/components/diff/DiffContextBar.tsx` | Context header bar | ⚠️ ORPHANED | 98 lines, imported by DiffPanel (orphaned) |
| `frontend/src/components/diff/AnnotationPanel.tsx` | Annotation side panel | ⚠️ ORPHANED | 283 lines, never imported anywhere in app |
| `frontend/src/components/diff/AnnotationGutter.tsx` | Gutter icons for annotations | ✓ VERIFIED | 71 lines, uses reviewStore, wired into DiffViewer |
| `frontend/src/components/diff/ReviewSubmitDialog.tsx` | Review submission dialog | ⚠️ ORPHANED | 267 lines, never imported anywhere in app |
| `frontend/src/components/diff/MrMetadataHeader.tsx` | MR/PR metadata header | ⚠️ ORPHANED | 152 lines, never imported anywhere in app |
| `frontend/src/components/diff/CommentThread.tsx` | Comment thread display | ⚠️ ORPHANED | 142 lines, never imported for rendering |
| `frontend/src/components/editor/CodeEditor.tsx` | Monaco editor component | ✓ VERIFIED | 314 lines, @monaco-editor/react, Ctrl+S, dirty tracking |
| `frontend/src/components/editor/FileBreadcrumb.tsx` | Breadcrumb navigation | ✓ VERIFIED | 81 lines, rendered in CenterPanel for both editor and diff tabs |
| `frontend/src/components/editor/UnsavedDialog.tsx` | Unsaved changes dialog | ✓ VERIFIED | 82 lines, imported by SessionTabBar |
| `frontend/src/components/filetree/FileTree.tsx` | File tree browser | ✓ VERIFIED | 283 lines, rendered in Sidebar Files tab |
| `frontend/src/components/filetree/FileTreeNode.tsx` | Tree node renderer | ✓ VERIFIED | 217 lines, calls openEditorTab on file click |
| `frontend/src/components/filetree/FileSearch.tsx` | Cross-file search panel | ✓ VERIFIED | 264 lines, rendered in Sidebar Search tab |
| `frontend/src/components/review/ReviewChat.tsx` | Review chat panel | ⚠️ ORPHANED | 318 lines, never imported anywhere in app |
| `frontend/src/components/review/ReviewAnnotations.tsx` | Annotation list component | ⚠️ ORPHANED | 144 lines, never imported anywhere in app |
| `frontend/src/hooks/useDiffData.ts` | Diff fetch hooks | ✓ VERIFIED | 129 lines, useDiffData + useChangedFiles |
| `frontend/src/hooks/useFileOperations.ts` | File CRUD hooks | ✓ VERIFIED | 254 lines, all ops wired to /api/files/, invalidates diff queries |
| `frontend/src/hooks/useMonacoTheme.ts` | Monaco theme registration | ✓ VERIFIED | 76 lines, locus-dark theme definition |
| `frontend/src/hooks/useReviewApi.ts` | Review API hooks | ✓ VERIFIED | 137 lines, useMrMetadata, useMrDiff, useMrComments, useSubmitReview, useApprove |
| `frontend/src/hooks/useAiReview.ts` | AI review trigger hook | ✓ VERIFIED | 79 lines, POST /api/review/ai-review, stores in reviewStore |
| `frontend/src/hooks/useReviewChat.ts` | Review chat hook | ✓ VERIFIED | 112 lines, POST /api/review/chat |

---

## Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `file_service.py` | `machine_registry.py` | `run_command_on_machine` | ✓ WIRED | 8 calls confirmed |
| `api/files.py` | `file_service.py` | import | ✓ WIRED | `from app.services.file_service import` at line 32 |
| `api/review.py` | `review_service.py` | `get_review_provider` | ✓ WIRED | 27: import, 158: factory call |
| `review_service.py` | `github_review.py` | factory | ✓ WIRED | Returns GitHubReviewProvider at line 371 |
| `ai_review_service.py` | Anthropic API | `ANTHROPIC_API_KEY` | ✓ WIRED | Uses env var (not settings.llm_api — deviation from plan, but works) |
| `useFileOperations.ts` | `/api/files/` | fetch | ✓ WIRED | All 7 endpoints called |
| `useAiReview.ts` | `/api/review/ai-review` | POST | ✓ WIRED | Line 53 |
| `useReviewChat.ts` | `/api/review/chat` | POST | ✓ WIRED | Line 84 |
| `DiffViewer.tsx` | `@git-diff-view/react` | `DiffView` | ✓ WIRED | Line 2 import, line 386 render |
| `DiffViewer.tsx` | `@git-diff-view/file` | `new DiffFile` | ✓ WIRED | Line 3 import |
| `useDiffData.ts` | `/api/git/diff` | fetch | ✓ WIRED | Confirmed in hook |
| `FileTreeNode.tsx` | `sessionStore.ts` | `openEditorTab` | ✓ WIRED | Line 33, 66 |
| `useFileOperations.ts` | `['diff', machineId]` | invalidateQueries | ✓ WIRED | Lines 77-79 |
| **DiffPanel.tsx** | **CenterPanel.tsx** | **usage** | ✗ NOT_WIRED | DiffPanel exports but is never imported. CenterPanel uses bare DiffViewer. |
| **AnnotationPanel.tsx** | **any parent** | **import+render** | ✗ NOT_WIRED | Never imported anywhere in the app |
| **ReviewSubmitDialog.tsx** | **any parent** | **import+render** | ✗ NOT_WIRED | Never imported anywhere in the app |
| **ReviewChat.tsx** | **any parent** | **import+render** | ✗ NOT_WIRED | Never imported anywhere in the app |
| **MrMetadataHeader.tsx** | **any parent** | **import+render** | ✗ NOT_WIRED | Never imported anywhere in the app |
| **TaskCard.tsx** | **useApprove** | **mutation call** | ✗ NOT_WIRED | handleApprove only console.logs |

---

## Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|-------------------|--------|
| `DiffViewer.tsx` | `rawDiffText` | `useDiffData` → `/api/git/diff` → git CLI | Yes — git diff on machine | ✓ FLOWING |
| `CodeEditor.tsx` | `fileContent` | `useReadFile` → `/api/files/read` → base64 cat on machine | Yes — reads real files | ✓ FLOWING |
| `FileTree.tsx` | `entries` | `useListDirectory` → `/api/files/list` → ls on machine | Yes — real directory listing | ✓ FLOWING |
| `FileSearch.tsx` | `results` | `/api/files/search` → grep on machine | Yes — real grep results | ✓ FLOWING |
| `AnnotationPanel.tsx` | `annotations` | `reviewStore.annotations` set by `useAiReview` | Real API data when LLM key set | ✓ FLOWING (data path exists, panel orphaned) |

---

## Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Backend imports | `python -c "from app.api.files import router; from app.api.review import router as r2; from app.api.ai_review import router as r3; print('OK')"` | Cannot run outside container | ? SKIP |
| Frontend TS compile | `npx tsc --noEmit` | Not run — would require node env | ? SKIP |
| DiffViewer renders @git-diff-view | Grep for `DiffView` in DiffViewer.tsx | Found at line 386 | ✓ PASS |
| openEditorTab called on file click | Grep FileTreeNode for openEditorTab | Found at lines 33, 66 | ✓ PASS |
| Ctrl+S save registered | Grep CodeEditor for addCommand/CtrlCmd | Found at line 115-116 | ✓ PASS |
| useWriteFile invalidates diff queries | Grep useFileOperations for invalidate+diff | Found at lines 77-78 | ✓ PASS |
| AnnotationPanel rendered anywhere | grep -rn AnnotationPanel src/ (import+render) | Not found | ✗ FAIL |
| DiffPanel rendered anywhere | grep -rn DiffPanel src/ | Only defined in DiffPanel.tsx | ✗ FAIL |
| DiffToolbar visible to user | CenterPanel renders DiffPanel | CenterPanel bypasses DiffPanel | ✗ FAIL |

---

## Requirements Coverage

| Requirement | Source Plans | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| DIFF-01 | Plans 03, 04 | View diffs of local changes in unified or split diff view | ✓ SATISFIED | User verified. DiffViewer with @git-diff-view renders local diffs. |
| DIFF-02 | Plans 03, 05 | View MR/PR diffs from GitLab and GitHub | ? NEEDS HUMAN | Backend wired. Frontend MR pathway exists but MrMetadataHeader not rendered. No credentials to test. |
| DIFF-03 | Plans 02, 06 | Trigger AI review, see annotations inline | ✗ BLOCKED | DiffToolbar (with Review button) not rendered — DiffPanel orphaned. AnnotationPanel not rendered. Rearchitect decision pending. |
| DIFF-04 | Plans 05, 06 | Promote annotations to actual MR/PR comments | ✗ BLOCKED | AnnotationPanel orphaned, Post as Comments button has no onClick, ReviewSubmitDialog not rendered. |
| DIFF-05 | Plans 05, 06 | Approve or request changes on MRs/PRs from within Locus | ✗ BLOCKED | DiffToolbar Approve/Request Changes buttons are disabled stubs. TaskCard handlers are console.log only. |
| EDIT-01 | Plans 01, 07 | Browse file tree, open files in Monaco, edit, save back | ✓ SATISFIED | User verified. File tree loads, Monaco opens with dark theme, Ctrl+S saves. |
| EDIT-02 | Plan 07 | Multiple editor tabs, unsaved indicator, Save/Discard dialog | ✓ SATISFIED | User verified. editorStore dirty tracking, dot indicator, UnsavedDialog rendered by SessionTabBar. |
| EDIT-03 | Plans 07, 09 | Open file from diff view, see diff update after saving | ✓ SATISFIED | User verified. Edit button in diff tab header, useWriteFile invalidates diff cache. |

Note: EDIT-01/02/03 appear in ROADMAP.md phase requirements but not in REQUIREMENTS.md. They are tracked in the roadmap as editor feature requirements.

**Orphaned requirements (in REQUIREMENTS.md, mapped to Phase 3, no coverage):**
None — DIFF-01 through DIFF-05 are all claimed by Phase 3 plans.

---

## Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `backend/app/main.py` | 10, 22 | Duplicate import of `ai_review_router` | ⚠️ Warning | Harmless but messy; Python last-wins for module binding |
| `backend/app/main.py` | 130, 140 | Duplicate `app.include_router(files_router)` | ⚠️ Warning | FastAPI registers routes twice — generates duplicate route warning, not a functional break |
| `frontend/src/components/diff/DiffToolbar.tsx` | 183, 191 | Approve/Request Changes buttons `disabled`, title `"coming soon"` | ✗ BLOCKER | DIFF-05 requirement blocked — user cannot approve/request changes |
| `frontend/src/components/board/TaskCard.tsx` | 202, 208 | `handleApprove` and `handleRequestChanges` only console.log | ✗ BLOCKER | DIFF-05 requirement blocked from board card actions |
| `frontend/src/components/diff/AnnotationPanel.tsx` | 252-268 | "Post as Comments" button has no `onClick` handler | ✗ BLOCKER | DIFF-04 requirement blocked — cannot promote annotations to MR comments |
| `frontend/src/components/diff/DiffPanel.tsx` | (whole file) | Exported component never imported | ⚠️ Warning | DiffToolbar, DiffFileList, DiffContextBar invisible to users because DiffPanel is orphaned |

---

## Human Verification Required

### 1. MR/PR Diff Viewing (SC2 / DIFF-02)

**Test:** With a GitHub or GitLab integration configured, create a task linked to an open MR/PR. Click "View Diff" on the task card.
**Expected:** Diff viewer opens showing the MR diff files; MrMetadataHeader shows title, author, status; existing teammate comments appear inline at their lines; "Reply" button creates a thread reply.
**Why human:** Requires live GitHub/GitLab credentials. Additionally, CenterPanel needs to pass mrId/isMrDiff to DiffViewer and render MrMetadataHeader — this wiring gap must be fixed before testing is meaningful.

### 2. AI Review via Rearchitected Approach (SC3 / DIFF-03)

**Test:** After the AI review feature is rearchitected to use Claude Code CLI sessions (user decision), trigger a review from the diff toolbar.
**Expected:** Annotations appear as gutter icons in the diff, annotation panel slides open, annotations are editable, and selected annotations can be posted to the MR.
**Why human:** User has deferred this to a future plan using Claude Code CLI sessions instead of a direct Anthropic API key. Current implementation (ANTHROPIC_API_KEY) is functional but not the desired approach. AnnotationPanel also needs to be wired into the rendering tree.

### 3. Approve / Request Changes (SC4 / DIFF-05)

**Test:** With credentials and an open MR/PR, click Approve on the DiffToolbar or the task card.
**Expected:** The MR is marked as approved in GitLab/GitHub and the UI reflects the new state.
**Why human:** Backend useApprove hook and review API exist. UI buttons are stub-disabled. Buttons need to be wired before this test is meaningful.

---

## Gaps Summary

Three distinct gap clusters block full phase goal achievement:

**Cluster 1: DiffPanel Orphaned (affects SC1 partially, SC3, SC4)**
`DiffPanel.tsx` was created as a compositor for DiffToolbar + DiffFileList + DiffContextBar + DiffViewer, but `CenterPanel.tsx` renders the bare `DiffViewer` directly. This means users see diffs work (SC1 verified) but without the toolbar (no split/unified toggle visible, no "Review with Claude" button, no file list sidebar). SC1 passes because the DiffViewer itself renders correctly; the surrounding chrome is invisible.

**Cluster 2: AI Review Surface Orphaned (affects SC3, DIFF-03, DIFF-04)**
`AnnotationPanel.tsx`, `ReviewSubmitDialog.tsx`, and `ReviewChat.tsx` were built but never imported or rendered in the component tree. The `annotationPanelOpen` state in reviewStore is set but nothing reads it to conditionally render the panel. The "Post as Comments" button has no onClick handler. User has also decided to rearchitect the AI review trigger to use Claude Code CLI sessions.

**Cluster 3: Approve/Request Changes Stubs (affects SC4, DIFF-05)**
DiffToolbar Approve and Request Changes buttons have `disabled` attribute and `coming soon` titles. TaskCard MR action handlers only `console.log`. The `useApprove` and `useSubmitReview` hooks exist and are wired to the backend, but no UI element actually calls them.

**What was verified and works:**
- All backend services (file_service, review_service, github_review, gitlab_review, ai_review_service) are substantive and wired
- All backend API endpoints are registered and route correctly
- Local diff viewing (DiffViewer renders @git-diff-view) — user-confirmed
- Monaco editor with Ctrl+S save, dirty tracking, unsaved dialog — user-confirmed
- File tree browsing with recursive expansion — user-confirmed
- Edit from diff (opens editor tab) — user-confirmed
- Diff query invalidation after file save — code-verified

---

_Verified: 2026-03-28_
_Verifier: Claude (gsd-verifier)_
