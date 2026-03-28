import { create } from "zustand";

interface EditorState {
  /** Tab IDs with unsaved changes */
  dirtyFiles: Set<string>;
  /** Cached file contents by tab ID (for unsaved state) */
  fileContents: Map<string, string>;
  /** Original content from disk for diff comparison */
  originalContents: Map<string, string>;

  markDirty: (tabId: string) => void;
  markClean: (tabId: string) => void;
  isDirty: (tabId: string) => boolean;

  setContent: (tabId: string, content: string) => void;
  getContent: (tabId: string) => string | undefined;

  setOriginal: (tabId: string, content: string) => void;
  getOriginal: (tabId: string) => string | undefined;

  /** Clean up all state for a closed tab */
  clearTab: (tabId: string) => void;
}

export const useEditorStore = create<EditorState>((set, get) => ({
  dirtyFiles: new Set(),
  fileContents: new Map(),
  originalContents: new Map(),

  markDirty: (tabId) =>
    set((s) => {
      const next = new Set(s.dirtyFiles);
      next.add(tabId);
      return { dirtyFiles: next };
    }),

  markClean: (tabId) =>
    set((s) => {
      const next = new Set(s.dirtyFiles);
      next.delete(tabId);
      return { dirtyFiles: next };
    }),

  isDirty: (tabId) => get().dirtyFiles.has(tabId),

  setContent: (tabId, content) =>
    set((s) => {
      const next = new Map(s.fileContents);
      next.set(tabId, content);
      return { fileContents: next };
    }),

  getContent: (tabId) => get().fileContents.get(tabId),

  setOriginal: (tabId, content) =>
    set((s) => {
      const next = new Map(s.originalContents);
      next.set(tabId, content);
      return { originalContents: next };
    }),

  getOriginal: (tabId) => get().originalContents.get(tabId),

  clearTab: (tabId) =>
    set((s) => {
      const dirtyFiles = new Set(s.dirtyFiles);
      dirtyFiles.delete(tabId);
      const fileContents = new Map(s.fileContents);
      fileContents.delete(tabId);
      const originalContents = new Map(s.originalContents);
      originalContents.delete(tabId);
      return { dirtyFiles, fileContents, originalContents };
    }),
}));
