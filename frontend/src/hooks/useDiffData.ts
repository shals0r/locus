import { useQuery } from "@tanstack/react-query";
import { apiGet } from "./useApi";

interface DiffResponse {
  diff: string;
}

interface ChangedFileEntry {
  path: string;
  status: string;
}

/**
 * Fetches diff text for a file or commit.
 * For file diffs: tries unstaged first, falls back to staged.
 * For commit diffs: fetches the full commit diff.
 * For commit+file diffs: fetches the commit diff and extracts the file section.
 */
export function useDiffData(
  machineId: string | undefined,
  repoPath: string | undefined,
  filePath?: string,
  commitSha?: string,
) {
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
        machine_id: machineId!,
        repo_path: repoPath!,
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
        machine_id: machineId!,
        repo_path: repoPath!,
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

  const { data: diffText, isLoading, error } = useQuery({
    queryKey,
    queryFn,
    enabled: !!machineId && !!repoPath && (isFileDiff || isCommitDiff),
    staleTime: 10_000,
  });

  return { diffText: diffText ?? "", isLoading, error };
}

/**
 * Fetches the list of changed files for a repo.
 */
export function useChangedFiles(
  machineId: string | undefined,
  repoPath: string | undefined,
) {
  const { data, isLoading } = useQuery({
    queryKey: ["git-changed-files", machineId, repoPath],
    queryFn: async () => {
      const params = new URLSearchParams({
        machine_id: machineId!,
        repo_path: repoPath!,
      });
      return apiGet<ChangedFileEntry[]>(
        `/api/git/changed-files?${params.toString()}`,
      );
    },
    enabled: !!machineId && !!repoPath,
    staleTime: 5_000,
    refetchInterval: 10_000,
  });

  return { files: data ?? [], isLoading };
}

/**
 * Placeholder hook for MR/PR diffs.
 * Plan 05 will implement the actual backend; for now returns empty state.
 */
export function useMrDiff(
  _sourceType?: string,
  _mrId?: string,
  _projectInfo?: { owner?: string; repo?: string; projectId?: string },
) {
  return {
    diffText: "",
    files: [] as ChangedFileEntry[],
    mrTitle: "",
    mrAuthor: "",
    mrStatus: "open" as "open" | "merged" | "closed",
    isLoading: false,
    error: null as Error | null,
  };
}
