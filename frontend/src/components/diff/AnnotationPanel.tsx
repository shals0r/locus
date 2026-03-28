import { useCallback, useEffect, useRef } from "react";
import {
  X,
  AlertCircle,
  AlertTriangle,
  Lightbulb,
  Info,
  Send,
  FileText,
} from "lucide-react";
import { useReviewStore } from "../../stores/reviewStore";
import type { AnnotationSeverity, ReviewAnnotation } from "../../stores/reviewStore";

// ---------------------------------------------------------------------------
// Severity display config
// ---------------------------------------------------------------------------

const SEVERITY_CONFIG: Record<
  AnnotationSeverity,
  { icon: typeof AlertCircle; color: string; label: string; bgClass: string }
> = {
  error: {
    icon: AlertCircle,
    color: "#ef4444",
    label: "Error",
    bgClass: "bg-red-500/10",
  },
  warning: {
    icon: AlertTriangle,
    color: "#f59e0b",
    label: "Warning",
    bgClass: "bg-amber-500/10",
  },
  suggestion: {
    icon: Lightbulb,
    color: "#3b82f6",
    label: "Suggestion",
    bgClass: "bg-blue-500/10",
  },
  info: {
    icon: Info,
    color: "#9ca3af",
    label: "Info",
    bgClass: "bg-gray-500/10",
  },
};

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface AnnotationPanelProps {
  /** Whether this diff is an MR/PR (enables batch post) */
  isMrDiff?: boolean;
  /** Callback when an annotation is clicked (scroll to that line in diff) */
  onAnnotationClick?: (line: number, file: string) => void;
  /** Callback to open the review submit dialog */
  onOpenReviewSubmit?: () => void;
}

// ---------------------------------------------------------------------------
// AnnotationItem sub-component
// ---------------------------------------------------------------------------

