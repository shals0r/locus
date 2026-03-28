import { create } from "zustand";

export interface ReviewAnnotation {
  id: string;
  file: string;
  line: number;
  severity: "error" | "warning" | "suggestion" | "info";
  comment: string;
}

export interface CommentThread {
  id: string;
  file: string;
  line: number;
  author: string;
  body: string;
  created_at: string;
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

  setAnnotations: (annotations: ReviewAnnotation[]) => void;
  setComments: (comments: CommentThread[]) => void;
  addAnnotation: (annotation: ReviewAnnotation) => void;
  updateAnnotation: (id: string, comment: string) => void;
  removeAnnotation: (id: string) => void;
  toggleAnnotationPanel: () => void;
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
  toggleAnnotationPanel: () =>
    set((s) => ({ annotationPanelOpen: !s.annotationPanelOpen })),
  toggleChatPanel: () =>
    set((s) => ({ chatPanelOpen: !s.chatPanelOpen })),
  addChatMessage: (message) =>
    set((s) => ({
      reviewChatMessages: [...s.reviewChatMessages, message],
    })),
  clearChatMessages: () => set({ reviewChatMessages: [] }),
  setIsReviewing: (value) => set({ isReviewing: value }),
}));
