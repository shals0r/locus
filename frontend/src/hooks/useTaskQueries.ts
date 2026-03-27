import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost, apiPatch } from "./useApi";
import type { Task } from "../types";
import { useTaskStore } from "../stores/taskStore";

/**
 * Fetch tasks, optionally filtered by status.
 */
export function useTasks(status?: string) {
  const path = status
    ? `/api/tasks?status=${encodeURIComponent(status)}`
    : "/api/tasks";
  return useQuery<Task[]>({
    queryKey: status ? ["tasks", status] : ["tasks"],
    queryFn: () => apiGet<Task[]>(path),
  });
}

/**
 * Transition a task to a new status.
 * PATCH /api/tasks/{id}/transition with body { status, machine_id?, repo_path?, branch? }
 */
export function useTransitionTask() {
  const queryClient = useQueryClient();
  const setActiveTask = useTaskStore((s) => s.setActiveTask);

  return useMutation({
    mutationFn: ({
      id,
      ...body
    }: {
      id: string;
      status: string;
      machine_id?: string;
      repo_path?: string;
      branch?: string;
    }) => apiPatch<Task>(`/api/tasks/${id}/transition`, body),
    onSuccess: (task) => {
      void queryClient.invalidateQueries({ queryKey: ["tasks"] });
      if (task.status === "active") {
        setActiveTask(task);
      }
    },
  });
}

/**
 * Create a new task.
 * POST /api/tasks/
 */
export function useCreateTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: { title: string; context?: string; tier?: string }) =>
      apiPost<Task>("/api/tasks", body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["tasks"] });
    },
  });
}
