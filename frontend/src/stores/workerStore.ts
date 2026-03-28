import { create } from "zustand";
import { apiGet, apiPost, apiPatch, apiDelete } from "../hooks/useApi";

export interface Worker {
  id: string;
  name: string;
  source_type: string;
  worker_status: "stopped" | "starting" | "running" | "degraded" | "crashed" | "disabled";
  is_enabled: boolean;
  poll_interval_seconds: number;
  last_polled_at: string | null;
  failure_count: number;
  total_items_ingested: number;
  is_builtin: boolean;
  credential_id: string | null;
  created_at: string;
}

interface WorkerListResponse {
  workers: Worker[];
  total: number;
}

interface WorkerActionResponse {
  status: string;
  message: string;
}

interface WorkerStore {
  workers: Worker[];
  loading: boolean;
  error: string | null;
  expandedWorkerId: string | null;

  fetchWorkers: () => Promise<void>;
  startWorker: (id: string) => Promise<void>;
  stopWorker: (id: string) => Promise<void>;
  restartWorker: (id: string) => Promise<void>;
  enableWorker: (id: string) => Promise<void>;
  updateWorkerConfig: (id: string, data: Partial<Worker>) => Promise<void>;
  deleteWorker: (id: string) => Promise<void>;
  toggleExpanded: (id: string) => void;
  setWorkerStatus: (id: string, status: Worker["worker_status"]) => void;
}

export const useWorkerStore = create<WorkerStore>((set, get) => ({
  workers: [],
  loading: false,
  error: null,
  expandedWorkerId: null,

  fetchWorkers: async () => {
    set({ loading: true, error: null });
    try {
      const data = await apiGet<WorkerListResponse>("/api/workers");
      set({ workers: data.workers, loading: false });
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : "Failed to fetch workers",
        loading: false,
      });
    }
  },

  startWorker: async (id) => {
    try {
      await apiPost<WorkerActionResponse>(`/api/workers/${id}/start`, {});
      await get().fetchWorkers();
    } catch (err) {
      set({ error: err instanceof Error ? err.message : "Failed to start worker" });
    }
  },

  stopWorker: async (id) => {
    try {
      await apiPost<WorkerActionResponse>(`/api/workers/${id}/stop`, {});
      await get().fetchWorkers();
    } catch (err) {
      set({ error: err instanceof Error ? err.message : "Failed to stop worker" });
    }
  },

  restartWorker: async (id) => {
    try {
      await apiPost<WorkerActionResponse>(`/api/workers/${id}/restart`, {});
      await get().fetchWorkers();
    } catch (err) {
      set({ error: err instanceof Error ? err.message : "Failed to restart worker" });
    }
  },

  enableWorker: async (id) => {
    try {
      await apiPost<WorkerActionResponse>(`/api/workers/${id}/enable`, {});
      await get().fetchWorkers();
    } catch (err) {
      set({ error: err instanceof Error ? err.message : "Failed to enable worker" });
    }
  },

  updateWorkerConfig: async (id, data) => {
    try {
      await apiPatch<Worker>(`/api/workers/${id}`, data);
      await get().fetchWorkers();
    } catch (err) {
      set({ error: err instanceof Error ? err.message : "Failed to update worker" });
    }
  },

  deleteWorker: async (id) => {
    try {
      await apiDelete(`/api/workers/${id}`);
      set((s) => ({
        workers: s.workers.filter((w) => w.id !== id),
        expandedWorkerId: s.expandedWorkerId === id ? null : s.expandedWorkerId,
      }));
    } catch (err) {
      set({ error: err instanceof Error ? err.message : "Failed to delete worker" });
    }
  },

  toggleExpanded: (id) => {
    set((s) => ({
      expandedWorkerId: s.expandedWorkerId === id ? null : id,
    }));
  },

  setWorkerStatus: (id, status) => {
    set((s) => ({
      workers: s.workers.map((w) =>
        w.id === id ? { ...w, worker_status: status } : w,
      ),
    }));
  },
}));
