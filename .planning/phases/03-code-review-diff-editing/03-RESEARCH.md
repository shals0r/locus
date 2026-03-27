# Phase 3: Code Review, Diff & Editing - Research

**Researched:** 2026-03-28
**Domain:** Diff viewing, AI-assisted code review, Monaco editor, GitHub/GitLab PR/MR APIs, file operations over SSH
**Confidence:** HIGH (verified against official docs, existing codebase, and npm packages)

## Summary

Phase 3 transforms the basic diff viewer from Phase 2 into a full code review and editing surface. Three major capabilities are added: (1) a production-grade diff viewer with split/unified views, virtual scrolling, inline annotations, and MR/PR comment integration; (2) AI-assisted code review via Claude API that produces annotations promotable to real GitHub/GitLab comments; and (3) a Monaco-based code editor with file tree navigation and save-back to local/remote machines.

The existing codebase has a basic DiffViewer that renders raw diff lines with colored text (NOT using @git-diff-view/react despite having it installed). The Phase 2 implementation used a custom `DiffLine` component parsing `+`/`-` prefixes. This must be completely replaced with the proper @git-diff-view/react component, which provides split/unified views, syntax highlighting, virtual scrolling, and a widget system for inline annotations.

The GitHub and GitLab APIs have fundamentally different models for reviews. GitHub uses a "review" abstraction (create pending review, attach comments, submit with event), while GitLab uses "discussions" (independent threads on merge requests). The backend must abstract these differences behind a unified review service. Monaco editor v4.7.0 supports React 19 and can be configured to bundle from node_modules instead of CDN, critical for the Docker deployment.

**Primary recommendation:** Replace the Phase 2 DiffViewer entirely with @git-diff-view/react's DiffView component using DiffFile instances. Use the widget/extendData system for both AI annotations and MR/PR comments. Build a unified ReviewService that abstracts GitHub vs GitLab review APIs. Use @monaco-editor/react v4.7.0 with local monaco-editor bundling for the code editor.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Split (side-by-side) view by default, with toggle to switch to unified view -- remember user preference
- Full syntax highlighting on both sides of the diff (language-aware coloring)
- Full file displayed with changed sections highlighted -- no collapsed context regions
- Virtual scrolling for large diffs (render only visible lines)
- Changed file list shown as a persistent file list sidebar on the left side of the diff tab, with status icons (added/modified/deleted)
- Local diffs and MR/PR diffs use the same diff renderer, but with different context bars
- No inline commenting on local diffs -- inline comments only on MR/PR diffs
- Diff opens as a tab in the center panel (existing pattern from Phase 2)
- Explicit trigger: "Review with Claude" button in the diff view toolbar -- no auto-suggestion
- Custom prompt support: user can type review instructions to focus Claude's review
- Loading spinner while review runs, then all annotations appear at once (not streaming)
- Annotations displayed as gutter icons in the diff -- clicking an icon shows the annotation in a side panel
- Annotations are always editable text -- user can refine wording before promoting
- Select and batch-post: checkboxes on each annotation, then "Post selected as comments" button
- Full review submission flow: Approve, Request Changes, or Comment with optional summary message
- Contextual chat interface alongside the review (floating resizable side panel from right edge)
- Fetch and display all existing teammate comments inline in the diff view
- Full thread replies: user can read and reply to comment threads from within Locus
- MR/PR diffs are NOT accessed directly from feed items -- flow is Feed -> board card -> action
- MR/PR task cards have special actions: "View diff", "Send for AI review", "Approve", "Request changes"
- Monaco editor with dark theme matching Locus app theme
- Multiple file tabs supported within the editor
- Minimap enabled
- Basic autocomplete: Monaco's built-in word-based autocomplete + bracket matching, no LSP
- Find & replace: Ctrl+F / Ctrl+H with regex support (Monaco built-in)
- Explicit save with Ctrl+S -- dot on tab indicates unsaved changes
- Confirm dialog on closing tab with unsaved changes
- Full CRUD file operations: create new files, rename, delete from the file tree
- Works on both local and remote machine files -- SSH for remote, filesystem for local
- Opening a file from a diff view opens a separate editor tab
- Auto-reload from disk if no unsaved changes; notification if unsaved edits and file changed on disk
- Cross-file search: search panel in the sidebar (Git | Files | Search tabs)
- Left sidebar gains tabs per repo: "Git | Files | Search" -- repo-scoped
- Center panel tab bar: terminal tabs, diff tabs, and editor tabs all share one tab bar
- Icon prefix per tab type, tabs are draggable/reorderable, no tab persistence across sessions
- Clickable breadcrumb navigation at top of editor/diff tabs
- MR/PR metadata shown as collapsible header bar at top of diff tab
- Context-aware keyboard shortcuts
- Command palette extended with file/editor actions

### Claude's Discretion
- Exact diff library choice and configuration (evaluate @git-diff-view/react vs alternatives)
- Loading skeleton and spinner design
- Exact spacing, typography, and icon choices
- Error state handling for failed file loads, SSH disconnects during edit, API failures
- Chat interface implementation details
- How file watching/change detection works for auto-reload
- Annotation severity categories and visual treatment

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope
</user_constraints>

## Standard Stack

### Core (Phase 3 specific)

