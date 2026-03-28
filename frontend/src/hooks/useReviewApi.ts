import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost } from "./useApi";
import type { CommentThread } from "../stores/reviewStore";

export interface MrMetadata {
  mr_id: string;
  title: string;
  description: string | null;
  author: string;
  status: string;
  source_branch: string;
  target_branch: string;
  reviewers: string[];
  pipeline_status: string | null;
  url: string | null;
  provider: string;
}

export interface MrDiffFile {
  filename: string;
  status: string;
  patch: string;
}

export interface MrDiffResponse {
  files: MrDiffFile[];
}

/**
 * Fetch MR/PR metadata for a task.
 */
export function useMrMetadata(taskId: string | undefined) {
  return useQuery<MrMetadata>({
    queryKey: ["review-metadata", taskId],
    queryFn: () =>
      apiGet<MrMetadata>(
        `/api/review/metadata?task_id=${encodeURIComponent(taskId!)}`,
      ),
    enabled: !!taskId,
    staleTime: 60_000,
  });
}

/**
 * Fetch MR/PR diff (changed files with patches).
 */
export function useMrDiff(taskId: string | undefined) {
  return useQuery<MrDiffResponse>({
    queryKey: ["review-diff", taskId],
    queryFn: () =>
      apiGet<MrDiffResponse>(
        `/api/review/diff?task_id=${encodeURIComponent(taskId!)}`,
      ),
    enabled: !!taskId,
    staleTime: 60_000,
  });
}

/**
 * Fetch existing MR/PR comments as threads.
 */
export function useMrComments(taskId: string | undefined) {
  return useQuery<CommentThread[]>({
    queryKey: ["review-comments", taskId],
    queryFn: () =>
      apiGet<CommentThread[]>(
        `/api/review/comments?task_id=${encodeURIComponent(taskId!)}`,
      ),
    enabled: !!taskId,
    staleTime: 30_000,
  });
}

/**
 * Reply to an existing comment thread.
 * Invalidates comments query on success.
 */
export function useReplyToComment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (vars: { taskId: string; threadId: string; body: string }) =>
      apiPost<Record<string, unknown>>("/api/review/reply", {
        task_id: vars.taskId,
        thread_id: vars.threadId,
        body: vars.body,
      }),
    onSuccess: (_data, vars) => {
      void queryClient.invalidateQueries({
        queryKey: ["review-comments", vars.taskId],
      });
    },
  });
}

/**
 * Submit a full review with comments and event.
 */
export function useSubmitReview() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (vars: {
      taskId: string;
      comments: Array<{
        file_path: string;
        line: number;
        body: string;
        side?: string;
      }>;
      event: string;
      body: string;
    }) =>
      apiPost<Record<string, unknown>>("/api/review/submit", {
        task_id: vars.taskId,
        comments: vars.comments,
        event: vars.event,
        body: vars.body,
      }),
    onSuccess: (_data, vars) => {
      void queryClient.invalidateQueries({
        queryKey: ["review-comments", vars.taskId],
      });
    },
  });
}

/**
 * Approve an MR/PR.
 */
export function useApprove() {
  return useMutation({
    mutationFn: (vars: { taskId: string }) =>
      apiPost<Record<string, unknown>>(
        `/api/review/approve?task_id=${encodeURIComponent(vars.taskId)}`,
        {},
      ),
  });
}
