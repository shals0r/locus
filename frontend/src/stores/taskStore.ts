import { create } from "zustand";
import type { Task } from "../types";

interface TaskState {
  /** The currently active (started) task */
  activeTask: Task | null;
  /** Which task is showing the start flow picker */
  startFlowTaskId: string | null;
  setActiveTask: (task: Task | null) => void;
  setStartFlowTaskId: (id: string | null) => void;
  clearActiveTask: () => void;
}

export const useTaskStore = create<TaskState>((set) => ({
  activeTask: null,
  startFlowTaskId: null,
  setActiveTask: (task) => set({ activeTask: task }),
  setStartFlowTaskId: (id) => set({ startFlowTaskId: id }),
  clearActiveTask: () => set({ activeTask: null }),
}));
