import { create } from "zustand";
import type { RepoDetail, GsdState } from "../types";

interface RepoState {
  /** Currently selected machine for repo detail view */
  selectedMachineId: string | null;
  /** Currently selected repo path for commit timeline / detail view */
  selectedRepoPath: string | null;
  /** Repos keyed by machine_id */
  repos: Map<string, RepoDetail[]>;
  /** GSD states keyed by "machine_id:repo_path" */
  gsdStates: Map<string, GsdState>;

  setSelectedRepo: (machineId: string, repoPath: string) => void;
  clearSelection: () => void;
  setRepos: (machineId: string, repos: RepoDetail[]) => void;
  setGsdState: (machineId: string, repoPath: string, gsdState: GsdState) => void;
}

export const useRepoStore = create<RepoState>((set) => ({
  selectedMachineId: null,
  selectedRepoPath: null,
  repos: new Map(),
  gsdStates: new Map(),

  setSelectedRepo: (machineId, repoPath) =>
    set({ selectedMachineId: machineId, selectedRepoPath: repoPath }),

  clearSelection: () =>
    set({ selectedMachineId: null, selectedRepoPath: null }),

  setRepos: (machineId, repos) =>
    set((s) => {
      const next = new Map(s.repos);
      next.set(machineId, repos);
      return { repos: next };
    }),

  setGsdState: (machineId, repoPath, gsdState) =>
    set((s) => {
      const next = new Map(s.gsdStates);
      next.set(`${machineId}:${repoPath}`, gsdState);
      return { gsdStates: next };
    }),
}));