| Library | Version | Purpose | Why Standard | Confidence |
|---------|---------|---------|--------------|------------|
| @git-diff-view/react | ^0.1.3 | Diff viewer with split/unified views, syntax highlighting, virtual scrolling, widget system | Already installed in Phase 2. GitHub-style UI, 280ms initial render, 40kb bundle, 60fps scroll. Widget system enables inline annotations. Only React diff library with built-in split view + virtual scrolling + widget system. | HIGH |
| @git-diff-view/file | ^0.1.3 | DiffFile class for parsing unified diffs | Already installed in Phase 2. Provides DiffFile constructor that accepts raw unified diff text in hunks array. | HIGH |
| @monaco-editor/react | ^4.7.0 | React wrapper for Monaco editor | Stable v4.7.0 supports React 19. Zero webpack config needed. Exports Editor, DiffEditor, useMonaco, loader. Can bundle monaco-editor from node_modules (no CDN). | HIGH |
| monaco-editor | ^0.52.2 | Core Monaco editor (peer dep of @monaco-editor/react) | Powers VS Code. Built-in autocomplete, find/replace, minimap, 50+ language syntax highlighting, dark themes. | HIGH |
| httpx | ^0.28 | Backend HTTP client for GitHub/GitLab API calls | Already in use for LLM API calls. Async-native, used for outbound API calls. | HIGH |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @git-diff-view/core | (transitive) | SplitSide enum, DiffModeEnum | Imported for type-safe mode selection and side identification |
| vite-plugin-monaco-editor | ^1.1.0 | Monaco worker bundling for Vite | Needed to bundle Monaco web workers (editor, json, css, html, typescript workers) correctly with Vite |
| lucide-react | (installed) | Icons for tabs, file tree, annotations | Already in use throughout the app |
| react-resizable-panels | ^2.x | Panel resizing for chat overlay, sidebar tabs | Already installed and used in AppShell/Sidebar |

### Diff Library Evaluation (Claude's Discretion)

**Recommendation: Use @git-diff-view/react** (already installed)

| Library | Split View | Virtual Scroll | Widget System | Bundle Size | Verdict |
|---------|-----------|---------------|---------------|-------------|---------|
| @git-diff-view/react | Yes | Yes | Yes (renderWidgetLine, extendData) | 40kb | USE THIS |
| react-diff-view | Yes | No (manual) | Tokenize/decorate API | 35kb | No widget system for inline annotations |
| react-diff-viewer-continued | Yes | No | No | 60kb | No unified diff parsing, no virtual scroll |

@git-diff-view/react wins because it has the widget system (`renderWidgetLine`, `renderExtendLine`, `extendData`) needed for inline annotations/comments, built-in virtual scrolling, and split/unified mode toggle. It is already installed.

### NOT Installing

| Library | Why Not |
|---------|---------|
| socket.io-client | Not needed -- existing WebSocket pattern with native FastAPI WebSocket |
| @anthropic-ai/sdk | Not needed -- existing pattern uses httpx + raw Anthropic Messages API |
| codemirror | Monaco is the locked decision |

**Installation:**
```bash
# Frontend
cd frontend && npm install @monaco-editor/react monaco-editor vite-plugin-monaco-editor

# Backend: no new Python packages needed (httpx already installed)
```

## Architecture Patterns

### Recommended Project Structure (New Files)

```
frontend/src/
  components/
    diff/
      DiffViewer.tsx           # REPLACE existing -- full @git-diff-view/react integration
      DiffFileList.tsx         # Changed file list sidebar within diff tab
      DiffToolbar.tsx          # Toolbar: split/unified toggle, review button, approve/reject
      DiffContextBar.tsx       # Local vs MR/PR context header
      MrMetadataHeader.tsx     # Collapsible MR/PR metadata bar
      AnnotationPanel.tsx      # Side panel showing annotation details
      AnnotationGutter.tsx     # Gutter icons for annotations
      CommentThread.tsx        # Existing MR/PR comment thread display
      ReviewSubmitDialog.tsx   # Approve/Request Changes/Comment dialog
    editor/
      CodeEditor.tsx           # Monaco editor wrapper
      EditorTabs.tsx           # Multi-file tab bar within editor
      FileBreadcrumb.tsx       # repo > branch > path > file navigation
      UnsavedDialog.tsx        # Confirm dialog for unsaved changes
    filetree/
      FileTree.tsx             # Directory tree browser
      FileTreeNode.tsx         # Individual tree node (expand/collapse)
      FileSearch.tsx           # Cross-file search panel
    review/
      ReviewChat.tsx           # Contextual chat interface (right overlay panel)
      ReviewAnnotations.tsx    # Annotation list with checkboxes for batch post
    navigation/
      SidebarTabs.tsx          # Git | Files | Search tab switcher
      CenterPanelTabs.tsx      # EXTEND existing SessionTabBar for diff+editor tabs
  stores/
    editorStore.ts             # Open files, dirty state, active editor tab
    reviewStore.ts             # Annotations, review state, chat messages
    fileTreeStore.ts           # File tree expansion state, search results
  hooks/
    useDiffData.ts             # TanStack Query hooks for diff fetching (local + MR/PR)
    useReviewApi.ts            # GitHub/GitLab review comment CRUD
    useFileOperations.ts       # File read/write/create/delete via backend API
    useMonacoTheme.ts          # Locus dark theme for Monaco

backend/app/
  api/
    review.py                  # Review endpoints: get MR/PR diff, comments, approve, post comments
    files.py                   # File CRUD: read, write, list directory, create, rename, delete
    ai_review.py               # AI review endpoint: send diff to Claude, get annotations
  services/
    review_service.py          # Abstract GitHub vs GitLab review APIs
    github_review.py           # GitHub-specific review implementation
    gitlab_review.py           # GitLab-specific review implementation
    file_service.py            # File operations via machine_registry (SSH/local)
    ai_review_service.py       # Claude API integration for code review
  schemas/
    review.py                  # Review request/response schemas
    files.py                   # File operation schemas
```

