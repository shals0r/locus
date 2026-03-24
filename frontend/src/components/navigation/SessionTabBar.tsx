import { Plus } from "lucide-react";
import { useMachineStore } from "../../stores/machineStore";
import { useSessionStore } from "../../stores/sessionStore";
import { SessionTab } from "./SessionTab";

export function SessionTabBar() {
  const activeMachineId = useMachineStore((s) => s.activeMachineId);
  const getSessionsForMachine = useSessionStore((s) => s.getSessionsForMachine);

  if (!activeMachineId) return null;

  const sessions = getSessionsForMachine(activeMachineId);

  return (
    <div className="flex h-8 shrink-0 items-stretch bg-dominant border-b border-border overflow-x-auto">
      {sessions.map((session) => (
        <SessionTab key={session.id} session={session} />
      ))}
      <button
        className="flex shrink-0 items-center px-2 text-muted hover:text-primary-text transition-colors"
        aria-label="New session"
      >
        <Plus size={12} />
      </button>
    </div>
  );
}
