import { useCallback } from "react";
import { AlertCircle, AlertTriangle, Lightbulb, Info } from "lucide-react";
import { useReviewStore } from "../../stores/reviewStore";
import type { AnnotationSeverity } from "../../stores/reviewStore";

// ---------------------------------------------------------------------------
// Severity icon mapping
// ---------------------------------------------------------------------------

const SEVERITY_CONFIG: Record<
  AnnotationSeverity,
  { icon: typeof AlertCircle; color: string; label: string }
> = {
  error: { icon: AlertCircle, color: "#ef4444", label: "Error" },
  warning: { icon: AlertTriangle, color: "#f59e0b", label: "Warning" },
  suggestion: { icon: Lightbulb, color: "#3b82f6", label: "Suggestion" },
  info: { icon: Info, color: "#9ca3af", label: "Info" },
};

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface AnnotationGutterProps {
  annotationId: string;
  severity: AnnotationSeverity;
  comment: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Gutter icon for an annotation in the diff view.
 *
 * Shows a small colored icon based on annotation severity.
 * Clickable: opens/toggles the AnnotationPanel and scrolls to that annotation.
 * Tooltip on hover showing first ~50 chars of the annotation comment.
 */
export function AnnotationGutter({
  annotationId,
  severity,
  comment,
}: AnnotationGutterProps) {
  const setAnnotationPanelOpen = useReviewStore(
    (s) => s.setAnnotationPanelOpen,
  );
  const setFocusedAnnotation = useReviewStore((s) => s.setFocusedAnnotation);

  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- SEVERITY_CONFIG covers all AnnotationSeverity values
  const config = (SEVERITY_CONFIG[severity] ?? SEVERITY_CONFIG["info"])!;
  const Icon = config.icon;
  const tooltipText = comment.length > 50 ? comment.slice(0, 50) + "..." : comment;

  const handleClick = useCallback(() => {
    setAnnotationPanelOpen(true);
    setFocusedAnnotation(annotationId);
  }, [annotationId, setAnnotationPanelOpen, setFocusedAnnotation]);

  return (
    <button
      onClick={handleClick}
      className="flex items-center justify-center cursor-pointer hover:opacity-80 transition-opacity"
      title={tooltipText}
      style={{ width: 20, height: 20 }}
    >
      <Icon size={14} color={config.color} />
    </button>
  );
}