### Pattern 1: DiffView with DiffFile Instance

**What:** Use DiffFile constructor with raw unified diff text, initialize theme and build lines, render with DiffView component.
**When to use:** Every diff rendering scenario (local changes, MR/PR diffs, commit diffs).

```typescript
// Source: @git-diff-view/react GitHub README + Phase 2 summary (DiffFile pattern established)
import { DiffView, DiffModeEnum } from "@git-diff-view/react";
import { DiffFile } from "@git-diff-view/file";
import "@git-diff-view/react/styles/diff-view.css";

// Parse raw unified diff into DiffFile instance
const diffFile = new DiffFile(
  oldFileName,    // e.g., "a/src/main.ts"
  "",             // old content (empty when using raw diff)
  newFileName,    // e.g., "b/src/main.ts"
  "",             // new content (empty when using raw diff)
  [rawDiffText],  // raw unified diff as single-element hunks array
  "typescript",   // old file language for syntax highlighting
  "typescript"    // new file language for syntax highlighting
);
diffFile.initTheme("dark");
diffFile.initRaw();
diffFile.buildSplitDiffLines();  // needed for split view
diffFile.buildUnifiedDiffLines(); // needed for unified view

// Render
<DiffView
  diffFile={diffFile}
  diffViewMode={DiffModeEnum.Split}  // or DiffModeEnum.Unified
  diffViewTheme="dark"
  diffViewHighlight={true}
  diffViewWrap={false}
  diffViewAddWidget={true}  // enables + button for adding widgets
  extendData={annotationsExtendData}
  renderExtendLine={renderAnnotation}
  renderWidgetLine={renderCommentWidget}
  onAddWidgetClick={handleAddWidget}
/>
```

### Pattern 2: Widget System for Inline Annotations

**What:** Use extendData + renderExtendLine for displaying AI annotations and existing comments. Use renderWidgetLine for interactive comment creation.
**When to use:** MR/PR diff view with annotations and comments.

```typescript
// extendData structure: keyed by line number per side
const extendData = {
  oldFile: {
    "15": { data: { type: "annotation", text: "Potential null check missing", severity: "warning" } },
  },
  newFile: {
    "22": { data: { type: "comment", author: "teammate", body: "Why this change?", threadId: "123" } },
    "45": { data: { type: "annotation", text: "SQL injection risk", severity: "error" } },
  },
};

// renderExtendLine: renders the annotation/comment below the line
function renderExtendLine({ diffFile, side, data, lineNumber, onUpdate }) {
  if (data.type === "annotation") {
    return <AnnotationBubble annotation={data} lineNumber={lineNumber} />;
  }
  if (data.type === "comment") {
    return <CommentThread thread={data} lineNumber={lineNumber} />;
  }
  return null;
}

// renderWidgetLine: renders when user clicks "+" to add a new comment
function renderWidgetLine({ diffFile, side, lineNumber, onClose }) {
  return <NewCommentForm lineNumber={lineNumber} side={side} onClose={onClose} onSubmit={handleSubmit} />;
}
```

### Pattern 3: Unified Tab System in Center Panel

**What:** Extend the existing session store to support terminal, diff, and editor tabs in a single tab bar.
**When to use:** All center panel tab management.

```typescript
// Extend sessionStore (or create new tabStore)
type TabType = "terminal" | "diff" | "editor";

interface CenterTab {
  id: string;
  type: TabType;
  label: string;
  icon: "terminal" | "diff" | "file";
  // Type-specific data
  terminalData?: { sessionId: string; machineId: string };
  diffData?: { machineId: string; repoPath: string; filePath?: string; commitSha?: string; mrId?: string };
  editorData?: { machineId: string; filePath: string; isDirty: boolean };
}

// Tab bar renders icons by type, supports drag-to-reorder
// Mutual exclusion: only one tab active at a time
```

### Pattern 4: File Operations Service (Backend)

**What:** Backend service for file CRUD operations that routes through machine_registry.
**When to use:** Editor file read/write, file tree browsing, file creation/deletion.

