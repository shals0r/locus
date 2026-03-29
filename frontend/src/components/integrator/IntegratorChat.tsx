import {
  useState,
  useRef,
  useEffect,
  useCallback,
  type KeyboardEvent,
} from "react";
import { Wrench, X, Send, Monitor } from "lucide-react";
import { useIntegratorStore } from "../../stores/integratorStore";
import { useIntegratorChat } from "../../hooks/useIntegratorChat";
import { IntegratorMessage } from "./IntegratorMessage";

/**
 * IntegratorChat - Fixed right-edge side panel for building integrations
 * through Claude Code CLI.
 *
 * Slides in from the right, overlaying part of the page. Provides a chat
 * interface with structured cards for config steps, test results, and
 * deploy actions.
 *
 * Follows ReviewChat.tsx layout pattern.
 */
export function IntegratorChat() {
  const isOpen = useIntegratorStore((s) => s.isOpen);
  const close = useIntegratorStore((s) => s.close);
  const messages = useIntegratorStore((s) => s.messages);
  const machineId = useIntegratorStore((s) => s.machineId);
  const credentialSaved = useIntegratorStore((s) => s.credentialSaved);
  const loading = useIntegratorStore((s) => s.loading);

  const { send, messagesEndRef } = useIntegratorChat();

  const [inputText, setInputText] = useState("");
  const [panelWidth, setPanelWidth] = useState(420);
  const [animateIn, setAnimateIn] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const isResizing = useRef(false);

  // Slide-in animation
  useEffect(() => {
    if (isOpen) {
      // Trigger animation on next frame
      requestAnimationFrame(() => setAnimateIn(true));
    } else {
      setAnimateIn(false);
    }
  }, [isOpen]);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, messagesEndRef]);

  // Escape key to close
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, close]);

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
        const newWidth = Math.min(640, Math.max(320, startWidth + delta));
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

  // Double-click resize handle to reset width
  const handleResizeDoubleClick = useCallback(() => {
    setPanelWidth(420);
  }, []);

  // Send message handler
  const handleSend = useCallback(async () => {
    const text = inputText.trim();
    if (!text || loading || !machineId) return;

    setInputText("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }

    await send(text);
  }, [inputText, loading, machineId, send]);

  // Keyboard in textarea
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
    const maxHeight = 4 * 24;
    el.style.height = `${Math.min(el.scrollHeight, maxHeight)}px`;
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed right-0 top-0 z-50 flex h-full flex-col border-l border-border bg-dominant shadow-xl transition-transform duration-300 ease-out"
      style={{
        width: panelWidth,
        transform: animateIn ? "translateX(0)" : "translateX(100%)",
      }}
    >
      {/* Resize handle */}
      <div
        className="absolute left-0 top-0 z-10 h-full w-1 cursor-col-resize hover:bg-accent/50"
        style={{ paddingLeft: 12, marginLeft: -6 }}
        onMouseDown={handleResizeStart}
        onDoubleClick={handleResizeDoubleClick}
      />

      {/* Header - 48px */}
      <div className="flex h-12 shrink-0 items-center justify-between border-b border-border px-3">
        <div className="flex items-center gap-2">
          <Wrench size={16} className="text-muted" />
          <h3 className="text-sm font-semibold text-primary-text">
            Integrator
          </h3>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1">
            <Monitor size={14} className="text-muted" />
            <span className="text-xs text-muted">This Machine</span>
          </div>

          <button
            onClick={close}
            className="rounded p-1 text-muted transition-colors hover:bg-hover hover:text-primary-text"
            title="Close"
            aria-label="Close Integrator"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      {/* Messages area */}
      <div
        className="flex-1 overflow-y-auto px-3 py-2 space-y-3"
        role="log"
        aria-live="polite"
      >
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center px-4">
            <Wrench size={32} className="mb-3 text-muted" />
            <p className="text-sm font-medium text-primary-text mb-1">
              Build an integration
            </p>
            <p className="text-xs text-muted">
              Describe what service you want to connect. Claude will write a
              worker, test it against the live API, and deploy it.
            </p>
          </div>
        )}

        {messages.map((msg) => (
          <IntegratorMessage key={msg.id} message={msg} />
        ))}

        {loading && (
          <div className="flex justify-start">
            <div className="rounded-lg bg-secondary px-3 py-2">
              <span className="inline-flex items-center gap-1 text-sm text-muted">
                <span className="animate-pulse">.</span>
                <span
                  className="animate-pulse"
                  style={{ animationDelay: "0.2s" }}
                >
                  .
                </span>
                <span
                  className="animate-pulse"
                  style={{ animationDelay: "0.4s" }}
                >
                  .
                </span>
              </span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Credential feedback bar */}
      {credentialSaved && (
        <div className="flex h-9 items-center border-t border-border px-3">
          <span className="text-xs text-success">
            Credentials saved securely -- Claude never sees your credentials.
          </span>
        </div>
      )}

      {/* Input area */}
      <div className="border-t border-border p-4">
        <div className="flex items-end gap-2">
          <textarea
            ref={textareaRef}
            value={inputText}
            onChange={handleTextareaChange}
            onKeyDown={handleKeyDown}
            placeholder="Describe what to connect..."
            rows={1}
            disabled={loading || !machineId}
            className="flex-1 resize-none rounded border border-border bg-secondary px-2.5 py-1.5 text-sm text-primary-text outline-none placeholder:text-muted focus:border-accent disabled:cursor-not-allowed disabled:opacity-50"
          />
          <button
            onClick={handleSend}
            disabled={!inputText.trim() || loading || !machineId}
            className="shrink-0 rounded bg-accent p-1.5 text-white transition-colors hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-50"
            title="Send message"
            aria-label="Send message"
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
