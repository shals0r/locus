import { useState } from "react";
import {
  Play,
  Check,
  Pencil,
  Trash2,
  Github,
  Ticket,
  Calendar,
  Globe,
  GitCompareArrows,
  Bot,
  X,
} from "lucide-react";
import type { Task, FeedTier } from "../../types";
import { useTransitionTask, useUpdateTask } from "../../hooks/useTaskQueries";
import { useTaskStore } from "../../stores/taskStore";
import { useSessionStore } from "../../stores/sessionStore";

const TIER_BORDER: Record<FeedTier, string> = {
  now: "border-l-red-500",
  respond: "border-l-orange-500",
  review: "border-l-blue-500",
  prep: "border-l-yellow-500",
  follow_up: "border-l-gray-500",
};

function SourceIcon({ sourceType }: { sourceType: string | null }) {
  if (!sourceType) return null;
  const size = 12;
  const cls = "text-muted shrink-0";
  switch (sourceType) {
    case "github":
      return <Github size={size} className={cls} />;
    case "jira":
      return <Ticket size={size} className={cls} />;
    case "calendar":
    case "google_calendar":
      return <Calendar size={size} className={cls} />;
    default:
      return <Globe size={size} className={cls} />;
  }
}

/**
 * Detect if a task is associated with an MR/PR based on source_links URLs.
 * Returns the source type ("github" or "gitlab") or null if not MR/PR.
 */
function detectMrSource(task: Task): "github" | "gitlab" | null {
  if (!task.source_links) return null;
  const urls = Object.values(task.source_links);
  for (const url of urls) {
    if (typeof url === "string") {
      if (url.includes("github.com") && url.includes("/pull/")) return "github";
      if (url.includes("gitlab.com") && url.includes("/merge_requests/"))
        return "gitlab";
      if (url.includes("gitlab") && url.includes("/merge_requests/"))
        return "gitlab";
    }
  }
  // Also check source_links keys
  const keys = Object.keys(task.source_links);
  for (const key of keys) {
    if (key === "github" || key === "gitlab") {
      const val = task.source_links[key];
      if (typeof val === "string" && (val.includes("/pull/") || val.includes("/merge_requests/"))) {
        return key as "github" | "gitlab";
      }
    }
  }
  return null;
}

/**
 * Extract MR/PR identifier from source_links URL.
 */
function extractMrId(task: Task): string | null {
  if (!task.source_links) return null;
  const urls = Object.values(task.source_links);
  for (const url of urls) {
    if (typeof url !== "string") continue;
    // GitHub: /owner/repo/pull/123
    const ghMatch = url.match(/github\.com\/([^/]+\/[^/]+)\/pull\/(\d+)/);
    if (ghMatch) return `${ghMatch[1]}#${ghMatch[2]}`;
    // GitLab: /project/merge_requests/123
    const glMatch = url.match(/merge_requests\/(\d+)/);
    if (glMatch) return glMatch[1] ?? null;
  }
  return null;
}

function isOlderThan24h(dateStr: string | null): boolean {
  if (!dateStr) return false;
  return Date.now() - new Date(dateStr).getTime() > 24 * 60 * 60 * 1000;
}