```python
# backend/app/services/file_service.py
async def read_file(machine_id: str, file_path: str) -> str:
    """Read file content from any machine."""
    safe_path = shlex.quote(file_path)
    return await run_command_on_machine(machine_id, f"cat {safe_path}")

async def write_file(machine_id: str, file_path: str, content: str) -> None:
    """Write file content to any machine.
    Use heredoc to handle special characters safely."""
    safe_path = shlex.quote(file_path)
    # Use base64 encoding for binary-safe transfer
    import base64
    encoded = base64.b64encode(content.encode()).decode()
    await run_command_on_machine(
        machine_id,
        f"echo '{encoded}' | base64 -d > {safe_path}"
    )

async def list_directory(machine_id: str, dir_path: str) -> list[dict]:
    """List directory contents with type/size info."""
    safe_path = shlex.quote(dir_path)
    output = await run_command_on_machine(
        machine_id,
        f"ls -la --time-style=iso {safe_path}"
    )
    # Parse ls output into structured entries
    ...

async def file_stat(machine_id: str, file_path: str) -> dict:
    """Get file metadata (size, mtime) for change detection."""
    safe_path = shlex.quote(file_path)
    output = await run_command_on_machine(
        machine_id,
        f"stat --format='%s %Y' {safe_path}"
    )
    size, mtime = output.strip().split()
    return {"size": int(size), "mtime": int(mtime)}
```

### Pattern 5: GitHub vs GitLab Review Abstraction

**What:** A unified review service that abstracts provider differences.
**When to use:** All MR/PR operations (fetch diff, fetch comments, post comments, approve).

```python
# backend/app/services/review_service.py
from abc import ABC, abstractmethod

class ReviewProvider(ABC):
    @abstractmethod
    async def get_mr_diff(self, mr_id: str) -> dict: ...
    @abstractmethod
    async def get_mr_comments(self, mr_id: str) -> list[dict]: ...
    @abstractmethod
    async def post_review(self, mr_id: str, comments: list, event: str, body: str) -> dict: ...
    @abstractmethod
    async def reply_to_comment(self, mr_id: str, comment_id: str, body: str) -> dict: ...
    @abstractmethod
    async def approve(self, mr_id: str) -> dict: ...

# GitHub implementation uses:
# - POST /repos/{owner}/{repo}/pulls/{pull_number}/reviews (create with comments + event)
# - GET /repos/{owner}/{repo}/pulls/{pull_number}/files (file list with patches)
# - GET /repos/{owner}/{repo}/pulls/{pull_number}/comments (existing comments)

# GitLab implementation uses:
# - GET /projects/:id/merge_requests/:iid/changes (file diffs)
# - GET /projects/:id/merge_requests/:iid/discussions (comments as threads)
# - POST /projects/:id/merge_requests/:iid/discussions (new thread with position)
# - POST /projects/:id/merge_requests/:iid/approve (approve)
```

### Pattern 6: AI Review via Claude Messages API

**What:** Send diff to Claude API with system prompt for code review, get structured annotations back.
**When to use:** "Review with Claude" button click.

```python
# backend/app/services/ai_review_service.py
async def review_diff(diff_text: str, custom_prompt: str | None = None) -> list[dict]:
    """Send diff to Claude for code review, return structured annotations."""
    system_prompt = (
        "You are a senior code reviewer. Analyze the following git diff and provide "
        "specific, actionable review comments. For each issue found, respond with a JSON "
        "array of objects with these fields:\n"
        "- file: the file path\n"
        "- line: the line number in the new file\n"
        "- severity: 'error', 'warning', 'suggestion', or 'info'\n"
        "- comment: your review comment\n"
        "Respond ONLY with the JSON array."
    )
    if custom_prompt:
        system_prompt += f"\n\nAdditional reviewer instructions: {custom_prompt}"

    # Uses existing httpx + Anthropic Messages API pattern from feed_service.py
    async with httpx.AsyncClient(timeout=60.0) as client:
        response = await client.post(
            settings.llm_api_url,
            headers={
                "x-api-key": settings.llm_api_key,
                "anthropic-version": "2023-06-01",
                "content-type": "application/json",
            },
            json={
                "model": settings.llm_model,
                "max_tokens": 4096,
                "system": system_prompt,
                "messages": [{"role": "user", "content": diff_text}],
            },
        )
        response.raise_for_status()
        data = response.json()
        text = data["content"][0]["text"]
        return json.loads(text)
```

### Pattern 7: Monaco Editor with Local Bundling

**What:** Configure Monaco to load from node_modules instead of CDN, critical for Docker deployment.
**When to use:** CodeEditor component initialization.

```typescript
// frontend/src/components/editor/CodeEditor.tsx
import Editor, { loader } from "@monaco-editor/react";
import * as monaco from "monaco-editor";

// Configure loader to use local monaco-editor package (no CDN)
loader.config({ monaco });

// Component
function CodeEditor({ filePath, machineId, content, language, onSave }) {
  const editorRef = useRef(null);

  function handleMount(editor, monacoInstance) {
    editorRef.current = editor;
    // Register Ctrl+S save
    editor.addCommand(monacoInstance.KeyMod.CtrlCmd | monacoInstance.KeyCode.KeyS, () => {
      onSave(editor.getValue());
    });
  }

  return (
    <Editor
      height="100%"
      language={language}
      theme="vs-dark"  // or custom Locus theme
      value={content}
      onMount={handleMount}
      onChange={handleContentChange}
      options={{
        minimap: { enabled: true },
        fontSize: 13,
        wordWrap: "off",
        automaticLayout: true,
        scrollBeyondLastLine: false,
      }}
    />
  );
}
```

### Anti-Patterns to Avoid

