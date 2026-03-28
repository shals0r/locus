import { create } from "zustand";

export type AnnotationSeverity = "error" | "warning" | "suggestion" | "info";

export interface ReviewAnnotation {
  id: string;
  file: string;
  line: number;
  severity: AnnotationSeverity;
  comment: string;
  /** Whether the annotation is selected for batch operations */
  selected?: boolean;
}

export interface CommentNote {
  id: string;
  author: string;
  body: string;
  created_at: string;
}

export interface CommentThread {
  id: string;
  file: string;
  line: number;
  author: string;
  body: string;
  created_at: string;
  /** Whether this thread is resolved */
  resolved?: boolean;
  /** All comments in the thread (parent + replies) */
  comments: CommentNote[];
  replies: Array<{
    id: string;
    author: string;
    body: string;
    created_at: string;
  }>;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
}

interface ReviewState {
  annotations: ReviewAnnotation[];
  comments: CommentThread[];
  reviewChatMessages: ChatMessage[];
  isReviewing: boolean;
  annotationPanelOpen: boolean;
  chatPanelOpen: boolean;
  focusedAnnotationId: string | null;

  setAnnotations: (annotations: ReviewAnnotation[]) => void;
  setComments: (comments: CommentThread[]) => void;
  addAnnotation: (annotation: ReviewAnnotation) => void;
  updateAnnotation: (id: string, comment: string) => void;
  removeAnnotation: (id: string) => void;
  clearAnnotations: () => void;
  toggleAnnotationPanel: () => void;
  setAnnotationPanelOpen: (open: boolean) => void;
  setFocusedAnnotation: (id: string | null) => void;
  toggleAnnotationSelected: (id: string) => void;
  selectAll: (selected: boolean) => void;
  toggleChatPanel: () => void;
  addChatMessage: (message: ChatMessage) => void;
  clearChatMessages: () => void;
  setIsReviewing: (value: boolean) => void;
}

export const useReviewStore = create<ReviewState>((set) => ({
  annotations: [],
  comments: [],
  reviewChatMessages: [],
  isReviewing: false,
  annotationPanelOpen: false,
  chatPanelOpen: false,
  focusedAnnotationId: null,

  setAnnotations: (annotations) => set({ annotations }),
  setComments: (comments) => set({ comments }),
  addAnnotation: (annotation) =>
    set((s) => ({ annotations: [...s.annotations, annotation] })),
  updateAnnotation: (id, comment) =>
    set((s) => ({
      annotations: s.annotations.map((a) =>
        a.id === id ? { ...a, comment } : a,
      ),
    })),
  removeAnnotation: (id) =>
    set((s) => ({
      annotations: s.annotations.filter((a) => a.id !== id),
    })),
  clearAnnotations: () => set({ annotations: [] }),
  toggleAnnotationPanel: () =>
    set((s) => ({ annotationPanelOpen: !s.annotationPanelOpen })),
  setAnnotationPanelOpen: (open) => set({ annotationPanelOpen: open }),
  setFocusedAnnotation: (id) => set({ focusedAnnotationId: id }),
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
  toggleChatPanel: () =>
    set((s) => ({ chatPanelOpen: !s.chatPanelOpen })),
  addChatMessage: (message) =>
    set((s) => ({
      reviewChatMessages: [...s.reviewChatMessages, message],
    })),
  clearChatMessages: () => set({ reviewChatMessages: [] }),
  setIsReviewing: (value) => set({ isReviewing: value }),
}));