function formatTimestamp(dateStr: string | null): string {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  const now = Date.now();
  const diff = now - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

interface TaskCardProps {
  task: Task;
}

export function TaskCard({ task }: TaskCardProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(task.title);
  const [editContext, setEditContext] = useState(task.context ?? "");
  const transitionMutation = useTransitionTask();
  const updateMutation = useUpdateTask();
  const setStartFlowTaskId = useTaskStore((s) => s.setStartFlowTaskId);
  const startFlowTaskId = useTaskStore((s) => s.startFlowTaskId);

  const openDiffTab = useSessionStore((s) => s.openDiffTab);

  const tierColor = TIER_BORDER[task.tier] ?? "border-l-gray-500";
  const isDone = task.status === "done";
  const isActive = task.status === "active";
  const isQueue = task.status === "queue";
  const faded = isDone && isOlderThan24h(task.completed_at);
  const mrSource = detectMrSource(task);
  const isMrTask = mrSource !== null;

  // Determine which source icon to show (from feed item's source_links keys)
  const sourceType: string | null =
    task.source_links && Object.keys(task.source_links).length > 0
      ? (Object.keys(task.source_links)[0] ?? null)
      : null;

  const handleStart = (e: React.MouseEvent) => {
    e.stopPropagation();
    setStartFlowTaskId(startFlowTaskId === task.id ? null : task.id);
  };

  const handleComplete = (e: React.MouseEvent) => {
    e.stopPropagation();
    transitionMutation.mutate({ id: task.id, status: "done" });
  };

  const handleDrop = (e: React.MouseEvent) => {
    e.stopPropagation();
    transitionMutation.mutate({ id: task.id, status: "done" });
  };

  const handleEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    setEditTitle(task.title);
    setEditContext(task.context ?? "");
    setIsEditing(true);
  };

  const handleSave = (e: React.MouseEvent) => {
    e.stopPropagation();
    updateMutation.mutate(
      { id: task.id, title: editTitle, context: editContext || undefined },
      { onSuccess: () => setIsEditing(false) },
    );
  };

  const handleCancelEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsEditing(false);
  };

  const handleViewDiff = (e: React.MouseEvent) => {
    e.stopPropagation();
    const mrId = extractMrId(task);
    openDiffTab({
      type: "commit",
      machineId: task.machine_id ?? "local",
      repoPath: task.repo_path ?? "",
      commitSha: mrId ?? undefined,
      label: `MR: ${task.title}`,
    });
  };

  const handleAiReview = (e: React.MouseEvent) => {
    e.stopPropagation();
    // Open diff tab first, then the AI review is triggered separately
    const mrId = extractMrId(task);
    openDiffTab({
      type: "commit",
      machineId: task.machine_id ?? "local",
      repoPath: task.repo_path ?? "",
      commitSha: mrId ?? undefined,
      label: `Review: ${task.title}`,
    });
  };

  const handleApprove = (e: React.MouseEvent) => {
    e.stopPropagation();
    // Will be connected to useApprove mutation from useReviewApi when available
    console.log("Approve MR for task:", task.id);
  };

  const handleRequestChanges = (e: React.MouseEvent) => {
    e.stopPropagation();
    // Will open ReviewSubmitDialog with REQUEST_CHANGES event when available
    console.log("Request changes for task:", task.id);
  };

  if (isEditing) {
    return (
      <div
        className={`relative border-l-4 ${tierColor} px-2 py-1.5`}
        onClick={(e) => e.stopPropagation()}
      >
        <input
          type="text"
          value={editTitle}
          onChange={(e) => setEditTitle(e.target.value)}
          className="mb-1 w-full rounded border border-border bg-secondary px-1.5 py-1 text-sm text-primary-text outline-none focus:border-accent"
          placeholder="Title"
          autoFocus
        />
        <textarea
          value={editContext}
          onChange={(e) => setEditContext(e.target.value)}
          rows={2}
          className="mb-1.5 w-full resize-none rounded border border-border bg-secondary px-1.5 py-1 text-xs text-primary-text outline-none focus:border-accent"
          placeholder="Context (optional)"
        />
        <div className="flex justify-end gap-1.5">
          <button
            className="rounded px-2 py-0.5 text-[10px] text-muted hover:text-primary-text transition-colors"
            onClick={handleCancelEdit}
          >
            Cancel
          </button>
          <button
            className="rounded bg-accent px-2 py-0.5 text-[10px] font-medium text-white hover:bg-accent/90 transition-colors disabled:opacity-50"
            onClick={handleSave}
            disabled={!editTitle.trim() || updateMutation.isPending}
          >
            {updateMutation.isPending ? "Saving..." : "Save"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`relative border-l-4 ${tierColor} px-2 py-1.5 hover:bg-hover transition-all cursor-pointer ${
        faded ? "opacity-40" : ""
      }`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Top row: source icon + title */}
      <div className="flex items-center gap-1.5">
        <SourceIcon sourceType={sourceType} />
        <span
          className={`flex-1 truncate text-sm font-medium text-primary-text ${
            isDone ? "line-through" : ""
          }`}
        >
          {task.title}
        </span>
      </div>

      {/* Bottom row: context snippet or hover actions */}
      <div className="mt-0.5 min-h-[20px]">
        {isHovered ? (
          <div className="flex items-center gap-1">
            {isQueue && (
              <>
                <button
                  title="Start"
                  className="rounded p-1 text-muted hover:bg-accent/20 hover:text-accent transition-colors"
                  onClick={handleStart}
                >
                  <Play size={14} />
                </button>
                <button
                  title="Edit"
                  className="rounded p-1 text-muted hover:bg-accent/20 hover:text-accent transition-colors"
                  onClick={handleEdit}
                >
                  <Pencil size={14} />
                </button>
                <button
                  title="Drop"
                  className="rounded p-1 text-muted hover:bg-destructive/20 hover:text-destructive transition-colors"
                  onClick={handleDrop}
                >
                  <Trash2 size={14} />
                </button>
              </>
            )}
            {isActive && (
              <>
                <button
                  title="Complete"
                  className="rounded p-1 text-muted hover:bg-green-500/20 hover:text-green-400 transition-colors"
                  onClick={handleComplete}
                >
                  <Check size={14} />
                </button>
                <button
                  title="Edit"
                  className="rounded p-1 text-muted hover:bg-accent/20 hover:text-accent transition-colors"
                  onClick={handleEdit}
                >
                  <Pencil size={14} />
                </button>
              </>
            )}
            {isDone && (
              <span className="text-[10px] text-muted">
                {formatTimestamp(task.completed_at)}
              </span>
            )}
          </div>
        ) : (
          <p className="truncate text-xs text-muted">
            {isDone && task.completed_at
              ? `Completed ${formatTimestamp(task.completed_at)}`
              : task.context ?? "\u00A0"}
          </p>
        )}
      </div>

      {/* MR/PR action buttons - visible on hover for MR/PR-linked tasks */}
      {isMrTask && isHovered && (
        <div className="mt-1 flex items-center gap-1 border-t border-border/50 pt-1">
          <button
            title="View Diff"
            className="rounded p-1 text-muted hover:bg-accent/20 hover:text-accent transition-colors"
            onClick={handleViewDiff}
          >
            <GitCompareArrows size={14} />
          </button>
          <button
            title="AI Review"
            className="rounded p-1 text-muted hover:bg-purple-500/20 hover:text-purple-400 transition-colors"
            onClick={handleAiReview}
          >
            <Bot size={14} />
          </button>
          <button
            title="Approve"
            className="rounded p-1 text-muted hover:bg-green-500/20 hover:text-green-400 transition-colors"
            onClick={handleApprove}
          >
            <Check size={14} />
          </button>
          <button
            title="Request Changes"
            className="rounded p-1 text-muted hover:bg-red-500/20 hover:text-red-400 transition-colors"
            onClick={handleRequestChanges}
          >
            <X size={14} />
          </button>
        </div>
      )}
    </div>
  );
}