- **Don't render raw diff lines manually:** Phase 2's DiffViewer manually renders `<DiffLine>` components. This must be replaced with @git-diff-view/react which handles syntax highlighting, virtual scrolling, and line numbering properly.
- **Don't use Monaco CDN in Docker:** The default @monaco-editor/react behavior loads from CDN. Docker containers may not have internet access. Always configure `loader.config({ monaco })` to use local bundle.
- **Don't mix GitHub and GitLab API logic in one function:** Use the ReviewProvider abstraction. GitHub reviews are atomic (create + submit), GitLab discussions are individual threads.
- **Don't fetch entire file content for large files:** Use range reads or streaming for files > 1MB. The `cat` command will block on huge files.
- **Don't poll for file changes from the frontend:** Use backend polling with WebSocket push, or let the user trigger refresh. No `setInterval` watching from the browser.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Diff parsing and rendering | Custom DiffLine component | @git-diff-view/react DiffView | Handles unified diff parsing, syntax highlighting, virtual scrolling, split/unified modes, line numbering, gutter |
| Code editor | textarea or contentEditable | Monaco Editor via @monaco-editor/react | Syntax highlighting for 50+ languages, autocomplete, find/replace, minimap, keyboard shortcuts, undo/redo |
| Diff syntax highlighting | Manual regex colorization | DiffFile with diffViewHighlight=true | Uses HAST AST for accurate language-aware syntax highlighting |
| Virtual scrolling for diffs | Custom windowing logic | @git-diff-view/react built-in | Built into the library, handles split view virtual scrolling correctly |
| File language detection | Manual extension mapping | Monaco's built-in language detection + DiffFile lang parameter | Monaco auto-detects from file extension; for DiffFile, extract extension and map to language ID |
| Tab drag-and-drop reorder | Custom DnD implementation | HTML5 Drag API or a tiny library like @dnd-kit | Tab reordering is surprisingly complex with edge cases |

**Key insight:** The diff viewer and code editor are the two most complex UI components in this phase. Both have mature, battle-tested library solutions. Custom implementations would take weeks and produce inferior results.

## Common Pitfalls

### Pitfall 1: Monaco Web Workers in Vite

**What goes wrong:** Monaco editor shows a blank editor or throws "Cannot read properties of undefined" errors because web workers fail to load.
**Why it happens:** Monaco needs web workers for syntax highlighting, autocomplete, and validation. Vite's ESM module system does not automatically bundle these workers.
**How to avoid:** Use `vite-plugin-monaco-editor` to handle worker bundling, OR configure `loader.config({ monaco })` with the direct npm import (which is simpler for @monaco-editor/react). The loader approach is preferred since @monaco-editor/react handles worker setup internally when you provide the monaco instance directly.
**Warning signs:** Editor loads but syntax highlighting does not work, or TypeScript/JSON validation is missing.

### Pitfall 2: DiffFile Initialization Order

**What goes wrong:** DiffView renders empty or throws errors about missing diff data.
**Why it happens:** DiffFile must be initialized in a specific order: construct -> initTheme -> initRaw -> buildSplitDiffLines/buildUnifiedDiffLines. Skipping steps or calling out of order produces broken state.
**How to avoid:** Always call the full initialization chain. Memoize the DiffFile instance with useMemo, keyed on the diff text content.
**Warning signs:** "Cannot read property of undefined" in DiffView rendering, empty diff display.

### Pitfall 3: GitHub Review API Position vs Line Number

**What goes wrong:** Comments appear on wrong lines or API returns 422 errors.
**Why it happens:** GitHub's review comment API uses `position` (lines from the first @@ hunk header) for the older endpoint, and `line`/`side` for the newer endpoint. GitLab uses `old_line`/`new_line` with position object including base_sha/head_sha/start_sha.
**How to avoid:** Use the newer GitHub API with `line` and `side` parameters (not `position`). For GitLab, always include `diff_refs` (base_sha, head_sha, start_sha) from the merge request metadata in the position object.
**Warning signs:** 422 Unprocessable Entity from GitHub, "Note could not be created" from GitLab.

### Pitfall 4: File Content Transfer Over SSH

**What goes wrong:** File content gets corrupted when saving, especially with special characters, binary content, or large files.
**Why it happens:** Passing file content through shell commands (echo, heredoc) can mangle special characters, escape sequences, and null bytes.
**How to avoid:** Use base64 encoding for all file transfers: encode on send, decode on receive. This is binary-safe and handles all special characters. For reads: `base64 < file`, for writes: `echo 'encoded' | base64 -d > file`. Set a reasonable size limit (e.g., 5MB) and reject larger files.
**Warning signs:** Files with backticks, dollar signs, or non-UTF-8 content getting corrupted.

### Pitfall 5: Stale Diff After Editor Save

**What goes wrong:** User saves a file in the editor, but the diff view still shows old changes.
**Why it happens:** TanStack Query caches the diff response. After a file save, the cached diff data is stale.
**How to avoid:** After a successful file save, invalidate the related diff query using `queryClient.invalidateQueries({ queryKey: ["git-diff", ...] })`. Also invalidate changed-files queries so the sidebar updates.
**Warning signs:** Diff shows changes that were already saved, or shows "no changes" when there are actually new changes.

### Pitfall 6: MR/PR Source Identification

