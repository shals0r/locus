import { create } from "zustand";

export type CommandPaletteMode = "default" | "goto-line";

interface CommandPaletteState {
  isOpen: boolean;
  mode: CommandPaletteMode;
  open: () => void;
  close: () => void;
  toggle: () => void;
  setMode: (mode: CommandPaletteMode) => void;
  openWithMode: (mode: CommandPaletteMode) => void;
}

export const useCommandPaletteStore = create<CommandPaletteState>((set) => ({
  isOpen: false,
  mode: "default",
  open: () => set({ isOpen: true, mode: "default" }),
  close: () => set({ isOpen: false, mode: "default" }),
  toggle: () =>
    set((s) => (s.isOpen ? { isOpen: false, mode: "default" } : { isOpen: true, mode: "default" })),
  setMode: (mode) => set({ mode }),
  openWithMode: (mode) => set({ isOpen: true, mode }),
}));
