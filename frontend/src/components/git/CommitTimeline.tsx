import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight, Loader2 } from "lucide-react";
import { useCommitLog } from "../../hooks/useGitStatus";
import { apiGet } from "../../hooks/useApi";
import { useSessionStore } from "../../stores/sessionStore";

interface CommitTimelineProps {
  machineId: string;
  repoPath: string;
}

interface CommitFile {
  path: string;
  name: string;
  dir: string;
  status: "M" | "A" | "D" | "R";
}

interface DiffResponse {
  diff: string;
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

/**
 * Parse file list from a unified diff string.
 * Extracts file paths from `diff --git a/X b/Y` lines and detects status
 * from subsequent mode lines (new file, deleted file, rename).
 */
function parseFilesFromDiff(diffText: string): CommitFile[] {
  const files: CommitFile[] = [];
  const sections = diffText.split(/(?=^diff --git )/m);

  for (const section of sections) {
    const headerMatch = section.match(/^diff --git a\/(.*?) b\/(.*)/m);
    if (!headerMatch) continue;

    const filePath = headerMatch[2] ?? headerMatch[1] ?? "unknown";
    let status: CommitFile["status"] = "M";

    if (/^new file mode/m.test(section)) {
      status = "A";
    } else if (/^deleted file mode/m.test(section)) {
      status = "D";
    } else if (/^rename from/m.test(section)) {
      status = "R";
    }

    const lastSlash = filePath.lastIndexOf("/");
    const dir = lastSlash === -1 ? "" : filePath.slice(0, lastSlash + 1);
    const name = lastSlash === -1 ? filePath : filePath.slice(lastSlash + 1);

    files.push({ path: filePath, name, dir, status });
  }

  return files;
}

const statusConfig: Record<string, { label: string; color: string }> = {
  M: { label: "M", color: "text-accent" },
  A: { label: "A", color: "text-success" },
  D: { label: "D", color: "text-error" },
  R: { label: "R", color: "text-warning" },
};

/**
 * Inline file list shown when a commit is expanded.
 */
function CommitFileList({
  machineId,
  repoPath,
  sha,
}: {
  machineId: string;
  repoPath: string;
  sha: string;
}) {
  const openDiffTab = useSessionStore((s) => s.openDiffTab);

  const { data: files, isLoading } = useQuery({
    queryKey: ["git-commit-files", machineId, repoPath, sha],
    queryFn: async () => {
      const params = new URLSearchParams({
        machine_id: machineId,
        repo_path: repoPath,
        sha,
      });
      const resp = await apiGet<DiffResponse>(
        `/api/git/commit-diff?${params.toString()}`,
      );
      return parseFilesFromDiff(resp.diff);
    },
    staleTime: 60_000,
  });

  if (isLoading) {
    return (
      <div className="flex items-center gap-1.5 pl-7 pr-2 py-1">
        <Loader2 size={10} className="animate-spin text-muted" />
        <span className="text-[10px] text-muted">Loading files...</span>
      </div>
    );
  }

  if (!files || files.length === 0) {
    return (
      <div className="pl-7 pr-2 py-1">
        <span className="text-[10px] text-muted italic">No changed files</span>
      </div>
    );
  }

  return (
    <div className="border-l border-accent/30 ml-[11px]">
      {files.map((file) => {
        const { label, color } = statusConfig[file.status] ?? {
          label: file.status,
          color: "text-muted",
        };
        return (
          <button
            key={file.path}
            className="flex w-full items-center gap-1.5 pl-3 pr-2 py-0.5 text-left hover:bg-hover/50 transition-colors"
            title={`${file.status} ${file.path}`}
            onClick={(e) => {
              e.stopPropagation();
              openDiffTab({
                type: "commit",
                machineId,
                repoPath,
                commitSha: sha,
                filePath: file.path,
                label: file.name,
              });
            }}
          >
            <span
              className={`w-3 shrink-0 text-center text-[10px] font-mono font-bold ${color}`}
            >
              {label}
            </span>
            <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-[10px]">
              <span className="text-muted">{file.dir}</span>
              <span className="text-primary-text">{file.name}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

export function CommitTimeline({ machineId, repoPath }: CommitTimelineProps) {
  const [expandedSha, setExpandedSha] = useState<string | null>(null);
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

      {commits.map((commit, i) => {
        const isExpanded = expandedSha === commit.sha;

        return (
          <div key={commit.sha}>
            <button
              className="group flex w-full items-start gap-2 px-2 py-1 text-left hover:bg-hover/50 transition-colors"
              title={`${commit.sha.slice(0, 8)} - ${commit.message}\n${commit.author}`}
              onClick={() =>
                setExpandedSha(isExpanded ? null : commit.sha)
              }
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
                <div className="flex items-center gap-1">
                  <ChevronRight
                    size={10}
                    className={`shrink-0 text-muted transition-transform duration-150 ${
                      isExpanded ? "rotate-90" : ""
                    }`}
                  />
                  <p className="truncate text-xs text-primary-text group-hover:text-accent">
                    {commit.message.split("\n")[0]}
                  </p>
                </div>
                <div className="flex items-center gap-2 pl-[14px]">
                  <span className="text-[10px] text-muted truncate">
                    {commit.author.split(" <")[0]}
                  </span>
                  <span className="text-[10px] text-muted">
                    {timeAgo(commit.date)}
                  </span>
                </div>
              </div>
            </button>

            {/* Expanded file list */}
            {isExpanded && (
              <CommitFileList
                machineId={machineId}
                repoPath={repoPath}
                sha={commit.sha}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