**What goes wrong:** Cannot determine whether a task card represents a GitHub PR or GitLab MR when the user clicks "View Diff".
**Why it happens:** The existing FeedItem model has `source_type` (e.g., "github", "gitlab") and `raw_payload` (JSON), but Task does not duplicate this metadata. The task only links to feed_item_id.
**How to avoid:** When opening a diff for an MR/PR task, look up the linked FeedItem to get source_type and raw_payload (which contains the PR number, repo owner, etc.). Store structured MR/PR metadata either in the task's source_links JSON field or the feed item's raw_payload.
**Warning signs:** "Cannot determine provider" errors when trying to fetch MR/PR diff.

## Code Examples

### Example 1: Complete DiffViewer Replacement

```typescript
// Source: @git-diff-view/react GitHub repo, verified pattern from Phase 2 summary
import { useCallback, useMemo, useState } from "react";
import { DiffView, DiffModeEnum } from "@git-diff-view/react";
import { DiffFile } from "@git-diff-view/file";
import "@git-diff-view/react/styles/diff-view.css";

interface Props {
  diffText: string;
  fileName: string;
  language: string;
  annotations?: AnnotationData[];
  comments?: CommentData[];
  isMrDiff?: boolean;
}

function DiffViewer({ diffText, fileName, language, annotations, comments, isMrDiff }: Props) {
  const [mode, setMode] = useState<DiffModeEnum>(DiffModeEnum.Split);

  const diffFile = useMemo(() => {
    if (!diffText) return null;
    const file = new DiffFile(fileName, "", fileName, "", [diffText], language, language);
    file.initTheme("dark");
    file.initRaw();
    file.buildSplitDiffLines();
    file.buildUnifiedDiffLines();
    return file;
  }, [diffText, fileName, language]);

  // Build extendData from annotations + comments
  const extendData = useMemo(() => buildExtendData(annotations, comments), [annotations, comments]);

  if (!diffFile) return <EmptyState />;

  return (
    <DiffView
      diffFile={diffFile}
      diffViewMode={mode}
      diffViewTheme="dark"
      diffViewHighlight={true}
      diffViewWrap={false}
      diffViewAddWidget={isMrDiff}  // only show "+" button on MR/PR diffs
      extendData={extendData}
      renderExtendLine={renderExtendLine}
      renderWidgetLine={isMrDiff ? renderWidgetLine : undefined}
    />
  );
}
```

### Example 2: Monaco Editor with Locus Theme and Save

```typescript
// Source: @monaco-editor/react GitHub README v4.7.0
import Editor, { loader, useMonaco } from "@monaco-editor/react";
import * as monaco from "monaco-editor";

// One-time: configure loader to use local npm package
loader.config({ monaco });

function CodeEditor({ filePath, content, language, onSave, isDirty }) {
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);

  const handleMount = useCallback((editor: monaco.editor.IStandaloneCodeEditor, m: typeof monaco) => {
    editorRef.current = editor;
    // Ctrl+S => save
    editor.addCommand(m.KeyMod.CtrlCmd | m.KeyCode.KeyS, () => {
      onSave(editor.getValue());
    });
    // Focus editor on mount
    editor.focus();
  }, [onSave]);

  return (
    <Editor
      height="100%"
      language={language}
      theme="locus-dark"  // custom theme registered via useMonaco
      value={content}
      onMount={handleMount}
      options={{
        minimap: { enabled: true },
        fontSize: 13,
        fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
        automaticLayout: true,
        scrollBeyondLastLine: false,
        wordWrap: "off",
        tabSize: 2,
        renderWhitespace: "selection",
        bracketPairColorization: { enabled: true },
      }}
    />
  );
}
```

### Example 3: GitHub Review Creation (Backend)

```python
# Source: GitHub REST API docs - Pull Request Reviews
async def create_github_review(
    client: httpx.AsyncClient,
    owner: str,
    repo: str,
    pull_number: int,
    comments: list[dict],
    event: str,  # "APPROVE" | "REQUEST_CHANGES" | "COMMENT"
    body: str = "",
    token: str = "",
) -> dict:
    """Create a GitHub PR review with inline comments and submit it."""
    review_comments = [
        {
            "path": c["file"],
            "line": c["line"],
            "side": "RIGHT",  # comments on new code
            "body": c["body"],
        }
        for c in comments
    ]

    response = await client.post(
        f"https://api.github.com/repos/{owner}/{repo}/pulls/{pull_number}/reviews",
        headers={
            "Authorization": f"Bearer {token}",
            "Accept": "application/vnd.github+json",
        },
        json={
            "event": event,
            "body": body,
            "comments": review_comments,
        },
    )
    response.raise_for_status()
    return response.json()
```

### Example 4: GitLab Discussion Creation (Backend)

```python
# Source: GitLab Discussions API docs
async def create_gitlab_discussion(
    client: httpx.AsyncClient,
    project_id: int,
    merge_request_iid: int,
    file_path: str,
    new_line: int,
    body: str,
    diff_refs: dict,  # {base_sha, head_sha, start_sha}
    token: str = "",
    gitlab_url: str = "https://gitlab.com",
) -> dict:
    """Create a GitLab MR discussion (inline comment)."""
    response = await client.post(
        f"{gitlab_url}/api/v4/projects/{project_id}/merge_requests/{merge_request_iid}/discussions",
        headers={"PRIVATE-TOKEN": token},
        json={
            "body": body,
            "position": {
                "base_sha": diff_refs["base_sha"],
                "head_sha": diff_refs["head_sha"],
                "start_sha": diff_refs["start_sha"],
                "position_type": "text",
                "new_path": file_path,
                "old_path": file_path,
                "new_line": new_line,
            },
        },
    )
    response.raise_for_status()
    return response.json()
```

