import { create } from "zustand";
import type { ClaudeSession, ClaudeStatus } from "../types";

interface ClaudeSessionState {
  claudeSessions: ClaudeSession[];
  setSessions: (sessions: ClaudeSession[]) => void;
  updateSessionStatus: (
    machineId: string,
    tmuxSession: string,
    status: ClaudeStatus,
  ) => void;
  getWaitingSessions: () => ClaudeSession[];
}

export const useClaudeSessionStore = create<ClaudeSessionState>((set, get) => ({
  claudeSessions: [],

  setSessions: (sessions) => set({ claudeSessions: sessions }),

  updateSessionStatus: (machineId, tmuxSession, status) =>
    set((s) => ({
      claudeSessions: s.claudeSessions.map((cs) =>
        cs.machine_id === machineId && cs.tmux_session === tmuxSession
          ? { ...cs, status }
          : cs,
      ),
    })),

  getWaitingSessions: () =>
    get().claudeSessions.filter((s) => s.status === "waiting"),
}));
