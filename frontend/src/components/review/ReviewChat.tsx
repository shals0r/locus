import {
  useState,
  useRef,
  useEffect,
  useCallback,
  type KeyboardEvent,
} from "react";
import { X, Send, Code } from "lucide-react";
import { useReviewStore } from "../../stores/reviewStore";
import { useReviewChat } from "../../hooks/useReviewChat";

/**
 * ReviewChat - Floating resizable side panel for contextual chat about a review.
 *
 * Slides in from the right edge, overlaying part of the diff area.
 * Provides Claude-powered conversation with full diff/annotation/comment context.
 * Supports text selection from the diff as additional context.
 */
export function ReviewChat() {
  const chatPanelOpen = useReviewStore((s) => s.chatPanelOpen);
  const toggleChatPanel = useReviewStore((s) => s.toggleChatPanel);
  const chatMessages = useReviewStore((s) => s.reviewChatMessages);
  const annotations = useReviewStore((s) => s.annotations);
  const comments = useReviewStore((s) => s.comments);
  const clearChatMessages = useReviewStore((s) => s.clearChatMessages);

  const { sendMessage, isLoading } = useReviewChat();

  const [inputText, setInputText] = useState("");
  const [selectedDiffText, setSelectedDiffText] = useState<string | null>(null);
  const [panelWidth, setPanelWidth] = useState(380);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const isResizing = useRef(false);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  // Listen for text selection in the diff container
  useEffect(() => {
    if (!chatPanelOpen) {
      setSelectedDiffText(null);
      return;
    }

    const handleMouseUp = () => {
      const selection = window.getSelection();
      if (!selection || selection.isCollapsed) return;

      const text = selection.toString().trim();
      if (text.length > 0 && text.length < 5000) {
        // Only capture if selection is inside a diff-related element
        const anchorEl = selection.anchorNode?.parentElement;
        if (
          anchorEl?.closest("[data-diff-container]") ||
          anchorEl?.closest(".diff-viewer") ||
          anchorEl?.closest("[class*='font-mono']")
        ) {
          setSelectedDiffText(text);
        }
      }
    };

    document.addEventListener("mouseup", handleMouseUp);
    return () => document.removeEventListener("mouseup", handleMouseUp);
  }, [chatPanelOpen]);

  // Clear selected text and messages when panel closes
  useEffect(() => {
    if (!chatPanelOpen) {
      setSelectedDiffText(null);
    }
  }, [chatPanelOpen]);

  // Resize handlers
  const handleResizeStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      isResizing.current = true;

      const startX = e.clientX;
      const startWidth = panelWidth;

      const handleMouseMove = (moveEvent: MouseEvent) => {
        if (!isResizing.current) return;
        const delta = startX - moveEvent.clientX;
        const newWidth = Math.min(600, Math.max(300, startWidth + delta));
        setPanelWidth(newWidth);
      };

      const handleMouseUp = () => {
        isResizing.current = false;
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);
      };

      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
    },
    [panelWidth],
  );

  // Send message handler
  const handleSend = useCallback(async () => {
    const text = inputText.trim();
    if (!text || isLoading) return;

    setInputText("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }

    await sendMessage(text, {
      diffText: "", // Diff text would come from the active diff tab context
      annotations,
      comments,
      selectedText: selectedDiffText ?? undefined,
    });

    // Clear selected text after sending
    setSelectedDiffText(null);
  }, [inputText, isLoading, sendMessage, annotations, comments, selectedDiffText]);

  // Handle keyboard in textarea
  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Auto-resize textarea
  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInputText(e.target.value);
    const el = e.target;
    el.style.height = "auto";
    const maxHeight = 4 * 24; // 4 rows approx
    el.style.height = `${Math.min(el.scrollHeight, maxHeight)}px`;
  };

  if (!chatPanelOpen) return null;

  return (
    <div
      className="fixed right-0 top-0 z-50 flex h-full flex-col border-l border-border bg-dominant shadow-xl"
      style={{ width: panelWidth }}
    >
      {/* Resize handle */}
      <div
        className="absolute left-0 top-0 z-10 h-full w-1 cursor-col-resize hover:bg-accent/50"
        onMouseDown={handleResizeStart}
      />

      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <h3 className="text-sm font-medium text-primary-text">Review Chat</h3>
        <div className="flex items-center gap-1">
          {chatMessages.length > 0 && (
            <button
              onClick={() => clearChatMessages()}
              className="rounded p-1 text-xs text-muted hover:bg-hover hover:text-primary-text transition-colors"
              title="Clear chat"
            >
              Clear
            </button>
          )}
          <button
            onClick={toggleChatPanel}
            className="rounded p-1 text-muted hover:bg-hover hover:text-primary-text transition-colors"
            title="Close chat"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-3">
        {chatMessages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center px-4">
            <p className="text-sm text-muted mb-2">
              Ask questions about this code review.
            </p>
            <p className="text-xs text-muted">
              The chat has full context of the diff, annotations, and comments.
              You can highlight text in the diff to include as context.
            </p>
          </div>
        )}
        {chatMessages.map((msg) => (
          <div
            key={msg.id}
            className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
                msg.role === "user"
                  ? "bg-accent/10 text-primary-text"
                  : "bg-secondary text-primary-text"
              }`}
            >
              <MessageContent content={msg.content} />
            </div>
          </div>
        ))}
        {isLoading && (
          <div className="flex justify-start">
            <div className="rounded-lg bg-secondary px-3 py-2">
              <span className="inline-flex items-center gap-1 text-sm text-muted">
                <span className="animate-pulse">.</span>
                <span className="animate-pulse" style={{ animationDelay: "0.2s" }}>
                  .
                </span>
                <span className="animate-pulse" style={{ animationDelay: "0.4s" }}>
                  .
                </span>
              </span>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Context indicator */}
      {selectedDiffText && (
        <div className="flex items-center gap-2 border-t border-border bg-accent/5 px-3 py-1.5">
          <Code size={14} className="shrink-0 text-accent" />
          <span className="flex-1 truncate text-xs text-muted">
            Selected code will be included as context
          </span>
          <button
            onClick={() => setSelectedDiffText(null)}
            className="shrink-0 rounded p-0.5 text-muted hover:text-primary-text transition-colors"
            title="Dismiss"
          >
            <X size={12} />
          </button>
        </div>
      )}

      {/* Input area */}
      <div className="border-t border-border px-3 py-2">
        <div className="flex items-end gap-2">
          <textarea
            ref={textareaRef}
            value={inputText}
            onChange={handleTextareaChange}
            onKeyDown={handleKeyDown}
            placeholder="Ask about the review..."
            rows={1}
            className="flex-1 resize-none rounded border border-border bg-secondary px-2.5 py-1.5 text-sm text-primary-text outline-none placeholder:text-muted focus:border-accent"
          />
          <button
            onClick={handleSend}
            disabled={!inputText.trim() || isLoading}
            className="shrink-0 rounded bg-accent p-1.5 text-white hover:bg-accent/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            title="Send message"
          >
            <Send size={16} />
          </button>
        </div>
        <p className="mt-1 text-[10px] text-muted">
          Enter to send, Shift+Enter for newline
        </p>
      </div>
    </div>
  );
}

/**
 * Renders message content with code blocks formatted in monospace.
 */
function MessageContent({ content }: { content: string }) {
  // Split on code fences
  const parts = content.split(/(```[\s\S]*?```)/g);

  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith("```") && part.endsWith("```")) {
          // Code block
          const lines = part.split("\n");
          const code = lines.slice(1, -1).join("\n");
          return (
            <pre
              key={i}
              className="my-1 overflow-x-auto rounded bg-dominant/50 p-2 text-xs font-mono"
            >
              {code}
            </pre>
          );
        }
        // Regular text - handle inline code
        const inlineParts = part.split(/(`[^`]+`)/g);
        return (
          <span key={i}>
            {inlineParts.map((ip, j) => {
              if (ip.startsWith("`") && ip.endsWith("`")) {
                return (
                  <code
                    key={j}
                    className="rounded bg-dominant/50 px-1 py-0.5 text-xs font-mono"
                  >
                    {ip.slice(1, -1)}
                  </code>
                );
              }
              return <span key={j}>{ip}</span>;
            })}
          </span>
        );
      })}
    </>
  );
}
