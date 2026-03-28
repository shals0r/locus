import { DiffModeEnum } from "@git-diff-view/react";
import { Columns2, List, Bot, Check, MessageSquareWarning } from "lucide-react";

interface DiffToolbarProps {
  /** Current diff view mode */
  mode: DiffModeEnum;
  /** Callback when mode changes */
  onModeChange: (mode: DiffModeEnum) => void;
  /** Whether this is an MR/PR diff (shows approve/request changes) */
  isMrDiff?: boolean;
}

export function DiffToolbar({
  mode,
  onModeChange,
  isMrDiff = false,
}: DiffToolbarProps) {
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

      {/* Review with Claude (placeholder) */}
      <button
        disabled
        className="flex items-center gap-1.5 rounded px-2.5 py-1 text-xs text-muted opacity-50 cursor-not-allowed border border-border"
        title="Review with Claude (coming soon)"
      >
        <Bot size={13} />
        <span>Review with Claude</span>
      </button>

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
