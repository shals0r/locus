import { create } from "zustand";
import { apiGet } from "../hooks/useApi";

interface Skill {
  name: string;
  description: string;
  path: string;
}

interface SkillStore {
  /** Keyed by "{machineId}:{repoPath}" for per-repo caching */
  skillsByRepo: Record<string, Skill[]>;
  loadingRepos: Set<string>;
  /** skillName -> sessionId mapping for active skill sessions */
  activeSkills: Record<string, string>;

  fetchSkills: (machineId: string, repoPath: string) => Promise<void>;
  clearSkills: (machineId: string, repoPath: string) => void;
  setActiveSkill: (skillName: string, sessionId: string) => void;
  clearActiveSkill: (skillName: string) => void;
}

export const useSkillStore = create<SkillStore>((set, get) => ({
  skillsByRepo: {},
  loadingRepos: new Set(),
  activeSkills: {},

  fetchSkills: async (machineId: string, repoPath: string) => {
    const key = `${machineId}:${repoPath}`;
    const state = get();

    // Already loading or cached
    if (state.loadingRepos.has(key) || state.skillsByRepo[key] !== undefined) {
      return;
    }

    set((s) => ({
      loadingRepos: new Set([...s.loadingRepos, key]),
    }));

    try {
      const encodedPath = encodeURIComponent(repoPath);
      const data = await apiGet<{ skills: Skill[]; repo_path: string }>(
        `/api/skills/${machineId}/${encodedPath}`,
      );
      set((s) => {
        const next = { ...s.skillsByRepo, [key]: data.skills };
        const loading = new Set(s.loadingRepos);
        loading.delete(key);
        return { skillsByRepo: next, loadingRepos: loading };
      });
    } catch (err) {
      console.error("Failed to fetch skills:", err);
      // Store empty array so we don't retry immediately
      set((s) => {
        const next = { ...s.skillsByRepo, [key]: [] };
        const loading = new Set(s.loadingRepos);
        loading.delete(key);
        return { skillsByRepo: next, loadingRepos: loading };
      });
    }
  },

  clearSkills: (machineId: string, repoPath: string) => {
    const key = `${machineId}:${repoPath}`;
    set((s) => {
      const next = { ...s.skillsByRepo };
      delete next[key];
      return { skillsByRepo: next };
    });
  },

  setActiveSkill: (skillName: string, sessionId: string) =>
    set((s) => ({
      activeSkills: { ...s.activeSkills, [skillName]: sessionId },
    })),

  clearActiveSkill: (skillName: string) =>
    set((s) => {
      const next = { ...s.activeSkills };
      delete next[skillName];
      return { activeSkills: next };
    }),
}));
