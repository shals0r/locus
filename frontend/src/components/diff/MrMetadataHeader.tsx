import { useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  ExternalLink,
  GitBranch,
  ArrowRight,
  Users,
  Loader2,
} from "lucide-react";
import { useMrMetadata } from "../../hooks/useReviewApi";

interface MrMetadataHeaderProps {
  taskId: string;
}

function StatusBadge({ status }: { status: string }) {
  const colorMap: Record<string, string> = {
    open: "bg-green-600/20 text-green-400 border-green-600/30",
    opened: "bg-green-600/20 text-green-400 border-green-600/30",
    merged: "bg-purple-600/20 text-purple-400 border-purple-600/30",
    closed: "bg-red-600/20 text-red-400 border-red-600/30",
  };
  const colors = colorMap[status.toLowerCase()] ?? "bg-gray-600/20 text-gray-400 border-gray-600/30";

  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium ${colors}`}>
      {status}
    </span>
  );
}

function PipelineBadge({ status }: { status: string }) {
  const colorMap: Record<string, string> = {
    success: "text-green-400",
    passed: "text-green-400",
    failed: "text-red-400",
    running: "text-blue-400",
    pending: "text-yellow-400",
    canceled: "text-gray-400",
    cancelled: "text-gray-400",
  };
  const color = colorMap[status.toLowerCase()] ?? "text-gray-400";

  return (
    <span className={`text-[10px] ${color}`}>
      CI: {status}
    </span>
  );
}

export function MrMetadataHeader({ taskId }: MrMetadataHeaderProps) {
  const [expanded, setExpanded] = useState(false);
  const { data: metadata, isLoading, error } = useMrMetadata(taskId);

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 border-b border-border bg-secondary px-3 py-2">
        <Loader2 size={14} className="animate-spin text-muted" />
        <span className="text-xs text-muted">Loading MR metadata...</span>
      </div>
    );
  }

  if (error || !metadata) {
    return (
      <div className="flex items-center gap-2 border-b border-border bg-secondary px-3 py-2">
        <span className="text-xs text-red-400">
          {error instanceof Error ? error.message : "Failed to load metadata"}
        </span>
      </div>
    );
  }

  const prefix = metadata.provider === "gitlab" ? "MR !" : "PR #";
  const label = `${prefix}${metadata.mr_id}: ${metadata.title}`;

  return (
    <div className="border-b border-border bg-secondary">
      {/* Collapsed header bar */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-dominant/50 transition-colors"
      >
        {expanded ? (
          <ChevronUp size={14} className="shrink-0 text-muted" />
        ) : (
          <ChevronDown size={14} className="shrink-0 text-muted" />
        )}
        <span className="truncate text-sm font-medium text-primary-text">
          {label}
        </span>
        <span className="shrink-0 text-xs text-muted">{metadata.author}</span>
        <StatusBadge status={metadata.status} />
        {metadata.pipeline_status && (
          <PipelineBadge status={metadata.pipeline_status} />
        )}
      </button>

      {/* Expanded metadata card */}
      {expanded && (
        <div className="border-t border-border/50 px-4 py-3 space-y-2">
          <h3 className="text-sm font-semibold text-primary-text">
            {metadata.title}
          </h3>

          {metadata.description && (
            <p className="text-xs text-muted whitespace-pre-line leading-relaxed">
              {metadata.description}
            </p>
          )}

          <div className="flex flex-wrap items-center gap-4 text-xs text-muted">
            <span>
              <span className="text-primary-text">{metadata.author}</span>
            </span>

            <span className="flex items-center gap-1">
              <GitBranch size={12} />
              <span className="text-accent">{metadata.source_branch}</span>
              <ArrowRight size={10} />
              <span className="text-accent">{metadata.target_branch}</span>
            </span>

            {metadata.reviewers.length > 0 && (
              <span className="flex items-center gap-1">
                <Users size={12} />
                {metadata.reviewers.join(", ")}
              </span>
            )}

            {metadata.pipeline_status && (
              <PipelineBadge status={metadata.pipeline_status} />
            )}
          </div>

          {metadata.url && (
            <a
              href={metadata.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-accent hover:underline"
            >
              <ExternalLink size={12} />
              View on {metadata.provider === "gitlab" ? "GitLab" : "GitHub"}
            </a>
          )}
        </div>
      )}
    </div>
  );
}
