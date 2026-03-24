import { useState } from "react";
import { Terminal, Bot, X } from "lucide-react";
import type { TerminalSession, ClaudeStatus } from "../../types";
import { useSessionStore } from "../../stores/sessionStore";
import { apiPatch, apiDelete } from "../../hooks/useApi";
import { CloseSessionDialog } from "../common/CloseSessionDialog";

export function SessionTab({
  session,
  claudeStatus,
  shellIndex,
  totalShells,
}: {
  session: TerminalSession;
  claudeStatus?: ClaudeStatus;
  shellIndex?: number;
  totalShells?: number;
}) {
  const activeSessionId = useSessionStore((s) => s.activeSessionId);
  const setActiveSession = useSessionStore((s) => s.setActiveSession);
  const removeSession = useSessionStore((s) => s.removeSession);
  const [showCloseDialog, setShowCloseDialog] = useState(false);

  const isActive = activeSessionId === session.id;
  const isClaude = session.session_type === "claude";

  // Dynamic display_name (pushed from backend) takes priority
  // Fallback: repo folder name, tmux name, or "Shell"
  const isAutoName = session.tmux_session_name?.startsWith("locus-");
  const fallbackLabel = session.repo_path
    ? session.repo_path.split("/").pop()
    : isClaude
      ? "Claude"
      : isAutoName || !session.tmux_session_name
        ? "Shell"
        : session.tmux_session_name;

  const label = session.display_name || fallbackLabel;
  const displayLabel =
    label === "Shell" && totalShells && totalShells > 1
      ? `Shell ${shellIndex}`
      : label;

  async function handleDetach() {
    setShowCloseDialog(false);
    try {
      await apiPatch(`/api/sessions/${session.id}/detach`);
    } catch (err) {
      console.error("Failed to detach session:", err);
    }
    removeSession(session.id);
  }

  async function handleKill() {
    setShowCloseDialog(false);
    try {
      await apiDelete(`/api/sessions/${session.id}`);
    } catch (err) {
      console.error("Failed to kill session:", err);
    }
    removeSession(session.id);
  }

  // Traffic light status dot
  const statusDot = claudeStatus ? (
    <span
      className={`h-1.5 w-1.5 rounded-full ${
        claudeStatus === "waiting"
          ? "bg-warning animate-pulse"
          : claudeStatus === "running"
            ? "bg-success"
            : "bg-muted"
      }`}
    />
  ) : null;

  return (
    <>
      <button
        onClick={() => setActiveSession(session.id)}
        className={`group flex shrink-0 items-center gap-1.5 px-2 text-xs transition-colors ${
          isActive
            ? "border-b-2 border-accent text-primary-text"
            : "border-b-2 border-transparent text-muted hover:text-primary-text"
        }`}
        style={{ height: "32px" }}
      >
        {isClaude ? (
          <Bot size={12} className="shrink-0" />
        ) : (
          <Terminal size={12} className="shrink-0" />
        )}
        {statusDot}
        <span className="truncate max-w-[120px]">{displayLabel}</span>
        <span
          role="button"
          tabIndex={0}
          onClick={(e) => {
            e.stopPropagation();
            setShowCloseDialog(true);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.stopPropagation();
              setShowCloseDialog(true);
            }
          }}
          className="ml-1 hidden rounded p-0.5 text-muted hover:bg-hover hover:text-primary-text group-hover:inline-flex"
        >
          <X size={10} />
        </span>
      </button>
      <CloseSessionDialog
        open={showCloseDialog}
        sessionName={displayLabel ?? session.tmux_session_name ?? "session"}
        onDetach={handleDetach}
        onKill={handleKill}
        onCancel={() => setShowCloseDialog(false)}
      />
    </>
  );
}
