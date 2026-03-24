import { useState } from "react";
import { Plus } from "lucide-react";
import { useMachineStore } from "../../stores/machineStore";
import { useSessionStore } from "../../stores/sessionStore";
import { apiPost } from "../../hooks/useApi";
import type { TerminalSession } from "../../types";
import { SessionTab } from "./SessionTab";

export function SessionTabBar() {
  const activeMachineId = useMachineStore((s) => s.activeMachineId);
  const getSessionsForMachine = useSessionStore((s) => s.getSessionsForMachine);
  const addSession = useSessionStore((s) => s.addSession);
  const setActiveSession = useSessionStore((s) => s.setActiveSession);
  const [creating, setCreating] = useState(false);

  if (!activeMachineId) return null;

  const sessions = getSessionsForMachine(activeMachineId);

  async function handleNewSession() {
    if (!activeMachineId || creating) return;
    setCreating(true);
    try {
      const session = await apiPost<TerminalSession>("/api/sessions", {
        machine_id: activeMachineId,
        session_type: "shell",
      });
      addSession(session);
      setActiveSession(session.id);
    } catch (err) {
      console.error("Failed to create session:", err);
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="flex h-8 shrink-0 items-stretch bg-dominant border-b border-border overflow-x-auto">
      {sessions.map((session) => (
        <SessionTab key={session.id} session={session} />
      ))}
      <button
        onClick={handleNewSession}
        disabled={creating}
        className="flex shrink-0 items-center px-2 text-muted hover:text-primary-text transition-colors disabled:opacity-50"
        aria-label="New session"
      >
        <Plus size={12} />
      </button>
    </div>
  );
}
