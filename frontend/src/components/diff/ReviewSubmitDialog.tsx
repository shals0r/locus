import { useState, useCallback } from "react";
import {
  X,
  MessageSquare,
  Check,
  XCircle,
  Loader2,
} from "lucide-react";
import { useReviewStore } from "../../stores/reviewStore";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ReviewEvent = "COMMENT" | "APPROVE" | "REQUEST_CHANGES";

interface ReviewSubmitDialogProps {
  /** Whether the dialog is open */
  open: boolean;
  /** Close the dialog */
  onClose: () => void;
  /** Whether this is an MR/PR diff (dialog hidden for local diffs) */
  isMrDiff?: boolean;
  /** Callback when review is submitted */
  onSubmit?: (data: {
    event: ReviewEvent;
    body: string;
    includeAnnotations: boolean;
    annotations: Array<{ file: string; line: number; comment: string }>;
  }) => void;
  /** Whether submission is in progress */
  isSubmitting?: boolean;
}

// ---------------------------------------------------------------------------
// Event options
// ---------------------------------------------------------------------------

const EVENT_OPTIONS: Array<{
  value: ReviewEvent;
  label: string;
  icon: typeof MessageSquare;
  description: string;
  colorClass: string;
  borderClass: string;
}> = [
  {
    value: "COMMENT",
    label: "Comment",
    icon: MessageSquare,
    description: "Submit general feedback",
    colorClass: "text-gray-300",
    borderClass: "border-gray-500/30",
  },
  {
    value: "APPROVE",
    label: "Approve",
    icon: Check,
    description: "Approve this merge request",
    colorClass: "text-green-400",
    borderClass: "border-green-500/30",
  },
  {
    value: "REQUEST_CHANGES",
    label: "Request Changes",
    icon: XCircle,
    description: "Request changes before merging",
    colorClass: "text-red-400",
    borderClass: "border-red-500/30",
  },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ReviewSubmitDialog({
  open,
  onClose,
  isMrDiff = false,
  onSubmit,
  isSubmitting = false,
}: ReviewSubmitDialogProps) {
  const annotations = useReviewStore((s) => s.annotations);
  const clearAnnotations = useReviewStore((s) => s.clearAnnotations);

  const selectedAnnotations = annotations.filter((a) => !!a.selected);
  const hasSelectedAnnotations = selectedAnnotations.length > 0;

  const [event, setEvent] = useState<ReviewEvent>("COMMENT");
  const [body, setBody] = useState("");
  const [includeAnnotations, setIncludeAnnotations] = useState(true);

  const handleSubmit = useCallback(() => {
    if (!onSubmit) return;

    const annotationsToInclude =
      includeAnnotations && hasSelectedAnnotations
        ? selectedAnnotations.map((a) => ({
            file: a.file,
            line: a.line,
            comment: a.comment,
          }))
        : [];

    onSubmit({
      event,
      body,
      includeAnnotations: includeAnnotations && hasSelectedAnnotations,
      annotations: annotationsToInclude,
    });

    // Clear state after successful submit
    clearAnnotations();
    setBody("");
    setEvent("COMMENT");
    onClose();
  }, [
    onSubmit,
    event,
    body,
    includeAnnotations,
    hasSelectedAnnotations,
    selectedAnnotations,
    clearAnnotations,
    onClose,
  ]);

  // Don't render for local diffs or when closed
  if (!open || !isMrDiff) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60"
        onClick={onClose}
      />

      {/* Dialog */}
      <div className="relative z-10 w-[480px] max-h-[80vh] rounded-lg border border-border bg-secondary shadow-2xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-4 py-3 shrink-0">
          <h3 className="text-sm font-medium text-primary-text">
            Submit Review
          </h3>
          <button
            onClick={onClose}
            className="text-muted hover:text-primary-text transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
          {/* Summary textarea */}
          <div>
            <label className="block text-xs font-medium text-muted mb-1.5">
              Review Summary (optional)
            </label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Overall thoughts on this change..."
              className="w-full rounded border border-border bg-primary px-3 py-2 text-sm text-primary-text placeholder:text-muted resize-none focus:outline-none focus:border-accent/50"
              rows={4}
            />
          </div>

          {/* Event selection */}
          <div>
            <label className="block text-xs font-medium text-muted mb-1.5">
              Review Action
            </label>
            <div className="flex gap-2">
              {EVENT_OPTIONS.map((option) => {
                const Icon = option.icon;
                const isSelected = event === option.value;
                return (
                  <button
                    key={option.value}
                    onClick={() => setEvent(option.value)}
                    className={`flex-1 flex flex-col items-center gap-1 rounded-lg border px-3 py-2.5 transition-colors ${
                      isSelected
                        ? `${option.borderClass} bg-white/5`
                        : "border-border hover:border-border/80 hover:bg-white/[0.02]"
                    }`}
                  >
                    <Icon
                      size={18}
                      className={isSelected ? option.colorClass : "text-muted"}
                    />
                    <span
                      className={`text-xs font-medium ${
                        isSelected ? option.colorClass : "text-muted"
                      }`}
                    >
                      {option.label}
                    </span>
                    <span className="text-[10px] text-muted text-center">
                      {option.description}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Include annotations checkbox */}
          {hasSelectedAnnotations && (
            <div className="flex items-center gap-2 rounded border border-border px-3 py-2">
              <input
                type="checkbox"
                checked={includeAnnotations}
                onChange={(e) => setIncludeAnnotations(e.target.checked)}
                className="accent-accent"
                id="include-annotations"
              />
              <label
                htmlFor="include-annotations"
                className="text-xs text-primary-text cursor-pointer"
              >
                Include {selectedAnnotations.length} selected annotation
                {selectedAnnotations.length !== 1 ? "s" : ""} as inline comments
              </label>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 border-t border-border px-4 py-3 shrink-0">
          <button
            onClick={onClose}
            className="rounded border border-border px-3 py-1.5 text-xs text-muted hover:text-primary-text hover:border-border/80 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={isSubmitting}
            className={`flex items-center gap-1.5 rounded px-4 py-1.5 text-xs font-medium text-white transition-colors ${
              event === "APPROVE"
                ? "bg-green-600 hover:bg-green-700"
                : event === "REQUEST_CHANGES"
                  ? "bg-red-600 hover:bg-red-700"
                  : "bg-accent hover:bg-accent/80"
            } ${isSubmitting ? "opacity-60 cursor-not-allowed" : ""}`}
          >
            {isSubmitting && <Loader2 size={13} className="animate-spin" />}
            <span>
              {isSubmitting
                ? "Submitting..."
                : event === "APPROVE"
                  ? "Approve & Submit"
                  : event === "REQUEST_CHANGES"
                    ? "Request Changes & Submit"
                    : "Submit Review"}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
