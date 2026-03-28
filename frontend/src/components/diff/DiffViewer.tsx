import { useMemo, useState, useCallback, type ReactNode } from "react";
import { DiffView, DiffModeEnum } from "@git-diff-view/react";
import { DiffFile } from "@git-diff-view/file";
import "@git-diff-view/react/styles/diff-view.css";
import { Loader2 } from "lucide-react";
import { useDiffData } from "../../hooks/useDiffData";

// ---------------------------------------------------------------------------
// Language detection from file extension
// ---------------------------------------------------------------------------
const EXTENSION_MAP: Record<string, string> = {
  ts: "typescript",
  tsx: "typescript",
  js: "javascript",
  jsx: "javascript",
  py: "python",
  rb: "ruby",
  rs: "rust",
  go: "go",
  java: "java",
  kt: "kotlin",
  c: "c",
  cpp: "cpp",
  h: "c",
  hpp: "cpp",
  cs: "csharp",
  swift: "swift",
  php: "php",
  sh: "bash",
  bash: "bash",
  zsh: "bash",
  json: "json",
  yaml: "yaml",
  yml: "yaml",
  toml: "toml",
  xml: "xml",
  html: "html",
  htm: "html",
  css: "css",
  scss: "scss",
  less: "less",
  sql: "sql",
  md: "markdown",
  dockerfile: "dockerfile",
  makefile: "makefile",
  vue: "vue",
  svelte: "svelte",
};

function detectLanguage(fileName: string): string {
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
  return EXTENSION_MAP[ext] ?? "plaintext";
}

// ---------------------------------------------------------------------------
// Storage key for persisting view mode preference
// ---------------------------------------------------------------------------
const DIFF_MODE_KEY = "locus-diff-mode";

function getStoredMode(): DiffModeEnum {
  try {
    const stored = localStorage.getItem(DIFF_MODE_KEY);
    if (stored === "unified") return DiffModeEnum.Unified;
  } catch {
    // Ignore storage errors
  }
  return DiffModeEnum.Split;
}

function storeMode(mode: DiffModeEnum): void {
  try {
    localStorage.setItem(
      DIFF_MODE_KEY,
      mode === DiffModeEnum.Unified ? "unified" : "split",
    );
  } catch {
    // Ignore storage errors
  }
}

// ---------------------------------------------------------------------------
// Split multi-file diff text into per-file sections
// ---------------------------------------------------------------------------
function splitDiffByFile(fullDiff: string): { fileName: string; diff: string }[] {
  const sections = fullDiff.split(/(?=^diff --git )/m).filter(Boolean);
  return sections.map((section) => {
    const match = section.match(/^diff --git a\/(.*?) b\/(.*)/m);
    const fileName = match?.[2] ?? match?.[1] ?? "unknown";
    return { fileName, diff: section };
  });
}

