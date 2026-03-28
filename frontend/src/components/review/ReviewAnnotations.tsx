import { useCallback } from "react";
import { AlertCircle, AlertTriangle, Lightbulb, Info } from "lucide-react";
import type { ReviewAnnotation } from "../../stores/reviewStore";

interface ReviewAnnotationsProps {
  annotations: ReviewAnnotation[];
  onEdit: (id: string, text: string) => void;
  onToggleSelect: (id: string) => void;
  selectedIds: Set<string>;
}

const SEVERITY_CONFIG: Record<
  string,
  { icon: typeof AlertCircle; color: string; bg: string; label: string }
> = {
  error: {
    icon: AlertCircle,
    color: "text-red-400",
    bg: "bg-red-500/10",
    label: "Error",
  },
  warning: {
    icon: AlertTriangle,
    color: "text-amber-400",
    bg: "bg-amber-500/10",
    label: "Warning",
  },
  suggestion: {
    icon: Lightbulb,
    color: "text-blue-400",
    bg: "bg-blue-500/10",
    label: "Suggestion",
  },
  info: {
    icon: Info,
    color: "text-gray-400",
    bg: "bg-gray-500/10",
    label: "Info",
  },
};

/**
 * ReviewAnnotations - Reusable editable annotation list component.
 *
 * Renders each annotation as a compact card with checkbox, severity badge,
 * file:line reference, and editable comment textarea. Supports select all/deselect all.
 */
export function ReviewAnnotations({
  annotations,
  onEdit,
  onToggleSelect,
  selectedIds,
}: ReviewAnnotationsProps) {
  const allSelected =
    annotations.length > 0 && annotations.every((a) => selectedIds.has(a.id));

  const handleToggleAll = useCallback(() => {
    if (allSelected) {
      // Deselect all
      for (const a of annotations) {
        if (selectedIds.has(a.id)) {
          onToggleSelect(a.id);
        }
      }
    } else {
      // Select all
      for (const a of annotations) {
        if (!selectedIds.has(a.id)) {
          onToggleSelect(a.id);
        }
      }
    }
  }, [allSelected, annotations, selectedIds, onToggleSelect]);

  if (annotations.length === 0) {
    return (
      <div className="py-4 text-center text-xs text-muted">
        No annotations to display.
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {/* Select All / Deselect All toggle */}
      <div className="flex items-center gap-2 px-1 py-1">
        <button
          onClick={handleToggleAll}
          className="text-[10px] text-accent hover:text-accent/80 transition-colors"
        >
          {allSelected ? "Deselect All" : "Select All"}
        </button>
        <span className="text-[10px] text-muted">
          {selectedIds.size}/{annotations.length} selected
        </span>
      </div>

      {/* Annotation list */}
      {annotations.map((annotation) => {
        const config = SEVERITY_CONFIG[annotation.severity] ?? SEVERITY_CONFIG.info!;
        const Icon = config.icon;
        const isSelected = selectedIds.has(annotation.id);

        return (
          <div
            key={annotation.id}
            className="rounded border border-border bg-secondary/50 px-2 py-1.5"
          >
            {/* Top row: checkbox + severity + file ref */}
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={isSelected}
                onChange={() => onToggleSelect(annotation.id)}
                className="h-3.5 w-3.5 shrink-0 accent-accent"
              />
              <span
                className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${config.color} ${config.bg}`}
              >
                <Icon size={10} />
                {config.label}
              </span>
              <span className="flex-1 truncate text-xs text-muted">
                {annotation.file}:{annotation.line}
              </span>
            </div>

            {/* Editable comment textarea */}
            <textarea
              value={annotation.comment}
              onChange={(e) => onEdit(annotation.id, e.target.value)}
              rows={2}
              className="mt-1 w-full resize-none rounded border border-border bg-dominant px-2 py-1 text-xs text-primary-text outline-none focus:border-accent"
              style={{
                minHeight: "2.5rem",
                maxHeight: "10rem",
              }}
            />
          </div>
        );
      })}
    </div>
  );
}
