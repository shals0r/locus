import { useClaudeSessionStore } from "../../stores/claudeSessionStore";
import { ClaudeSessionCard } from "./ClaudeSessionCard";

/**
 * Overview panel showing all active Claude Code sessions across all machines.
 * Displays a feed-style list of ClaudeSessionCards with an empty state.
 */
export function ClaudeOverview() {
  const claudeSessions = useClaudeSessionStore((s) => s.claudeSessions);

  if (claudeSessions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center px-4 py-12 text-center">
        <h3 className="text-sm font-semibold text-primary-text">
          No Claude Code sessions
        </h3>
        <p className="mt-1 text-xs text-muted max-w-[280px]">
          Claude Code sessions will appear here when running on any connected
          machine.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col overflow-y-auto">
      <div className="px-3 py-2 text-xs font-medium text-muted uppercase tracking-wide">
        Claude Code Sessions ({claudeSessions.length})
      </div>
      <div className="flex flex-col">
        {claudeSessions.map((session) => (
          <ClaudeSessionCard
            key={`${session.machine_id}-${session.tmux_session}-${session.window_index}`}
            session={session}
          />
        ))}
      </div>
    </div>
  );
}
