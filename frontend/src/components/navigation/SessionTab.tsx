import { Terminal, Bot, X } from "lucide-react";
import type { TerminalSession, ClaudeStatus } from "../../types";
import { useSessionStore } from "../../stores/sessionStore";

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

  const isActive = activeSessionId === session.id;
  const isClaude = session.session_type === "claude";
  const isWaiting = isClaude && claudeStatus === "waiting";

  // Show repo folder name if available, otherwise "Shell" for shell sessions
  // Only show tmux name if it's human-readable (not auto-generated locus-xxxx)
  const isAutoName = session.tmux_session_name?.startsWith("locus-");
  const label = session.repo_path
    ? session.repo_path.split("/").pop()
    : isClaude
      ? "Claude"
      : isAutoName || !session.tmux_session_name
        ? "Shell"
        : session.tmux_session_name;

  return (
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
      {isWaiting && (
        <span className="h-1.5 w-1.5 rounded-full bg-warning animate-pulse" />
      )}
      <span className="truncate max-w-[120px]">
        {label === "Shell" && totalShells && totalShells > 1
          ? `Shell ${shellIndex}`
          : label}
      </span>
      <span
        role="button"
        tabIndex={0}
        onClick={(e) => {
          e.stopPropagation();
          removeSession(session.id);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.stopPropagation();
            removeSession(session.id);
          }
        }}
        className="ml-1 hidden rounded p-0.5 text-muted hover:bg-hover hover:text-primary-text group-hover:inline-flex"
      >
        <X size={10} />
      </span>
    </button>
  );
}
