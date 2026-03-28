import { useCallback, useEffect } from "react";
import { AlertTriangle } from "lucide-react";

interface UnsavedDialogProps {
  fileName: string;
  onSave: () => void;
  onDiscard: () => void;
  onCancel: () => void;
}

/**
 * Modal dialog shown when closing an editor tab with unsaved changes.
 * Three actions: Save (save then close), Discard (close without saving), Cancel (stay on tab).
 */
export function UnsavedDialog({
  fileName,
  onSave,
  onDiscard,
  onCancel,
}: UnsavedDialogProps) {
  // Handle Escape key to cancel
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onCancel();
      }
    },
    [onCancel],
  );

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onCancel}
      />

      {/* Dialog */}
      <div className="relative z-10 w-full max-w-sm rounded-lg border border-border bg-secondary p-5 shadow-lg">
        <div className="flex items-start gap-3">
          <AlertTriangle size={20} className="mt-0.5 shrink-0 text-warning" />
          <div className="flex-1">
            <h3 className="text-sm font-semibold text-primary-text">
              Unsaved Changes
            </h3>
            <p className="mt-1.5 text-xs text-muted leading-relaxed">
              <span className="font-medium text-primary-text">{fileName}</span>{" "}
              has unsaved changes. Do you want to save before closing?
            </p>
          </div>
        </div>

        <div className="mt-4 flex items-center justify-end gap-2">
          <button
            onClick={onCancel}
            className="rounded px-3 py-1.5 text-xs text-muted hover:text-primary-text hover:bg-hover transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onDiscard}
            className="rounded px-3 py-1.5 text-xs text-danger hover:bg-danger/10 transition-colors"
          >
            Discard
          </button>
          <button
            onClick={onSave}
            className="rounded bg-accent px-3 py-1.5 text-xs text-white hover:bg-accent/90 transition-colors"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
