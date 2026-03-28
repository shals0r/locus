import { create } from "zustand";
import type { TerminalSession } from "../types";

export type TabType = "terminal" | "diff" | "editor";

export interface CenterTab {
  id: string;
  type: TabType;
  label: string;
  icon: "terminal" | "diff" | "file";
  terminalData?: { sessionId: string; machineId: string };
  diffData?: {
    machineId: string;
    repoPath: string;
    filePath?: string;
    commitSha?: string;
    mrId?: string;
    sourceType?: string;
  };
  editorData?: { machineId: string; repoPath: string; filePath: string };
}

/** @deprecated Use CenterTab with type "diff" instead */
export interface DiffTab {
  type: "file" | "commit";
  machineId: string;
  repoPath: string;
  filePath?: string;
  commitSha?: string;
  label: string;
}

interface SessionState {
  sessions: TerminalSession[];
  activeSessionId: string | null;

  // Unified tab system
  tabs: CenterTab[];
  activeTabId: string | null;

  // Legacy (kept for backward compat)
  activeDiffTab: DiffTab | null;

  // Session management
  setSessions: (sessions: TerminalSession[]) => void;
  addSession: (session: TerminalSession) => void;
  removeSession: (id: string) => void;
  setActiveSession: (id: string) => void;
  updateSessionDisplayName: (id: string, displayName: string) => void;
  getSessionsForMachine: (machineId: string) => TerminalSession[];

  // Unified tab management
  openTab: (tab: CenterTab) => void;
  closeTab: (id: string) => void;
  setActiveTab: (id: string) => void;
  getTabById: (id: string) => CenterTab | undefined;
  reorderTabs: (fromIndex: number, toIndex: number) => void;

  // Legacy diff tab API (backward compat - creates CenterTab internally)
  openDiffTab: (tab: DiffTab) => void;
  closeDiffTab: () => void;

  // Editor tab convenience
  openEditorTab: (
    machineId: string,
    repoPath: string,
    filePath: string,
  ) => void;
}