// ---------------------------------------------------------------------------
// Build a DiffFile instance from raw diff text
// ---------------------------------------------------------------------------
function buildDiffFile(rawDiff: string, fileName: string): DiffFile | null {
  if (!rawDiff.trim()) return null;
  try {
    const lang = detectLanguage(fileName);
    const instance = new DiffFile(
      fileName,
      "",
      fileName,
      "",
      [rawDiff],
      lang,
      lang,
    );
    instance.initTheme("dark");
    instance.initRaw();
    instance.buildSplitDiffLines();
    instance.buildUnifiedDiffLines();
    return instance;
  } catch (err) {
    console.error("Failed to build DiffFile:", err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// DiffViewer Props
// ---------------------------------------------------------------------------
export interface DiffViewerProps {
  machineId?: string;
  repoPath?: string;
  filePath?: string;
  commitSha?: string;
  /** Directly provided diff text (skips fetching) */
  diffText?: string;
  /** MR/PR identifiers (Plan 05) */
  mrId?: string;
  sourceType?: string;
  /** Whether this is an MR/PR diff (enables add-widget button) */
  isMrDiff?: boolean;
  /** Widget system pass-through for Plan 06 annotations */
  extendData?: Record<string, unknown>;
  renderExtendLine?: (...args: unknown[]) => ReactNode;
  renderWidgetLine?: (...args: unknown[]) => ReactNode;
  onAddWidgetClick?: (...args: unknown[]) => void;
  /** For multi-file diffs: which file is currently selected */
  selectedFile?: string;
  /** Callback when view mode changes (for DiffToolbar integration) */
  onModeChange?: (mode: DiffModeEnum) => void;
  /** External mode override (for DiffToolbar integration) */
  mode?: DiffModeEnum;
}

// ---------------------------------------------------------------------------
// DiffViewer Component
// ---------------------------------------------------------------------------
export function DiffViewer({
  machineId,
  repoPath,
  filePath,
  commitSha,
  diffText: externalDiffText,
  isMrDiff = false,
  extendData,
  renderExtendLine,
  renderWidgetLine,
  onAddWidgetClick,
  selectedFile,
  onModeChange,
  mode: externalMode,
}: DiffViewerProps) {
  // Fetch diff data if not provided externally
  const {
    diffText: fetchedDiffText,
    isLoading,
    error,
  } = useDiffData(
    externalDiffText ? undefined : machineId,
    externalDiffText ? undefined : repoPath,
    filePath,
    commitSha,
  );

  const rawDiffText = externalDiffText ?? fetchedDiffText;

  // View mode: use external if provided, otherwise manage locally
  const [internalMode, setInternalMode] = useState<DiffModeEnum>(getStoredMode);
  const mode = externalMode ?? internalMode;

  const setMode = useCallback(
    (newMode: DiffModeEnum) => {
      setInternalMode(newMode);
      storeMode(newMode);
      onModeChange?.(newMode);
    },
    [onModeChange],
  );

  // Expose setMode for toolbar -- attach to window for simple cross-component access
  // DiffToolbar uses the onModeChange callback instead, but keep setMode for standalone use
  void setMode; // Prevents unused warning; setMode is available via onModeChange

  // Parse multi-file diffs
  const fileSections = useMemo(() => {
    if (!rawDiffText) return [];
    return splitDiffByFile(rawDiffText);
  }, [rawDiffText]);

  // Determine which file section to render
  const activeSection = useMemo(() => {
    if (fileSections.length === 0) return null;
    if (fileSections.length === 1) return fileSections[0];
    if (selectedFile) {
      return fileSections.find((s) => s.fileName === selectedFile) ?? fileSections[0];
    }
    return fileSections[0];
  }, [fileSections, selectedFile]);

  // Build the DiffFile instance
  const diffFile = useMemo(() => {
    if (!activeSection) return null;
    return buildDiffFile(activeSection.diff, activeSection.fileName);
  }, [activeSection]);

  // ---------------------------------------------------------------------------
  // Render states
  // ---------------------------------------------------------------------------
  const hasInput = !!(machineId && repoPath && (filePath || commitSha)) || !!externalDiffText;

  if (!hasInput) {
    return (
      <div className="flex h-full items-center justify-center text-muted text-sm">
        Select a file or commit to view its diff.
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted" />
        <span className="ml-2 text-sm text-muted">Loading diff...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <p className="text-sm text-red-400">Failed to load diff</p>
          <p className="mt-1 text-xs text-muted">
            {error instanceof Error ? error.message : "Unknown error"}
          </p>
        </div>
      </div>
    );
  }

  if (!rawDiffText || !diffFile) {
    return (
      <div className="flex h-full items-center justify-center text-muted text-sm">
        No changes
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto" style={{ background: "#0f1117" }}>
      <DiffView
        diffFile={diffFile}
        diffViewMode={mode}
        diffViewTheme="dark"
        diffViewHighlight={true}
        diffViewWrap={false}
        diffViewFontSize={13}
        diffViewAddWidget={isMrDiff}
        extendData={extendData}
        renderExtendLine={renderExtendLine}
        renderWidgetLine={renderWidgetLine}
        onAddWidgetClick={onAddWidgetClick}
      />
    </div>
  );
}
