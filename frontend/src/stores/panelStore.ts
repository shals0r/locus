import { create } from "zustand";

interface PanelState {
  sidebarCollapsed: boolean;
  rightPanelCollapsed: boolean;
  toggleSidebar: () => void;
  toggleRightPanel: () => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  setRightPanelCollapsed: (collapsed: boolean) => void;
}

export const usePanelStore = create<PanelState>((set) => ({
  sidebarCollapsed: false,
  rightPanelCollapsed: false, // Phase 2: right panel visible with feed
  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
  toggleRightPanel: () =>
    set((s) => ({ rightPanelCollapsed: !s.rightPanelCollapsed })),
  setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),
  setRightPanelCollapsed: (collapsed) =>
    set({ rightPanelCollapsed: collapsed }),
}));
