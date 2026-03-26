import { useCommitLog } from "../../hooks/useGitStatus";

interface CommitTimelineProps {
  machineId: string;
  repoPath: string;
}

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const diffMin = Math.floor(diffMs / 60000);

  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 30) return `${diffDay}d ago`;
  return `${Math.floor(diffDay / 30)}mo ago`;
}

export function CommitTimeline({ machineId, repoPath }: CommitTimelineProps) {
  const { data: commits, isLoading } = useCommitLog(machineId, repoPath);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-4">
        <span className="text-[10px] text-muted">Loading commits...</span>
      </div>
    );
  }

  if (!commits || commits.length === 0) {
    return (
      <div className="flex items-center justify-center py-4">
        <span className="text-[10px] text-muted italic">No commits</span>
      </div>
    );
  }

  return (
    <div className="relative py-1">
      {/* Timeline vertical line */}
      <div className="absolute left-[11px] top-3 bottom-3 w-px bg-border" />

      {commits.map((commit, i) => (
        <button
          key={commit.sha}
          className="group flex w-full items-start gap-2 px-2 py-1 text-left hover:bg-hover/50 transition-colors"
          title={`${commit.sha.slice(0, 8)} - ${commit.message}\n${commit.author}`}
        >
          {/* Timeline dot */}
          <div className="relative z-10 mt-1 flex shrink-0">
            <span
              className={`h-2 w-2 rounded-full border border-border ${
                i === 0 ? "bg-accent" : "bg-secondary"
              }`}
            />
          </div>

          {/* Commit content */}
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs text-primary-text group-hover:text-accent">
              {commit.message.split("\n")[0]}
            </p>
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-muted truncate">
                {commit.author.split(" <")[0]}
              </span>
              <span className="text-[10px] text-muted">
                {timeAgo(commit.date)}
              </span>
            </div>
          </div>
        </button>
      ))}
    </div>
  );
}