### Example 5: File Operations via SSH

```python
# Source: Existing machine_registry.run_command_on_machine pattern
import base64
import shlex

async def read_file_content(machine_id: str, file_path: str) -> str:
    """Read file content, base64-encoded for binary safety."""
    safe_path = shlex.quote(file_path)
    encoded = await run_command_on_machine(
        machine_id, f"base64 < {safe_path}"
    )
    return base64.b64decode(encoded.strip()).decode("utf-8")

async def write_file_content(machine_id: str, file_path: str, content: str) -> None:
    """Write file content, base64-encoded for binary safety."""
    safe_path = shlex.quote(file_path)
    encoded = base64.b64encode(content.encode("utf-8")).decode("ascii")
    await run_command_on_machine(
        machine_id,
        f"printf '%s' '{encoded}' | base64 -d > {safe_path}"
    )

async def list_directory_tree(machine_id: str, dir_path: str) -> list[dict]:
    """List directory with file type detection."""
    safe_path = shlex.quote(dir_path)
    # Use find for recursive listing, or ls for single level
    output = await run_command_on_machine(
        machine_id,
        f"ls -1F {safe_path}"  # -F appends / to dirs, * to executables
    )
    entries = []
    for line in output.strip().split("\n"):
        if not line:
            continue
        is_dir = line.endswith("/")
        name = line.rstrip("/*@|=")
        entries.append({"name": name, "is_dir": is_dir})
    return sorted(entries, key=lambda e: (not e["is_dir"], e["name"]))
```

## GitHub vs GitLab API Comparison

| Operation | GitHub API | GitLab API |
|-----------|-----------|-----------|
| Get PR/MR details | GET /repos/{o}/{r}/pulls/{n} | GET /projects/{id}/merge_requests/{iid} |
| Get changed files | GET /repos/{o}/{r}/pulls/{n}/files (returns patch per file) | GET /projects/{id}/merge_requests/{iid}/changes (returns diff per file) |
| Get full diff | GET /repos/{o}/{r}/pulls/{n} with Accept: application/vnd.github.diff | Concatenate diffs from /changes endpoint |
| List comments | GET /repos/{o}/{r}/pulls/{n}/comments | GET /projects/{id}/merge_requests/{iid}/discussions |
| Create review with comments | POST /repos/{o}/{r}/pulls/{n}/reviews (atomic: event + comments) | No atomic review -- individual POST to /discussions for each comment |
| Reply to thread | POST /repos/{o}/{r}/pulls/{n}/comments/{id}/replies | POST /projects/{id}/merge_requests/{iid}/discussions/{did}/notes |
| Approve | POST /repos/{o}/{r}/pulls/{n}/reviews with event=APPROVE | POST /projects/{id}/merge_requests/{iid}/approve |
| Request changes | POST /repos/{o}/{r}/pulls/{n}/reviews with event=REQUEST_CHANGES | No direct equivalent -- post comments and unapprove |
| Comment placement | Uses `line` + `side` (LEFT/RIGHT) on file path | Uses `position` object with old_line/new_line + base_sha/head_sha/start_sha |

**Critical difference:** GitHub reviews are atomic (one API call creates a review with all comments and an event). GitLab has no review concept -- each comment is an independent discussion thread, and approval is a separate action. The backend must handle this: for GitHub, batch all comments into one review; for GitLab, create discussions sequentially then approve separately.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| react-diff-viewer | @git-diff-view/react | 2024 | Virtual scrolling, widget system, split/unified, 60fps scroll |
| Monaco CDN loading | Monaco local bundle via loader.config({ monaco }) | @monaco-editor/react v4.4.0+ | Required for offline/Docker, eliminates CDN dependency |
| @monaco-editor/react v4.6.x | v4.7.0 | Feb 2025 | React 19 support as peer dependency |
| GitHub position-based comments | GitHub line+side comments | 2022+ | More intuitive, maps directly to file line numbers |
| Manual DiffLine rendering (Phase 2) | DiffView component | Phase 3 | Syntax highlighting, virtual scrolling, annotations, split view |

**Deprecated/outdated:**
- Phase 2's custom `DiffLine` component: Replace entirely with @git-diff-view/react
- `position` parameter in GitHub review comments: Use `line` + `side` instead
- CDN-loaded Monaco: Use local bundle for Docker compatibility

## File Change Detection Strategy (Claude's Discretion)

**Recommendation: Polling-based change detection via backend**

For auto-reload when files change on disk:
1. When an editor tab is open, the frontend stores the file's mtime (modification time) from the initial load
2. A lightweight polling endpoint `GET /api/files/stat?machine_id=&path=` returns the current mtime
3. Frontend polls every 5 seconds (configurable) while the tab is focused
4. If mtime changes and editor has no unsaved changes: silently reload content
5. If mtime changes and editor HAS unsaved changes: show notification bar "File changed on disk. Reload? | Keep mine"