function AnnotationItemRow({
  annotation,
  onAnnotationClick,
}: {
  annotation: ReviewAnnotation;
  onAnnotationClick?: (line: number, file: string) => void;
}) {
  const updateAnnotation = useReviewStore((s) => s.updateAnnotation);
  const toggleAnnotationSelected = useReviewStore(
    (s) => s.toggleAnnotationSelected,
  );
  const focusedAnnotationId = useReviewStore((s) => s.focusedAnnotationId);

  const config =
    SEVERITY_CONFIG[annotation.severity] ?? SEVERITY_CONFIG.info;
  const Icon = config.icon;
  const isFocused = focusedAnnotationId === annotation.id;
  const itemRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to focused annotation
  useEffect(() => {
    if (isFocused && itemRef.current) {
      itemRef.current.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [isFocused]);

  const handleCommentChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      updateAnnotation(annotation.id, e.target.value);
    },
    [annotation.id, updateAnnotation],
  );

  const handleLineClick = useCallback(() => {
    onAnnotationClick?.(annotation.line, annotation.file);
  }, [annotation.line, annotation.file, onAnnotationClick]);

  return (
    <div
      ref={itemRef}
      className={`rounded-lg border p-2.5 transition-colors ${
        isFocused
          ? "border-accent/50 bg-accent/5"
          : "border-border bg-primary/50 hover:border-border/80"
      }`}
    >
      {/* Header: checkbox + severity + file:line */}
      <div className="flex items-start gap-2">
        <input
          type="checkbox"
          checked={annotation.selected}
          onChange={() => toggleAnnotationSelected(annotation.id)}
          className="mt-1 shrink-0 accent-accent"
        />

        <div className="flex-1 min-w-0">
          {/* Severity badge */}
          <div className="flex items-center gap-1.5 mb-1">
            <span
              className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium ${config.bgClass}`}
            >
              <Icon size={11} color={config.color} />
              <span style={{ color: config.color }}>{config.label}</span>
            </span>
          </div>

          {/* File + line */}
          <button
            onClick={handleLineClick}
            className="flex items-center gap-1 text-xs text-muted hover:text-accent transition-colors cursor-pointer mb-1.5"
          >
            <FileText size={10} />
            <span className="truncate">
              {annotation.file}:{annotation.line}
            </span>
          </button>

          {/* Editable comment */}
          <textarea
            value={annotation.comment}
            onChange={handleCommentChange}
            className="w-full rounded border border-border bg-primary px-2 py-1.5 text-xs text-primary-text placeholder:text-muted resize-none focus:outline-none focus:border-accent/50"
            rows={Math.min(
              8,
              Math.max(2, annotation.comment.split("\n").length),
            )}
            style={{
              minHeight: "3em",
              maxHeight: "12em",
              overflow: "auto",
            }}
          />
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// AnnotationPanel Component
// ---------------------------------------------------------------------------

export function AnnotationPanel({
  isMrDiff = false,
  onAnnotationClick,
  onOpenReviewSubmit,
}: AnnotationPanelProps) {
  const annotations = useReviewStore((s) => s.annotations);
  const annotationPanelOpen = useReviewStore((s) => s.annotationPanelOpen);
  const setAnnotationPanelOpen = useReviewStore(
    (s) => s.setAnnotationPanelOpen,
  );
  const selectAll = useReviewStore((s) => s.selectAll);

  const selectedCount = annotations.filter((a) => a.selected).length;

  const handleClose = useCallback(() => {
    setAnnotationPanelOpen(false);
  }, [setAnnotationPanelOpen]);

  const handleSelectAll = useCallback(() => {
    const allSelected = selectedCount === annotations.length;
    selectAll(!allSelected);
  }, [selectedCount, annotations.length, selectAll]);

  if (!annotationPanelOpen || annotations.length === 0) {
    return null;
  }

  return (
    <div
      className="absolute right-0 top-0 bottom-0 z-40 flex flex-col border-l border-border bg-secondary shadow-lg"
      style={{ width: 360 }}
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-3 py-2 shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-primary-text">
            Review Annotations
          </span>
          <span className="inline-flex items-center justify-center rounded-full bg-accent/20 text-accent text-[10px] font-medium px-1.5 py-0.5 min-w-[20px]">
            {annotations.length}
          </span>
        </div>
        <button
          onClick={handleClose}
          className="text-muted hover:text-primary-text transition-colors"
          title="Close panel"
        >
          <X size={16} />
        </button>
      </div>

      {/* Select all row */}
      <div className="flex items-center gap-2 border-b border-border px-3 py-1.5 shrink-0">
        <input
          type="checkbox"
          checked={selectedCount === annotations.length && annotations.length > 0}
          onChange={handleSelectAll}
          className="accent-accent"
        />
        <span className="text-[11px] text-muted">
          {selectedCount > 0
            ? `${selectedCount} of ${annotations.length} selected`
            : "Select all"}
        </span>
      </div>

      {/* Annotation list -- scrollable */}
      <div className="flex-1 overflow-y-auto px-2 py-2 space-y-2">
        {annotations.map((annotation) => (
          <AnnotationItemRow
            key={annotation.id}
            annotation={annotation}
            onAnnotationClick={onAnnotationClick}
          />
        ))}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between border-t border-border px-3 py-2 shrink-0">
        <span className="text-[11px] text-muted">
          {selectedCount > 0 ? `${selectedCount} selected` : "None selected"}
        </span>

        <div className="flex items-center gap-1.5">
          {/* Post Selected as Comments -- MR/PR only */}
          <button
            disabled={!isMrDiff || selectedCount === 0}
            className={`flex items-center gap-1 rounded px-2 py-1 text-xs border transition-colors ${
              isMrDiff && selectedCount > 0
                ? "border-accent/30 text-accent hover:bg-accent/10 cursor-pointer"
                : "border-border text-muted opacity-40 cursor-not-allowed"
            }`}
            title={
              !isMrDiff
                ? "Posting comments is only available for MR/PR diffs"
                : selectedCount === 0
                  ? "Select annotations to post"
                  : "Post selected annotations as MR/PR comments"
            }
          >
            <Send size={11} />
            <span>Post as Comments</span>
          </button>

          {/* Submit Review -- opens dialog */}
          <button
            onClick={onOpenReviewSubmit}
            className="flex items-center gap-1 rounded bg-accent px-2.5 py-1 text-xs text-white hover:bg-accent/80 transition-colors"
            title="Submit formal review"
          >
            Submit Review
          </button>
        </div>
      </div>
    </div>
  );
}
