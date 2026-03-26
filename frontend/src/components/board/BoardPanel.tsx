import { useState } from "react";
import { useTasks } from "../../hooks/useTaskQueries";
import { TaskColumn } from "./TaskColumn";
import type { Task } from "../../types";

type SectionState = Record<string, boolean>;

/**
 * Board panel with 3 vertically stacked sections: Queue, Active, Done.
 * Fits within the 340px right panel. Single vertical scroll.
 */
export function BoardPanel() {
  const { data: tasks = [], isLoading } = useTasks();
  const [collapsed, setCollapsed] = useState<SectionState>({
    queue: false,
    active: false,
    done: true,
  });

  const toggle = (status: string) =>
    setCollapsed((prev) => ({ ...prev, [status]: !prev[status] }));

  // Group tasks by status
  const grouped: Record<string, Task[]> = { queue: [], active: [], done: [] };
  for (const task of tasks) {
    const bucket = grouped[task.status];
    if (bucket) {
      bucket.push(task);
    } else {
      // Unknown statuses fall into queue
      grouped.queue.push(task);
    }
  }

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-xs text-muted">Loading tasks...</p>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      <TaskColumn
        status="queue"
        tasks={grouped.queue}
        isCollapsed={collapsed.queue}
        onToggle={() => toggle("queue")}
      />
      <TaskColumn
        status="active"
        tasks={grouped.active}
        isCollapsed={collapsed.active}
        onToggle={() => toggle("active")}
      />
      <TaskColumn
        status="done"
        tasks={grouped.done}
        isCollapsed={collapsed.done}
        onToggle={() => toggle("done")}
      />
    </div>
  );
}
