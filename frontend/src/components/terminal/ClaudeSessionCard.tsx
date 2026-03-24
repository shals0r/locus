import type { ClaudeSession } from "../../types";
import { useMachineStore } from "../../stores/machineStore";
import { useSessionStore } from "../../stores/sessionStore";

const statusConfig = {
  idle: {
    color: "bg-muted",
    label: "Idle",
    pulse: false,
  },
  running: {
    color: "bg-success",
    label: "Running",
    pulse: false,
  },
  waiting: {
    color: "bg-warning",
    label: "Waiting for input",
    pulse: true,
  },
} as const;

function formatRelativeTime(timestamp: number): string {
  const diff = Math.floor((Date.now() - timestamp * 1000) / 1000);
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

/**
 * Card showing a single Claude Code session with status indicator.
 * Click to jump to that session's terminal tab.
 */
export function ClaudeSessionCard({ session }: { session: ClaudeSession }) {
  const machines = useMachineStore((s) => s.machines);
  const setActiveMachine = useMachineStore((s) => s.setActiveMachine);
  const setActiveSession = useSessionStore((s) => s.setActiveSession);

  const machine = machines.find((m) => m.id === session.machine_id);
  const machineName = machine?.name ?? session.machine_name;
  const config = statusConfig[session.status];

  const handleClick = () => {
    setActiveMachine(session.machine_id);
    // Try to find a matching terminal session to activate
    const sessions = useSessionStore.getState().sessions;
    const match = sessions.find(
      (s) =>
        s.machine_id === session.machine_id &&
        s.tmux_session_name === session.tmux_session,
    );
    if (match) {
      setActiveSession(match.id);
    }
  };

  return (
    <button
      onClick={handleClick}
      className="flex w-full items-center gap-3 rounded px-3 py-2.5 text-left hover:bg-hover transition-colors"
    >
      {/* Status dot */}
      <span
        className={`h-2.5 w-2.5 shrink-0 rounded-full ${config.color} ${config.pulse ? "animate-pulse" : ""}`}
      />

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-primary-text truncate">
            {session.window_name || session.tmux_session}
          </span>
          <span className="text-xs text-muted shrink-0">{config.label}</span>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted">
          <span className="truncate">{machineName}</span>
          {session.repo_path && (
            <>
              <span className="shrink-0">-</span>
              <span className="truncate">{session.repo_path}</span>
            </>
          )}
        </div>
      </div>

      {/* Time */}
      {session.last_activity > 0 && (
        <span className="text-xs text-muted shrink-0">
          {formatRelativeTime(session.last_activity)}
        </span>
      )}
    </button>
  );
}
