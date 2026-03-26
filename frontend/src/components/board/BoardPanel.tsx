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
  const queueTasks: Task[] = [];
  const activeTasks: Task[] = [];
  const doneTasks: Task[] = [];
  for (const task of tasks) {
    switch (task.status) {
      case "active":
        activeTasks.push(task);
        break;
      case "done":
        doneTasks.push(task);
        break;
      default:
        queueTasks.push(task);
        break;
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
        tasks={queueTasks}
        isCollapsed={collapsed.queue ?? false}
        onToggle={() => toggle("queue")}
      />
      <TaskColumn
        status="active"
        tasks={activeTasks}
        isCollapsed={collapsed.active ?? false}
        onToggle={() => toggle("active")}
      />
      <TaskColumn
        status="done"
        tasks={doneTasks}
        isCollapsed={collapsed.done ?? true}
        onToggle={() => toggle("done")}
      />
    </div>
  );
}
