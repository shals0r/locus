import { create } from "zustand";

interface PanelState {
  sidebarCollapsed: boolean;
  rightPanelCollapsed: boolean; // always true in Phase 1
  toggleSidebar: () => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  setRightPanelCollapsed: (collapsed: boolean) => void;
}

export const usePanelStore = create<PanelState>((set) => ({
  sidebarCollapsed: false,
  rightPanelCollapsed: true, // D-06: collapsed by default in Phase 1
  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
  setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),
  setRightPanelCollapsed: (collapsed) =>
    set({ rightPanelCollapsed: collapsed }),
}));
