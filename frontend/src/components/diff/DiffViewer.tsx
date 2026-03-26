import { useMemo } from "react";
import { DiffView, DiffModeEnum, DiffFile } from "@git-diff-view/react";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { apiGet } from "../../hooks/useApi";
import "@git-diff-view/react/styles/diff-view.css";

interface DiffViewerProps {
  machineId: string;
  repoPath: string;
  filePath?: string;
  commitSha?: string;
}

interface DiffResponse {
  diff: string;
  file_path?: string;
}

function getFileExtension(path: string): string {
  const parts = path.split(".");
  return parts.length > 1 ? (parts[parts.length - 1] ?? "") : "";
}

export function DiffViewer({
  machineId,
  repoPath,
  filePath,
  commitSha,
}: DiffViewerProps) {
  const isFileDiff = !!filePath;
  const isCommitDiff = !!commitSha;

  const queryKey = isFileDiff
    ? ["git-diff", machineId, repoPath, filePath]
    : ["git-commit-diff", machineId, repoPath, commitSha];

  const queryFn = async (): Promise<string> => {
    if (isFileDiff) {
      const params = new URLSearchParams({
        machine_id: machineId,
        repo_path: repoPath,
        file_path: filePath!,
      });
      const resp = await apiGet<DiffResponse>(
        `/api/git/diff?${params.toString()}`,
      );
      return resp.diff;
    } else if (isCommitDiff) {
      const params = new URLSearchParams({
        machine_id: machineId,
        repo_path: repoPath,
        sha: commitSha!,
      });
      const resp = await apiGet<DiffResponse>(
        `/api/git/commit-diff?${params.toString()}`,
      );
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

  const diffFile = useMemo(() => {
    if (!diffText) return null;

    const lang = filePath ? getFileExtension(filePath) : "";
    const fileName = filePath || commitSha || "diff";

    const instance = new DiffFile(
      fileName,
      "",
      fileName,
      "",
      [diffText],
      lang,
      lang,
    );
    instance.initTheme("dark");
    instance.initRaw();
    instance.buildSplitDiffLines();
    instance.buildUnifiedDiffLines();

    return instance;
  }, [diffText, filePath, commitSha]);

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

  if (!diffText || !diffFile) {
    return (
      <div className="flex h-full items-center justify-center text-muted text-sm">
        No changes
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto diff-viewer-wrapper">
      <DiffView
        diffFile={diffFile}
        diffViewMode={DiffModeEnum.Unified}
        diffViewTheme="dark"
        diffViewHighlight={true}
        diffViewWrap={false}
        diffViewFontSize={13}
      />
    </div>
  );
}
