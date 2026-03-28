import { create } from "zustand";

interface ContextMenuTarget {
  path: string;
  isDir: boolean;
  x: number;
  y: number;
}

interface FileTreeState {
  /** Set of directory paths that are expanded */
  expandedDirs: Set<string>;

  /** Toggle a directory between expanded/collapsed */
  toggleDir: (path: string) => void;

  /** Expand a directory */
  expandDir: (path: string) => void;

  /** Collapse a directory */
  collapseDir: (path: string) => void;

  /** Check if a directory is expanded */
  isExpanded: (path: string) => boolean;

  /** Right-click context menu target */
  contextMenuTarget: ContextMenuTarget | null;

  /** Set context menu target */
  setContextMenu: (target: ContextMenuTarget) => void;

  /** Clear context menu */
  clearContextMenu: () => void;

  /** Path being renamed (inline edit mode) */
  renamingPath: string | null;

  /** Set path being renamed */
  setRenamingPath: (path: string | null) => void;
}

export const useFileTreeStore = create<FileTreeState>((set, get) => ({
  expandedDirs: new Set(),

  toggleDir: (path) =>
    set((s) => {
      const next = new Set(s.expandedDirs);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return { expandedDirs: next };
    }),

  expandDir: (path) =>
    set((s) => {
      const next = new Set(s.expandedDirs);
      next.add(path);
      return { expandedDirs: next };
    }),

  collapseDir: (path) =>
    set((s) => {
      const next = new Set(s.expandedDirs);
      next.delete(path);
      return { expandedDirs: next };
    }),

  isExpanded: (path) => get().expandedDirs.has(path),

  contextMenuTarget: null,

  setContextMenu: (target) => set({ contextMenuTarget: target }),

  clearContextMenu: () => set({ contextMenuTarget: null }),

  renamingPath: null,

  setRenamingPath: (path) => set({ renamingPath: path }),
}));
