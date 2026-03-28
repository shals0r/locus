import { create } from "zustand";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AnnotationSeverity = "error" | "warning" | "suggestion" | "info";

export interface ReviewAnnotation {
  id: string;
  file: string;
  line: number;
  severity: AnnotationSeverity;
  comment: string;
  /** Whether this annotation is selected for batch post */
  selected: boolean;
}

interface ReviewState {
  /** All annotations from the AI review */
  annotations: ReviewAnnotation[];
  /** Whether the annotation panel is open */
  annotationPanelOpen: boolean;
  /** Currently focused annotation ID (for scroll-to-line) */
  focusedAnnotationId: string | null;

  /** Replace all annotations (from AI review response) */
  setAnnotations: (annotations: ReviewAnnotation[]) => void;
  /** Clear all annotations */
  clearAnnotations: () => void;
  /** Update a single annotation's comment text */
  updateAnnotation: (id: string, comment: string) => void;
  /** Toggle selection of a single annotation */
  toggleAnnotationSelected: (id: string) => void;
  /** Select/deselect all annotations */
  selectAll: (selected: boolean) => void;
  /** Get selected annotations */
  getSelectedAnnotations: () => ReviewAnnotation[];

  /** Open/close the annotation panel */
  setAnnotationPanelOpen: (open: boolean) => void;
  /** Toggle the annotation panel */
  toggleAnnotationPanel: () => void;
  /** Set the focused annotation (for scroll-to-line) */
  setFocusedAnnotation: (id: string | null) => void;
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useReviewStore = create<ReviewState>((set, get) => ({
  annotations: [],
  annotationPanelOpen: false,
  focusedAnnotationId: null,

  setAnnotations: (annotations) =>
    set({
      annotations: annotations.map((a) => ({ ...a, selected: false })),
      annotationPanelOpen: annotations.length > 0,
    }),

  clearAnnotations: () =>
    set({
      annotations: [],
      annotationPanelOpen: false,
      focusedAnnotationId: null,
    }),

  updateAnnotation: (id, comment) =>
    set((s) => ({
      annotations: s.annotations.map((a) =>
        a.id === id ? { ...a, comment } : a,
      ),
    })),

  toggleAnnotationSelected: (id) =>
    set((s) => ({
      annotations: s.annotations.map((a) =>
        a.id === id ? { ...a, selected: !a.selected } : a,
      ),
    })),

  selectAll: (selected) =>
    set((s) => ({
      annotations: s.annotations.map((a) => ({ ...a, selected })),
    })),

  getSelectedAnnotations: () =>
    get().annotations.filter((a) => a.selected),

  setAnnotationPanelOpen: (open) => set({ annotationPanelOpen: open }),

  toggleAnnotationPanel: () =>
    set((s) => ({ annotationPanelOpen: !s.annotationPanelOpen })),

  setFocusedAnnotation: (id) => set({ focusedAnnotationId: id }),
}));
