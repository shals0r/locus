import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost, apiPatch } from "./useApi";
import type { FeedItem } from "../types";

/**
 * Fetch feed items, optionally filtered by tier.
 */
export function useFeedItems(tier?: string) {
  const path = tier ? `/api/feed/?tier=${encodeURIComponent(tier)}` : "/api/feed/";
  return useQuery<FeedItem[]>({
    queryKey: tier ? ["feed", tier] : ["feed"],
    queryFn: () => apiGet<FeedItem[]>(path),
  });
}

/**
 * Dismiss a feed item (PATCH /api/feed/{id} with {is_dismissed: true}).
 */
export function useDismissItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiPatch<FeedItem>(`/api/feed/${id}`, { is_dismissed: true }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["feed"] });
    },
  });
}

/**
 * Snooze a feed item (POST /api/feed/{id}/snooze with {until: datetime}).
 */
export function useSnoozeItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, until }: { id: string; until: string }) =>
      apiPost<FeedItem>(`/api/feed/${id}/snooze`, { until }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["feed"] });
    },
  });
}

/**
 * Mark a feed item as read (PATCH /api/feed/{id} with {is_read: true}).
 */
export function useMarkRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiPatch<FeedItem>(`/api/feed/${id}`, { is_read: true }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["feed"] });
    },
  });
}

/**
 * Promote a feed item to a task.
 */
export function usePromoteItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      feedItemId,
      title,
      context,
    }: {
      feedItemId: string;
      title: string;
      context?: string;
    }) => apiPost<unknown>("/api/tasks/promote", { feed_item_id: feedItemId, title, context }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["feed"] });
      void queryClient.invalidateQueries({ queryKey: ["tasks"] });
    },
  });
}
