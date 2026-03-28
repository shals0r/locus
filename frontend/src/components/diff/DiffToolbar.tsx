import { useState, useRef, useEffect, useCallback } from "react";
import { DiffModeEnum } from "@git-diff-view/react";
import {
  Columns2,
  List,
  Bot,
  Check,
  MessageSquareWarning,
  Loader2,
  X,
} from "lucide-react";
import { useAiReview } from "../../hooks/useAiReview";
import { useReviewStore } from "../../stores/reviewStore";

interface DiffToolbarProps {
  /** Current diff view mode */
  mode: DiffModeEnum;
  /** Callback when mode changes */
  onModeChange: (mode: DiffModeEnum) => void;
  /** Whether this is an MR/PR diff (shows approve/request changes) */
  isMrDiff?: boolean;
  /** Current raw diff text for AI review */
  diffText?: string;
}

export function DiffToolbar({
  mode,
  onModeChange,
  isMrDiff = false,
  diffText,
}: DiffToolbarProps) {
  const { triggerReview, isReviewing } = useAiReview();
  const annotationCount = useReviewStore((s) => s.annotations.length);
  const toggleAnnotationPanel = useReviewStore((s) => s.toggleAnnotationPanel);

  // Custom prompt popover state
  const [showPromptPopover, setShowPromptPopover] = useState(false);
  const [customPrompt, setCustomPrompt] = useState("");
  const popoverRef = useRef<HTMLDivElement>(null);

  // Close popover on outside click
  useEffect(() => {
    if (!showPromptPopover) return;
    const handleClick = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setShowPromptPopover(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [showPromptPopover]);

  const handleStartReview = useCallback(() => {
    if (!diffText) return;
    triggerReview(diffText, customPrompt || undefined);
    setShowPromptPopover(false);
    setCustomPrompt("");
  }, [diffText, customPrompt, triggerReview]);

  const handleReviewClick = useCallback(() => {
    if (!diffText) return;
    setShowPromptPopover(true);
  }, [diffText]);

  return (
    <div className="flex h-9 shrink-0 items-center gap-1 border-b border-border bg-secondary px-2">
      {/* Split / Unified toggle */}
      <div className="flex items-center rounded border border-border">
        <button
          onClick={() => onModeChange(DiffModeEnum.Split)}
          className={`flex items-center gap-1 px-2 py-1 text-xs transition-colors ${
            mode === DiffModeEnum.Split
              ? "bg-accent text-white"
              : "text-muted hover:text-primary-text"
          }`}
          title="Split view (side-by-side)"
        >
          <Columns2 size={13} />
          <span>Split</span>
        </button>
        <button
          onClick={() => onModeChange(DiffModeEnum.Unified)}
          className={`flex items-center gap-1 px-2 py-1 text-xs transition-colors ${
            mode === DiffModeEnum.Unified
              ? "bg-accent text-white"
              : "text-muted hover:text-primary-text"
          }`}
          title="Unified view"
        >
          <List size={13} />
          <span>Unified</span>
        </button>
      </div>

      <div className="flex-1" />

      {/* Annotation count badge (when annotations exist) */}
      {annotationCount > 0 && (
        <button
          onClick={toggleAnnotationPanel}
          className="flex items-center gap-1 rounded px-2 py-1 text-xs text-amber-400 hover:bg-white/5 border border-amber-500/30"
          title="Toggle annotation panel"
        >
          <span>{annotationCount} annotations</span>
        </button>
      )}

      {/* Review with Claude */}
      <div className="relative">
        <button
          onClick={isReviewing ? undefined : handleReviewClick}
          disabled={!diffText || isReviewing}
          className={`flex items-center gap-1.5 rounded px-2.5 py-1 text-xs border border-border transition-colors ${
            !diffText || isReviewing
              ? "text-muted opacity-50 cursor-not-allowed"
              : "text-primary-text hover:bg-white/5 cursor-pointer"
          }`}
          title={
            isReviewing
              ? "Review in progress..."
              : !diffText
                ? "No diff text available"
                : "Review with Claude"
          }
        >
          {isReviewing ? (
            <Loader2 size={13} className="animate-spin" />
          ) : (
            <Bot size={13} />
          )}
          <span>{isReviewing ? "Reviewing..." : "Review with Claude"}</span>
        </button>

        {/* Custom prompt popover */}
        {showPromptPopover && (
          <div
            ref={popoverRef}
            className="absolute right-0 top-full mt-1 z-50 w-80 rounded-lg border border-border bg-secondary shadow-lg p-3"
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-primary-text">
                Review Instructions (optional)
              </span>
              <button
                onClick={() => setShowPromptPopover(false)}
                className="text-muted hover:text-primary-text"
              >
                <X size={14} />
              </button>
            </div>
            <textarea
              value={customPrompt}
              onChange={(e) => setCustomPrompt(e.target.value)}
              placeholder="e.g., Focus on security issues, ignore formatting..."
              className="w-full rounded border border-border bg-primary px-2 py-1.5 text-xs text-primary-text placeholder:text-muted resize-none"
              rows={3}
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                  handleStartReview();
                }
              }}
            />
            <div className="flex items-center justify-between mt-2">
              <span className="text-[10px] text-muted">Ctrl+Enter to start</span>
              <button
                onClick={handleStartReview}
                className="rounded bg-accent px-3 py-1 text-xs text-white hover:bg-accent/80 transition-colors"
              >
                Start Review
              </button>
            </div>
          </div>
        )}
      </div>

      {/* MR/PR-specific buttons */}
      {isMrDiff && (
        <>
          <button
            disabled
            className="flex items-center gap-1.5 rounded px-2.5 py-1 text-xs text-muted opacity-50 cursor-not-allowed border border-success/30"
            title="Approve (coming soon)"
          >
            <Check size={13} />
            <span>Approve</span>
          </button>
          <button
            disabled
            className="flex items-center gap-1.5 rounded px-2.5 py-1 text-xs text-muted opacity-50 cursor-not-allowed border border-warning/30"
            title="Request Changes (coming soon)"
          >
            <MessageSquareWarning size={13} />
            <span>Request Changes</span>
          </button>
        </>
      )}
    </div>
  );
}
