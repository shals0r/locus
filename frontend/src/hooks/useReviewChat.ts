import { useState } from "react";
import { apiPost } from "./useApi";
import {
  useReviewStore,
  type ReviewAnnotation,
  type CommentThread,
  type ChatMessage,
} from "../stores/reviewStore";

interface ChatContext {
  diffText: string;
  annotations: ReviewAnnotation[];
  comments: CommentThread[];
  selectedText?: string;
}

interface ChatApiResponse {
  response: string;
}

function buildContextString(ctx: ChatContext): string {
  const parts: string[] = [];

  if (ctx.selectedText) {
    parts.push(`Regarding this code:\n\`\`\`\n${ctx.selectedText}\n\`\`\``);
  }

  if (ctx.diffText) {
    parts.push(`## Diff\n\`\`\`\n${ctx.diffText.slice(0, 8000)}\n\`\`\``);
  }

  if (ctx.annotations.length > 0) {
    const summaries = ctx.annotations
      .map(
        (a) =>
          `- [${a.severity}] ${a.file}:${a.line} - ${a.comment.slice(0, 100)}`,
      )
      .join("\n");
    parts.push(`## Annotations\n${summaries}`);
  }

  if (ctx.comments.length > 0) {
    const summaries = ctx.comments
      .map(
        (c) =>
          `- ${c.author} on ${c.file}:${c.line}: ${c.body.slice(0, 100)}${c.replies.length > 0 ? ` (${c.replies.length} replies)` : ""}`,
      )
      .join("\n");
    parts.push(`## Comments\n${summaries}`);
  }

  return parts.join("\n\n");
}

export function useReviewChat() {
  const [isLoading, setIsLoading] = useState(false);
  const addChatMessage = useReviewStore((s) => s.addChatMessage);
  const chatMessages = useReviewStore((s) => s.reviewChatMessages);

  const sendMessage = async (userMessage: string, context: ChatContext) => {
    setIsLoading(true);

    // Add the user message immediately
    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: userMessage,
      timestamp: Date.now(),
    };
    addChatMessage(userMsg);

    try {
      const contextString = buildContextString(context);

      // Build messages array from conversation history + new message
      const messagesForApi = [
        ...chatMessages.map((m) => ({
          role: m.role,
          content: m.content,
        })),
        { role: "user" as const, content: userMessage },
      ];

      const result = await apiPost<ChatApiResponse>("/api/review/chat", {
        messages: messagesForApi,
        context: contextString,
      });

      // Add the assistant response
      const assistantMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: result.response,
        timestamp: Date.now(),
      };
      addChatMessage(assistantMsg);
    } catch (err) {
      // Add an error message so the user knows
      const errorMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: `Error: ${err instanceof Error ? err.message : "Failed to get response"}`,
        timestamp: Date.now(),
      };
      addChatMessage(errorMsg);
    } finally {
      setIsLoading(false);
    }
  };

  return { sendMessage, isLoading };
}
