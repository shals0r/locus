import { useEffect } from "react";
import { useMachineStore } from "../../stores/machineStore";
import { useSessionStore } from "../../stores/sessionStore";
import { apiGet } from "../../hooks/useApi";
import type { TerminalSession } from "../../types";
import { MachineTabBar } from "../navigation/MachineTabBar";
import { SessionTabBar } from "../navigation/SessionTabBar";
import { TerminalView } from "../terminal/TerminalView";

export function CenterPanel() {
  const activeMachineId = useMachineStore((s) => s.activeMachineId);
  const activeSessionId = useSessionStore((s) => s.activeSessionId);
  const setSessions = useSessionStore((s) => s.setSessions);
  const setActiveSession = useSessionStore((s) => s.setActiveSession);

  // Fetch sessions when active machine changes
  useEffect(() => {
    if (!activeMachineId) return;
    apiGet<TerminalSession[]>(`/api/sessions?machine_id=${activeMachineId}`)
      .then((sessions) => {
        setSessions(sessions);
        if (sessions.length > 0 && !sessions.find((s) => s.id === activeSessionId)) {
          setActiveSession(sessions[0].id);
        }
      })
      .catch(() => {});
  }, [activeMachineId, setSessions, setActiveSession]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="flex h-full flex-col">
      <MachineTabBar />
      <SessionTabBar />
      <div className="flex flex-1 overflow-hidden">
        {!activeMachineId && (
          <div className="flex flex-1 items-center justify-center">
            <div className="text-center">
              <h3 className="text-sm font-semibold text-primary-text">
                No active sessions
              </h3>
              <p className="mt-1 text-xs text-muted">
                Select a machine from the sidebar, or add a new one to open a
                terminal.
              </p>
            </div>
          </div>
        )}
        {activeMachineId && activeSessionId && (
          <TerminalView sessionId={activeSessionId} />
        )}
        {activeMachineId && !activeSessionId && (
          <div className="flex flex-1 items-center justify-center text-muted text-xs">
            No session selected. Click &quot;+&quot; to start a terminal session.
          </div>
        )}
      </div>
    </div>
  );
}
