import { create } from "zustand";

export interface ReviewAnnotation {
  id: string;
  file: string;
  line: number;
  severity: "error" | "warning" | "suggestion" | "info";
  comment: string;
}

export interface CommentNote {
  id: string;
  author: string;
  body: string;
  created_at: string;
  updated_at?: string | null;
}

export interface CommentThread {
  id: string;
  file_path: string | null;
  line: number | null;
  side: "LEFT" | "RIGHT";
  resolved: boolean;
  comments: CommentNote[];
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
}

interface ReviewState {
  /** AI review annotations */
  annotations: ReviewAnnotation[];
  /** Existing MR/PR comments */
  comments: CommentThread[];
  /** Contextual chat history */
  reviewChatMessages: ChatMessage[];
  /** Loading state for AI review */
  isReviewing: boolean;
  /** Side panel visibility for annotations */
  annotationPanelOpen: boolean;
  /** Chat panel visibility */
  chatPanelOpen: boolean;

  // Actions
  setAnnotations: (annotations: ReviewAnnotation[]) => void;
  setComments: (comments: CommentThread[]) => void;
  addAnnotation: (annotation: ReviewAnnotation) => void;
  updateAnnotation: (id: string, updates: Partial<ReviewAnnotation>) => void;
  removeAnnotation: (id: string) => void;
  toggleAnnotationPanel: () => void;
  toggleChatPanel: () => void;
  addChatMessage: (message: ChatMessage) => void;
  setIsReviewing: (value: boolean) => void;
}

export const useReviewStore = create<ReviewState>((set) => ({
  annotations: [],
  comments: [],
  reviewChatMessages: [],
  isReviewing: false,
  annotationPanelOpen: false,
  chatPanelOpen: false,

  setAnnotations: (annotations) => set({ annotations }),
  setComments: (comments) => set({ comments }),
  addAnnotation: (annotation) =>
    set((s) => ({ annotations: [...s.annotations, annotation] })),
  updateAnnotation: (id, updates) =>
    set((s) => ({
      annotations: s.annotations.map((a) =>
        a.id === id ? { ...a, ...updates } : a,
      ),
    })),
  removeAnnotation: (id) =>
    set((s) => ({
      annotations: s.annotations.filter((a) => a.id !== id),
    })),
  toggleAnnotationPanel: () =>
    set((s) => ({ annotationPanelOpen: !s.annotationPanelOpen })),
  toggleChatPanel: () =>
    set((s) => ({ chatPanelOpen: !s.chatPanelOpen })),
  addChatMessage: (message) =>
    set((s) => ({
      reviewChatMessages: [...s.reviewChatMessages, message],
    })),
  setIsReviewing: (value) => set({ isReviewing: value }),
}));
