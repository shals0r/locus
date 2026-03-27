import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost } from "./useApi";
import { useRepoStore } from "../stores/repoStore";
import type {
  RepoDetail,
  CommitEntry,
  ChangedFile,
  BranchInfo,
  GitOpResult,
  GsdState,
} from "../types";

/**
 * Fetch all repo statuses for a machine with 30s polling.
 */
export function useGitStatusAll(machineId: string | null) {
  const setRepos = useRepoStore((s) => s.setRepos);

  return useQuery({
    queryKey: ["git-status-all", machineId],
    queryFn: async () => {
      const repos = await apiGet<RepoDetail[]>(
        `/api/git/status/all?machine_id=${machineId}`,
      );
      if (machineId) {
        setRepos(machineId, repos);
      }
      return repos;
    },
    enabled: !!machineId,
    refetchInterval: 30_000,
  });
}

/**
 * Fetch commit log for a specific repo. Enabled only when repoPath is set.
 */
export function useCommitLog(
  machineId: string | null,
  repoPath: string | null,
  limit = 30,
) {
  return useQuery({
    queryKey: ["git-commits", machineId, repoPath, limit],
    queryFn: () =>
      apiGet<CommitEntry[]>(
        `/api/git/commits?machine_id=${machineId}&repo_path=${encodeURIComponent(repoPath!)}&limit=${limit}`,
      ),
    enabled: !!machineId && !!repoPath,
  });
}

/**
 * Fetch changed files for a specific repo.
 */
export function useChangedFiles(
  machineId: string | null,
  repoPath: string | null,
) {
  return useQuery({
    queryKey: ["git-changed-files", machineId, repoPath],
    queryFn: () =>
      apiGet<ChangedFile[]>(
        `/api/git/changed-files?machine_id=${machineId}&repo_path=${encodeURIComponent(repoPath!)}`,
      ),
    enabled: !!machineId && !!repoPath,
  });
}

/**
 * Fetch branches for a specific repo.
 */
export function useBranches(
  machineId: string | null,
  repoPath: string | null,
) {
  return useQuery({
    queryKey: ["git-branches", machineId, repoPath],
    queryFn: () =>
      apiGet<BranchInfo[]>(
        `/api/git/branches?machine_id=${machineId}&repo_path=${encodeURIComponent(repoPath!)}`,
      ),
    enabled: !!machineId && !!repoPath,
  });
}

/**
 * Mutation for git operations (fetch, pull, push, checkout, create-branch).
 * Invalidates git status queries on success.
 */
export function useGitOp() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      operation,
      machineId,
      repoPath,
      branch,
    }: {
      operation: "fetch" | "pull" | "push" | "checkout" | "create-branch";
      machineId: string;
      repoPath: string;
      branch?: string;
    }) => {
      return apiPost<GitOpResult>(`/api/git/${operation}`, {
        machine_id: machineId,
        repo_path: repoPath,
        branch,
      });
    },
    onSuccess: (_data, variables) => {
      // Force immediate refetch of all git queries for this machine/repo
      void queryClient.refetchQueries({
        queryKey: ["git-status-all", variables.machineId],
      });
      void queryClient.refetchQueries({
        queryKey: ["git-commits", variables.machineId, variables.repoPath],
      });
      void queryClient.refetchQueries({
        queryKey: [
          "git-changed-files",
          variables.machineId,
          variables.repoPath,
        ],
      });
      void queryClient.refetchQueries({
        queryKey: ["git-branches", variables.machineId, variables.repoPath],
      });
    },
  });
}

/**
 * Fetch GSD state for a specific repo. Uses longer staleTime since GSD changes infrequently.
 */
export function useGsdState(
  machineId: string | null,
  repoPath: string | null,
) {
  const setGsdState = useRepoStore((s) => s.setGsdState);

  return useQuery({
    queryKey: ["gsd-state", machineId, repoPath],
    queryFn: async () => {
      const state = await apiGet<GsdState>(
        `/api/git/gsd-state?machine_id=${machineId}&repo_path=${encodeURIComponent(repoPath!)}`,
      );
      if (machineId && repoPath) {
        setGsdState(machineId, repoPath, state);
      }
      return state;
    },
    enabled: !!machineId && !!repoPath,
    staleTime: 60_000,
  });
}
