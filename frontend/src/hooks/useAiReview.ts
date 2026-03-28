import { useMutation } from "@tanstack/react-query";
import { apiPost } from "./useApi";
import { useReviewStore } from "../stores/reviewStore";
import type { ReviewAnnotation } from "../stores/reviewStore";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AiReviewRequest {
  diff_text: string;
  custom_prompt?: string;
}

interface AnnotationItem {
  id: string;
  file: string;
  line: number;
  severity: string;
  comment: string;
}

interface AiReviewResponse {
  annotations: AnnotationItem[];
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Hook for triggering AI code review.
 *
 * Returns:
 * - triggerReview(diffText, customPrompt?) -- sends diff to AI for review
 * - isReviewing -- loading state while review is in progress
 */
export function useAiReview() {
  const setAnnotations = useReviewStore((s) => s.setAnnotations);

  const mutation = useMutation({
    mutationFn: async ({
      diffText,
      customPrompt,
    }: {
      diffText: string;
      customPrompt?: string;
    }) => {
      const body: AiReviewRequest = {
        diff_text: diffText,
        custom_prompt: customPrompt,
      };
      return apiPost<AiReviewResponse>("/api/review/ai-review", body);
    },
    onSuccess: (data) => {
      const annotations: ReviewAnnotation[] = data.annotations.map((a) => ({
        id: a.id,
        file: a.file,
        line: a.line,
        severity: a.severity as ReviewAnnotation["severity"],
        comment: a.comment,
        selected: false,
      }));
      setAnnotations(annotations);
    },
    onError: (error) => {
      console.error("AI review failed:", error);
    },
  });

  const triggerReview = (diffText: string, customPrompt?: string) => {
    mutation.mutate({ diffText, customPrompt });
  };

  return {
    triggerReview,
    isReviewing: mutation.isPending,
  };
}