This avoids inotify/fswatch complexity over SSH and works identically for local and remote machines.

## Annotation Severity Categories (Claude's Discretion)

**Recommendation: Four severity levels with distinct visual treatment**

| Severity | Icon | Color | Use |
|----------|------|-------|-----|
| error | AlertCircle (lucide) | Red (#ef4444) | Bugs, security issues, crashes |
| warning | AlertTriangle (lucide) | Amber (#f59e0b) | Code smell, potential issues |
| suggestion | Lightbulb (lucide) | Blue (#3b82f6) | Improvements, better patterns |
| info | Info (lucide) | Gray (#9ca3af) | Observations, context, questions |

Gutter icons use the severity color. The annotation panel shows severity as a colored left border.

## Error State Handling (Claude's Discretion)

**Recommendation: Graceful degradation with retry**

| Scenario | Behavior |
|----------|----------|
| Failed file load (editor) | Show error banner with "Retry" button, keep tab open |
| SSH disconnect during edit | Show "Connection lost" banner, preserve unsaved content in memory, auto-retry connection, re-save when reconnected |
| API failure (review comments) | Toast notification with error message, "Retry" link |
| AI review timeout | Show "Review timed out" with "Try again" button, suggest shorter diff |
| MR/PR fetch failure | Show error in diff tab with "Retry" and provider-specific error message |
| File too large (>5MB) | Show "File too large to edit" message, offer read-only view |

## Open Questions

1. **DiffFile memory management for large MR/PRs**
   - What we know: DiffFile instances are created per file. An MR with 50+ changed files creates 50 DiffFile instances.
   - What's unclear: Memory impact of keeping all DiffFile instances alive when user switches between files.
   - Recommendation: Create DiffFile on demand (when file is selected in sidebar), dispose previous. Use useMemo keyed on file path.

2. **Credential lookup for GitHub/GitLab API calls**
   - What we know: Credentials model exists with encrypted_data field. IntegrationSource links to credential_id.
   - What's unclear: Exact decryption flow and how the review service accesses credentials for API calls.
   - Recommendation: Add a decrypt_credential utility, look up credential via IntegrationSource.credential_id matching the feed item's source_type.

3. **Chat interface streaming vs batch response**
   - What we know: The review uses batch (all annotations at once). The contextual chat could benefit from streaming.
   - What's unclear: Whether to implement streaming for the chat or keep it simple with batch responses.
   - Recommendation: Start with batch (consistent with existing Anthropic API pattern), add streaming later if user experience demands it.

## Sources

### Primary (HIGH confidence)
- @git-diff-view/react [GitHub repo](https://github.com/MrWangJustToDo/git-diff-view) - DiffView props, widget system, DiffFile API
- @monaco-editor/react [GitHub repo](https://github.com/suren-atoyan/monaco-react) - Editor props, loader config, React 19 support
- [GitHub REST API - Pull Request Reviews](https://docs.github.com/en/rest/pulls/reviews) - Review creation, approval, submission
- [GitHub REST API - PR Comments](https://docs.github.com/en/rest/pulls/comments) - Inline comment creation, reply threading
- [GitHub REST API - Pull Requests](https://docs.github.com/en/rest/pulls/pulls) - Files endpoint, diff media type
- [GitLab Discussions API](https://docs.gitlab.com/api/discussions/) - Thread creation, inline position, replies
- [GitLab MR Approvals API](https://docs.gitlab.com/api/merge_request_approvals/) - Approve/unapprove endpoints
- [GitLab Merge Requests API](https://docs.gitlab.com/api/merge_requests/) - MR details, changes/diffs
- Existing codebase: `frontend/src/components/diff/DiffViewer.tsx`, `backend/app/services/git_service.py`, `backend/app/services/feed_service.py`

### Secondary (MEDIUM confidence)
- [BrightCoding blog - git-diff-view guide](https://www.blog.brightcoding.dev/2025/12/16/the-ultimate-diff-view-component-one-library-to-rule-react-vue-solid-svelte/) - extendData/renderExtendLine examples
- [vite-plugin-monaco-editor](https://github.com/vdesjs/vite-plugin-monaco-editor) - Vite worker configuration
- [Monaco Editor official](https://microsoft.github.io/monaco-editor/) - Editor options reference

### Tertiary (LOW confidence)
- WebSearch results for Monaco + Vite worker configuration - multiple approaches mentioned, need to verify with actual Vite 8 build

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - all libraries verified via npm, GitHub repos, existing codebase usage
- Architecture: HIGH - patterns based on existing codebase conventions (machine_registry, stores, API routes)
- Diff viewer: HIGH - @git-diff-view/react API verified from GitHub source code
- Monaco editor: HIGH - v4.7.0 stable with React 19, loader config documented
- GitHub/GitLab APIs: HIGH - official docs fetched and verified
- AI review: MEDIUM - prompt engineering approach based on existing LLM pattern, exact prompt needs iteration
- File operations: MEDIUM - base64 transfer pattern is standard but needs edge case testing for large files
- Pitfalls: HIGH - based on real API constraints (GitHub position vs line, Monaco workers, DiffFile init order)

**Research date:** 2026-03-28
**Valid until:** 2026-04-28 (30 days - libraries are stable, APIs unlikely to change)
