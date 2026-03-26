import { useState, useCallback } from "react";
import {
  ChevronDown,
  ChevronRight,
  Check,
  Copy,
  ExternalLink,
  GitBranch,
  Monitor,
} from "lucide-react";
import type { FeedTier } from "../../types";
import { useTaskStore } from "../../stores/taskStore";
import { useTransitionTask } from "../../hooks/useTaskQueries";

const TIER_DOT: Record<FeedTier, string> = {
  now: "bg-red-500",
  respond: "bg-orange-500",
  review: "bg-blue-500",
  prep: "bg-yellow-500",
  follow_up: "bg-gray-500",
};

/**
 * Pinned context strip above center panel when a task is active.
 * Collapsed: tier dot, title, Active badge, expand chevron.
 * Expanded: context brief, source links, machine/repo/branch, Copy context, Complete.
 */
export function ContextStrip() {
  const activeTask = useTaskStore((s) => s.activeTask);
  const clearActiveTask = useTaskStore((s) => s.clearActiveTask);
  const transitionMutation = useTransitionTask();
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleComplete = useCallback(() => {
    if (!activeTask) return;
    transitionMutation.mutate(
      { id: activeTask.id, status: "done" },
      { onSuccess: () => clearActiveTask() },
    );
  }, [activeTask, transitionMutation, clearActiveTask]);

  const handleCopyContext = useCallback(async () => {
    if (!activeTask) return;
    const lines = [`Task: ${activeTask.title}`];
    if (activeTask.context) lines.push(`Context: ${activeTask.context}`);
    if (activeTask.branch) lines.push(`Branch: ${activeTask.branch}`);
    if (activeTask.repo_path) lines.push(`Repo: ${activeTask.repo_path}`);
    if (activeTask.source_links) {
      const urls = Object.values(activeTask.source_links);
      if (urls.length > 0) lines.push(`Source: ${urls[0]}`);
    }
    try {
      await navigator.clipboard.writeText(lines.join("\n"));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API may fail in non-secure contexts
    }
  }, [activeTask]);

  if (!activeTask) return null;

  const tierDot = TIER_DOT[activeTask.tier] ?? "bg-gray-500";
  const sourceLinks = activeTask.source_links ?? {};

  return (
    <div className="bg-secondary border-b border-border px-3 py-2">
      {/* Collapsed view: always visible */}
      <div className="flex items-center gap-2">
        <button
          className="shrink-0 text-muted hover:text-primary-text transition-colors"
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </button>
        <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${tierDot}`} />
        <span className="flex-1 truncate text-sm font-medium text-primary-text">
          {activeTask.title}
        </span>
        <span className="shrink-0 rounded-full bg-green-500/20 px-2 py-0.5 text-[10px] font-semibold text-green-400">
          Active
        </span>
        <button
          title="Complete task"
          className="shrink-0 rounded p-1 text-muted hover:bg-green-500/20 hover:text-green-400 transition-colors"
          onClick={handleComplete}
        >
          <Check size={14} />
        </button>
      </div>

      {/* Expanded view */}
      {expanded && (
        <div className="mt-2 space-y-1.5 pl-6">
          {/* Context brief */}
          {activeTask.context && (
            <p className="text-xs text-muted leading-relaxed">
              {activeTask.context}
            </p>
          )}

          {/* Machine / repo / branch */}
          <div className="flex flex-wrap items-center gap-2 text-[10px] text-muted">
            {activeTask.machine_id && (
              <span className="flex items-center gap-0.5">
                <Monitor size={10} />
                {activeTask.machine_id}
              </span>
            )}
            {activeTask.repo_path && (
              <span className="flex items-center gap-0.5">
                <GitBranch size={10} />
                {activeTask.repo_path}
              </span>
            )}
            {activeTask.branch && (
              <span className="rounded bg-accent/10 px-1.5 py-0.5 text-accent">
                {activeTask.branch}
              </span>
            )}
          </div>

          {/* Source links */}
          {Object.keys(sourceLinks).length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              {Object.entries(sourceLinks).map(([type, url]) => (
                <a
                  key={type}
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-0.5 rounded bg-hover px-1.5 py-0.5 text-[10px] text-accent hover:bg-accent/20 transition-colors"
                >
                  <ExternalLink size={10} />
                  {type}
                </a>
              ))}
            </div>
          )}

          {/* Copy context button */}
          <button
            className="flex items-center gap-1 rounded px-2 py-1 text-[10px] text-muted hover:bg-hover hover:text-primary-text transition-colors"
            onClick={handleCopyContext}
          >
            <Copy size={10} />
            {copied ? "Copied!" : "Copy context"}
          </button>
        </div>
      )}
    </div>
  );
}
