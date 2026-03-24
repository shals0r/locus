import { useEffect, useRef } from "react";
import { useMachineStore } from "../../stores/machineStore";
import { useSessionStore } from "../../stores/sessionStore";
import { apiGet } from "../../hooks/useApi";
import type { TerminalSession } from "../../types";
import { MachineTabBar } from "../navigation/MachineTabBar";
import { SessionTabBar } from "../navigation/SessionTabBar";
import { ClaudeOverview } from "../terminal/ClaudeOverview";
import { TerminalView } from "../terminal/TerminalView";

export function CenterPanel() {
  const activeMachineId = useMachineStore((s) => s.activeMachineId);
  const claudeViewActive = useMachineStore((s) => s.claudeViewActive);
  const activeSessionId = useSessionStore((s) => s.activeSessionId);
  const sessions = useSessionStore((s) => s.sessions);
  const setSessions = useSessionStore((s) => s.setSessions);
  const setActiveSession = useSessionStore((s) => s.setActiveSession);

  const fetchedMachinesRef = useRef<Set<string>>(new Set());

  // Fetch sessions only once per machine (not on every tab switch)
  useEffect(() => {
    if (!activeMachineId) return;
    if (fetchedMachinesRef.current.has(activeMachineId)) return;

    fetchedMachinesRef.current.add(activeMachineId);
    apiGet<TerminalSession[]>(`/api/sessions?machine_id=${activeMachineId}`)
      .then((fetchedSessions) => {
        setSessions(fetchedSessions);
        const first = fetchedSessions[0];
        if (first && !activeSessionId) {
          setActiveSession(first.id);
        }
      })
      .catch(() => {});
  }, [activeMachineId, setSessions, setActiveSession, activeSessionId]);

  const machineSessions = sessions.filter(
    (s) => s.machine_id === activeMachineId,
  );

  return (
    <div className="flex h-full flex-col">
      <MachineTabBar />
      {claudeViewActive ? (
        <div className="flex-1 overflow-y-auto">
          <ClaudeOverview />
        </div>
      ) : (
        <>
          <SessionTabBar />
          <div className="relative flex-1 overflow-hidden">
            {!activeMachineId && (
              <div className="flex absolute inset-0 items-center justify-center">
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
            {activeMachineId && machineSessions.length === 0 && (
              <div className="flex absolute inset-0 items-center justify-center text-muted text-xs">
                No session selected. Click &quot;+&quot; to start a terminal session.
              </div>
            )}
            {machineSessions.map((s) => (
              <div
                key={s.id}
                className="absolute inset-0"
                style={{ display: s.id === activeSessionId ? "block" : "none" }}
              >
                <TerminalView
                  sessionId={s.id}
                  isVisible={s.id === activeSessionId}
                />
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
