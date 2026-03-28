import { useMemo, useState, useCallback, type ReactNode } from "react";
import { DiffView, DiffModeEnum, type SplitSide } from "@git-diff-view/react";
import { DiffFile } from "@git-diff-view/file";
import "@git-diff-view/react/styles/diff-view.css";
import { Loader2, AlertCircle, AlertTriangle, Lightbulb, Info } from "lucide-react";
import { useDiffData } from "../../hooks/useDiffData";
import { useReviewStore } from "../../stores/reviewStore";
import type { AnnotationSeverity, ReviewAnnotation, CommentThread } from "../../stores/reviewStore";

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
// Severity icon config for inline annotation previews
// ---------------------------------------------------------------------------
const SEVERITY_ICONS: Record<
  AnnotationSeverity,
  { icon: typeof AlertCircle; color: string }
> = {
  error: { icon: AlertCircle, color: "#ef4444" },
  warning: { icon: AlertTriangle, color: "#f59e0b" },
  suggestion: { icon: Lightbulb, color: "#3b82f6" },
  info: { icon: Info, color: "#9ca3af" },
};

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
  /** Task ID for MR/PR diffs (enables metadata header and comments) */
  taskId?: string;
  /** MR/PR comments passed from parent */
  comments?: CommentThread[];
  /** Widget system pass-through for Plan 06 annotations */
  extendData?: {
    oldFile?: Record<string, { data: unknown }>;
    newFile?: Record<string, { data: unknown }>;
  };
  renderExtendLine?: (args: {
    lineNumber: number;
    side: SplitSide;
    data: unknown;
    diffFile: DiffFile;
    onUpdate: () => void;
  }) => ReactNode;
  renderWidgetLine?: (args: {
    lineNumber: number;
    side: SplitSide;
    diffFile: DiffFile;
    onClose: () => void;
  }) => ReactNode;
  onAddWidgetClick?: (lineNumber: number, side: SplitSide) => void;
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
  extendData: externalExtendData,
  renderExtendLine: externalRenderExtendLine,
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
  // Annotation overlay: build extendData from reviewStore annotations
  // ---------------------------------------------------------------------------
  const annotations = useReviewStore((s) => s.annotations);
  const setAnnotationPanelOpen = useReviewStore((s) => s.setAnnotationPanelOpen);
  const setFocusedAnnotation = useReviewStore((s) => s.setFocusedAnnotation);

  // Build extendData mapping: line number -> annotation data for rendering
  const annotationExtendData = useMemo(() => {
    if (annotations.length === 0) return undefined;
    const newFileData: Record<string, { data: { annotations: ReviewAnnotation[] } }> = {};
    for (const annotation of annotations) {
      // Filter to the active file if applicable
      if (activeSection && annotation.file && annotation.file !== activeSection.fileName) {
        continue;
      }
      const key = `${annotation.line}`;
      if (!newFileData[key]) {
        newFileData[key] = { data: { annotations: [] } };
      }
      newFileData[key]!.data.annotations.push(annotation);
    }
    return { newFile: newFileData };
  }, [annotations, activeSection]);

  // Merge external extendData with annotation extendData
  const mergedExtendData = useMemo(() => {
    if (!annotationExtendData) return externalExtendData;
    if (!externalExtendData) return annotationExtendData;
    return {
      oldFile: externalExtendData.oldFile,
      newFile: { ...externalExtendData.newFile, ...annotationExtendData.newFile },
    };
  }, [externalExtendData, annotationExtendData]);

  // renderExtendLine: render annotation inline previews
  const annotationRenderExtendLine = useCallback(
    ({ data, diffFile, side, lineNumber, onUpdate }: {
      lineNumber: number;
      side: SplitSide;
      data: unknown;
      diffFile: DiffFile;
      onUpdate: () => void;
    }) => {
      const lineData = data as { annotations?: ReviewAnnotation[] } | undefined;
      if (!lineData?.annotations?.length) {
        return externalRenderExtendLine?.({ lineNumber, side, data, diffFile, onUpdate }) ?? null;
      }

      return (
        <div className="flex flex-col gap-0.5 py-1 px-2" style={{ background: "rgba(30,30,46,0.8)" }}>
          {lineData.annotations.map((annotation) => {
            const severityConfig = (annotation.severity in SEVERITY_ICONS
              ? SEVERITY_ICONS[annotation.severity]
              : SEVERITY_ICONS.info) as { icon: typeof AlertCircle; color: string };
            const Icon = severityConfig.icon;
            const truncatedComment =
              annotation.comment.length > 120
                ? annotation.comment.slice(0, 120) + "..."
                : annotation.comment;

            return (
              <button
                key={annotation.id}
                className="flex items-start gap-2 text-left text-xs py-0.5 px-1 rounded hover:bg-white/5 cursor-pointer transition-colors w-full"
                onClick={() => {
                  setAnnotationPanelOpen(true);
                  setFocusedAnnotation(annotation.id);
                }}
              >
                <Icon
                  size={13}
                  color={severityConfig.color}
                  className="shrink-0 mt-0.5"
                />
                <span className="text-gray-300">{truncatedComment}</span>
              </button>
            );
          })}
        </div>
      );
    },
    [externalRenderExtendLine, setAnnotationPanelOpen, setFocusedAnnotation],
  );

  // Use annotation renderer if we have annotations, otherwise fall through to external
  const finalRenderExtendLine =
    annotations.length > 0 ? annotationRenderExtendLine : externalRenderExtendLine;

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
        extendData={mergedExtendData}
        renderExtendLine={finalRenderExtendLine}
        renderWidgetLine={renderWidgetLine}
        onAddWidgetClick={onAddWidgetClick}
      />
    </div>
  );
}
