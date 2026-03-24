import { create } from "zustand";
import type { TerminalSession } from "../types";

interface SessionState {
  sessions: TerminalSession[];
  activeSessionId: string | null;
  setSessions: (sessions: TerminalSession[]) => void;
  addSession: (session: TerminalSession) => void;
  removeSession: (id: string) => void;
  setActiveSession: (id: string) => void;
  updateSessionDisplayName: (id: string, displayName: string) => void;
  getSessionsForMachine: (machineId: string) => TerminalSession[];
}

export const useSessionStore = create<SessionState>((set, get) => ({
  sessions: [],
  activeSessionId: null,
  setSessions: (sessions) => set({ sessions }),
  addSession: (session) =>
    set((s) => ({ sessions: [...s.sessions, session] })),
  removeSession: (id) =>
    set((s) => ({
      sessions: s.sessions.filter((sess) => sess.id !== id),
      activeSessionId: s.activeSessionId === id ? null : s.activeSessionId,
    })),
  setActiveSession: (id) => set({ activeSessionId: id }),
  updateSessionDisplayName: (id, displayName) =>
    set((s) => ({
      sessions: s.sessions.map((sess) =>
        sess.id === id ? { ...sess, display_name: displayName } : sess,
      ),
    })),
  getSessionsForMachine: (machineId) =>
    get().sessions.filter((s) => s.machine_id === machineId),
}));
