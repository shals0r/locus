import { ChevronDown, ChevronRight } from "lucide-react";
import type { Task, FeedTier } from "../../types";
import { TaskCard } from "./TaskCard";
import { useTaskStore } from "../../stores/taskStore";
import { StartFlowPicker } from "./StartFlowPicker";

/** Tier priority for sorting queue tasks (lower = higher priority). */
const TIER_PRIORITY: Record<FeedTier, number> = {
  now: 0,
  respond: 1,
  review: 2,
  prep: 3,
  follow_up: 4,
};

const STATUS_LABELS: Record<string, string> = {
  queue: "Queue",
  active: "Active",
  done: "Done",
};

function sortTasks(tasks: Task[], status: string): Task[] {
  switch (status) {
    case "queue":
      return [...tasks].sort(
        (a, b) =>
          (TIER_PRIORITY[a.tier] ?? 99) - (TIER_PRIORITY[b.tier] ?? 99),
      );
    case "active":
      return [...tasks].sort(
        (a, b) =>
          new Date(a.started_at ?? a.created_at).getTime() -
          new Date(b.started_at ?? b.created_at).getTime(),
      );
    case "done":
      return [...tasks].sort(
        (a, b) =>
          new Date(b.completed_at ?? b.created_at).getTime() -
          new Date(a.completed_at ?? a.created_at).getTime(),
      );
    default:
      return tasks;
  }
}

interface TaskColumnProps {
  status: string;
  tasks: Task[];
  isCollapsed: boolean;
  onToggle: () => void;
}

export function TaskColumn({
  status,
  tasks,
  isCollapsed,
  onToggle,
}: TaskColumnProps) {
  const startFlowTaskId = useTaskStore((s) => s.startFlowTaskId);
  const sorted = sortTasks(tasks, status);
  const label = STATUS_LABELS[status] ?? status;

  return (
    <div className="border-b border-border last:border-b-0">
      {/* Section header */}
      <button
        className="flex w-full items-center gap-1.5 px-3 py-2 text-xs font-semibold text-muted uppercase tracking-wide hover:bg-hover transition-colors"
        onClick={onToggle}
      >
        {isCollapsed ? (
          <ChevronRight size={14} />
        ) : (
          <ChevronDown size={14} />
        )}
        <span>{label}</span>
        <span className="ml-auto rounded-full bg-hover px-1.5 py-0.5 text-[10px] font-medium text-muted">
          {tasks.length}
        </span>
      </button>

      {/* Task cards */}
      {!isCollapsed && (
        <div className="space-y-0 divide-y divide-border/50">
          {sorted.length === 0 ? (
            <p className="px-3 py-2 text-xs text-muted italic">No tasks</p>
          ) : (
            sorted.map((task) => (
              <div key={task.id}>
                <TaskCard task={task} />
                {startFlowTaskId === task.id && status === "queue" && (
                  <StartFlowPicker task={task} />
                )}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
