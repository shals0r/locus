import type { Task } from "../../types";

interface StartFlowPickerProps {
  task: Task;
}

/**
 * Inline start flow picker. Placeholder -- full implementation in Task 2.
 */
export function StartFlowPicker({ task: _task }: StartFlowPickerProps) {
  return (
    <div className="border-t border-border bg-secondary px-3 py-2">
      <p className="text-xs text-muted">Start flow loading...</p>
    </div>
  );
}
