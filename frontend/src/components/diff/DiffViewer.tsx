import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { apiGet } from "../../hooks/useApi";

interface DiffViewerProps {
  machineId: string;
  repoPath: string;
  filePath?: string;
  commitSha?: string;
}

interface DiffResponse {
  diff: string;
}

function DiffLine({ line, lineNum }: { line: string; lineNum: number }) {
  let bg = "";
  let textColor = "text-gray-300";
  let marker = " ";

  if (line.startsWith("@@")) {
    bg = "bg-blue-900/30";
    textColor = "text-blue-400";
    marker = " ";
  } else if (line.startsWith("+")) {
    bg = "bg-green-900/25";
    textColor = "text-green-400";
    marker = "+";
  } else if (line.startsWith("-")) {
    bg = "bg-red-900/25";
    textColor = "text-red-400";
    marker = "-";
  }

  return (
    <div className={`flex ${bg} hover:brightness-125`}>
      <span className="w-10 shrink-0 select-none text-right pr-2 text-[11px] text-gray-600">
        {lineNum}
      </span>
      <span className="w-4 shrink-0 select-none text-center text-[11px] text-gray-500">
        {marker}
      </span>
      <span className={`flex-1 text-[13px] whitespace-pre ${textColor}`}>
        {line.startsWith("+") || line.startsWith("-") ? line.slice(1) : line}
      </span>
    </div>
  );
}

export function DiffViewer({
  machineId,
  repoPath,
  filePath,
  commitSha,
}: DiffViewerProps) {
  const isFileDiff = !!filePath;
  const isCommitDiff = !!commitSha;

  const isCommitFileDiff = isCommitDiff && isFileDiff;

  const queryKey = isCommitFileDiff
    ? ["git-commit-file-diff", machineId, repoPath, commitSha, filePath]
    : isFileDiff
      ? ["git-diff", machineId, repoPath, filePath]
      : ["git-commit-diff", machineId, repoPath, commitSha];

  const queryFn = async (): Promise<string> => {
    if (isFileDiff && !isCommitDiff) {
      const params = new URLSearchParams({
        machine_id: machineId,
        repo_path: repoPath,
        file_path: filePath!,
      });
      // Try unstaged diff first, fall back to staged if empty
      const resp = await apiGet<DiffResponse>(
        `/api/git/diff?${params.toString()}`,
      );
      if (resp.diff) return resp.diff;
      params.set("staged", "true");
      const staged = await apiGet<DiffResponse>(
        `/api/git/diff?${params.toString()}`,
      );
      return staged.diff;
    } else if (isCommitDiff) {
      const params = new URLSearchParams({
        machine_id: machineId,
        repo_path: repoPath,
        sha: commitSha!,
      });
      const resp = await apiGet<DiffResponse>(
        `/api/git/commit-diff?${params.toString()}`,
      );
      // If a specific file is requested, extract just that file's diff section
      if (isCommitFileDiff && resp.diff) {
        const sections = resp.diff.split(/(?=^diff --git )/m);
        const fileSection = sections.find((section) => {
          const match = section.match(/^diff --git a\/(.*?) b\/(.*)/m);
          return match && (match[1] === filePath || match[2] === filePath);
        });
        return fileSection ?? resp.diff;
      }
      return resp.diff;
    }
    return "";
  };

  const {
    data: diffText,
    isLoading,
    error,
  } = useQuery({
    queryKey,
    queryFn,
    enabled: isFileDiff || isCommitDiff,
    staleTime: 10_000,
  });

  if (!isFileDiff && !isCommitDiff) {
    return (
      <div className="flex h-full items-center justify-center text-muted text-sm">
        Select a file or commit to view its diff.
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted" />
        <span className="ml-2 text-sm text-muted">Loading diff...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <p className="text-sm text-red-400">Failed to load diff</p>
          <p className="mt-1 text-xs text-muted">
            {error instanceof Error ? error.message : "Unknown error"}
          </p>
        </div>
      </div>
    );
  }

  if (!diffText) {
    return (
      <div className="flex h-full items-center justify-center text-muted text-sm">
        No changes
      </div>
    );
  }

  const lines = diffText.split("\n");

  return (
    <div className="h-full overflow-auto font-mono" style={{ background: "#1a1b26" }}>
      {lines.map((line, i) => (
        <DiffLine key={i} line={line} lineNum={i + 1} />
      ))}
    </div>
  );
}