export const useSessionStore = create<SessionState>((set, get) => ({
  sessions: [],
  activeSessionId: null,
  tabs: [],
  activeTabId: null,
  activeDiffTab: null,

  setSessions: (sessions) => set({ sessions }),

  addSession: (session) =>
    set((s) => {
      const tabId = `terminal-${session.id}`;
      const existingTab = s.tabs.find((t) => t.id === tabId);
      const label =
        session.display_name ||
        (session.repo_path
          ? session.repo_path.split("/").pop() || "Shell"
          : session.session_type === "claude"
            ? "Claude"
            : "Shell");
      const newTab: CenterTab = {
        id: tabId,
        type: "terminal",
        label,
        icon: "terminal",
        terminalData: {
          sessionId: session.id,
          machineId: session.machine_id,
        },
      };
      return {
        sessions: [...s.sessions, session],
        tabs: existingTab ? s.tabs : [...s.tabs, newTab],
        activeTabId: tabId,
        activeSessionId: session.id,
      };
    }),

  removeSession: (id) =>
    set((s) => {
      const tabId = `terminal-${id}`;
      const remainingTabs = s.tabs.filter((t) => t.id !== tabId);
      let newActiveTabId = s.activeTabId;
      let newActiveSessionId = s.activeSessionId;

      if (s.activeTabId === tabId) {
        // Select nearest remaining tab
        const oldIndex = s.tabs.findIndex((t) => t.id === tabId);
        const nearest =
          remainingTabs[Math.min(oldIndex, remainingTabs.length - 1)];
        newActiveTabId = nearest?.id ?? null;
        newActiveSessionId =
          nearest?.type === "terminal"
            ? (nearest.terminalData?.sessionId ?? null)
            : null;
      } else if (s.activeSessionId === id) {
        newActiveSessionId = null;
      }

      return {
        sessions: s.sessions.filter((sess) => sess.id !== id),
        tabs: remainingTabs,
        activeTabId: newActiveTabId,
        activeSessionId: newActiveSessionId,
      };
    }),

  setActiveSession: (id) =>
    set((s) => {
      const tabId = `terminal-${id}`;
      // If the tab doesn't exist yet (e.g., sessions loaded before tabs), create it
      const session = s.sessions.find((sess) => sess.id === id);
      let tabs = s.tabs;
      if (!s.tabs.find((t) => t.id === tabId) && session) {
        const label =
          session.display_name ||
          (session.repo_path
            ? session.repo_path.split("/").pop() || "Shell"
            : session.session_type === "claude"
              ? "Claude"
              : "Shell");
        tabs = [
          ...s.tabs,
          {
            id: tabId,
            type: "terminal" as const,
            label,
            icon: "terminal" as const,
            terminalData: {
              sessionId: session.id,
              machineId: session.machine_id,
            },
          },
        ];
      }
      return {
        tabs,
        activeSessionId: id,
        activeTabId: tabId,
        activeDiffTab: null,
      };
    }),

  updateSessionDisplayName: (id, displayName) =>
    set((s) => ({
      sessions: s.sessions.map((sess) =>
        sess.id === id ? { ...sess, display_name: displayName } : sess,
      ),
      tabs: s.tabs.map((t) =>
        t.id === `terminal-${id}` ? { ...t, label: displayName } : t,
      ),
    })),

  getSessionsForMachine: (machineId) =>
    get().sessions.filter((s) => s.machine_id === machineId),

  // Unified tab management
  openTab: (tab) =>
    set((s) => {
      const existing = s.tabs.find((t) => t.id === tab.id);
      if (existing) {
        // Already open, just activate
        return {
          activeTabId: tab.id,
          activeSessionId:
            tab.type === "terminal"
              ? (tab.terminalData?.sessionId ?? null)
              : null,
          activeDiffTab:
            tab.type === "diff" ? buildLegacyDiffTab(tab) : null,
        };
      }
      return {
        tabs: [...s.tabs, tab],
        activeTabId: tab.id,
        activeSessionId:
          tab.type === "terminal"
            ? (tab.terminalData?.sessionId ?? null)
            : null,
        activeDiffTab:
          tab.type === "diff" ? buildLegacyDiffTab(tab) : null,
      };
    }),

  closeTab: (id) =>
    set((s) => {
      const remainingTabs = s.tabs.filter((t) => t.id !== id);
      let newActiveTabId = s.activeTabId;
      let newActiveSessionId = s.activeSessionId;
      let newActiveDiffTab = s.activeDiffTab;

      if (s.activeTabId === id) {
        const oldIndex = s.tabs.findIndex((t) => t.id === id);
        const nearest =
          remainingTabs[Math.min(oldIndex, remainingTabs.length - 1)];
        newActiveTabId = nearest?.id ?? null;
        newActiveSessionId =
          nearest?.type === "terminal"
            ? (nearest.terminalData?.sessionId ?? null)
            : null;
        newActiveDiffTab =
          nearest?.type === "diff" ? buildLegacyDiffTab(nearest) : null;
      }

      // If closing a diff tab, clear legacy
      const closedTab = s.tabs.find((t) => t.id === id);
      if (closedTab?.type === "diff" && s.activeDiffTab) {
        newActiveDiffTab = null;
      }

      return {
        tabs: remainingTabs,
        activeTabId: newActiveTabId,
        activeSessionId: newActiveSessionId,
        activeDiffTab: newActiveDiffTab,
      };
    }),

  setActiveTab: (id) =>
    set((s) => {
      const tab = s.tabs.find((t) => t.id === id);
      if (!tab) return {};
      return {
        activeTabId: id,
        activeSessionId:
          tab.type === "terminal"
            ? (tab.terminalData?.sessionId ?? null)
            : null,
        activeDiffTab:
          tab.type === "diff" ? buildLegacyDiffTab(tab) : null,
      };
    }),

  getTabById: (id) => get().tabs.find((t) => t.id === id),

  reorderTabs: (fromIndex, toIndex) =>
    set((s) => {
      const tabs = [...s.tabs];
      const [moved] = tabs.splice(fromIndex, 1);
      tabs.splice(toIndex, 0, moved);
      return { tabs };
    }),

  // Legacy backward-compat: openDiffTab creates a CenterTab
  openDiffTab: (tab) =>
    set((s) => {
      const diffId = `diff-${tab.machineId}-${tab.filePath || tab.commitSha || "unknown"}`;
      const centerTab: CenterTab = {
        id: diffId,
        type: "diff",
        label: tab.label,
        icon: "diff",
        diffData: {
          machineId: tab.machineId,
          repoPath: tab.repoPath,
          filePath: tab.filePath,
          commitSha: tab.commitSha,
          sourceType: tab.type,
        },
      };
      const existing = s.tabs.find((t) => t.id === diffId);
      return {
        tabs: existing
          ? s.tabs.map((t) => (t.id === diffId ? centerTab : t))
          : [...s.tabs, centerTab],
        activeTabId: diffId,
        activeSessionId: null,
        activeDiffTab: tab,
      };
    }),

  closeDiffTab: () =>
    set((s) => {
      // Find and remove the active diff tab
      const diffTab = s.tabs.find(
        (t) => t.type === "diff" && t.id === s.activeTabId,
      );
      if (!diffTab) {
        return { activeDiffTab: null };
      }
      const remainingTabs = s.tabs.filter((t) => t.id !== diffTab.id);
      const oldIndex = s.tabs.findIndex((t) => t.id === diffTab.id);
      const nearest =
        remainingTabs[Math.min(oldIndex, remainingTabs.length - 1)];
      return {
        tabs: remainingTabs,
        activeDiffTab: null,
        activeTabId: nearest?.id ?? null,
        activeSessionId:
          nearest?.type === "terminal"
            ? (nearest.terminalData?.sessionId ?? null)
            : null,
      };
    }),

  // Editor tab convenience
  openEditorTab: (machineId, repoPath, filePath) =>
    set((s) => {
      const tabId = `editor-${machineId}-${filePath}`;
      const existing = s.tabs.find((t) => t.id === tabId);
      if (existing) {
        return { activeTabId: tabId, activeSessionId: null, activeDiffTab: null };
      }
      const fileName = filePath.split("/").pop() || filePath;
      const newTab: CenterTab = {
        id: tabId,
        type: "editor",
        label: fileName,
        icon: "file",
        editorData: { machineId, repoPath, filePath },
      };
      return {
        tabs: [...s.tabs, newTab],
        activeTabId: tabId,
        activeSessionId: null,
        activeDiffTab: null,
      };
    }),
}));

/** Build a legacy DiffTab from a CenterTab for backward compat */
function buildLegacyDiffTab(tab: CenterTab): DiffTab | null {
  if (tab.type !== "diff" || !tab.diffData) return null;
  return {
    type: (tab.diffData.sourceType as "file" | "commit") || "file",
    machineId: tab.diffData.machineId,
    repoPath: tab.diffData.repoPath,
    filePath: tab.diffData.filePath,
    commitSha: tab.diffData.commitSha,
    label: tab.label,
  };
}
