import { useRef } from "react";
import "@xterm/xterm/css/xterm.css";
import { useTerminal } from "../../hooks/useTerminal";
import { ConnectionBanner } from "./ConnectionBanner";
import { useMachineStore } from "../../stores/machineStore";
import { useSessionStore } from "../../stores/sessionStore";

/**
 * Full-height terminal component that renders an xterm.js instance
 * connected to a backend SSH session via WebSocket.
 *
 * Overlays a ConnectionBanner when the WebSocket is disconnected or failed.
 */
export function TerminalView({ sessionId }: { sessionId: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const { status, reconnect } = useTerminal(sessionId, containerRef);

  // Resolve machine name for the connection banner
  const sessions = useSessionStore((s) => s.sessions);
  const machines = useMachineStore((s) => s.machines);
  const session = sessions.find((s) => s.id === sessionId);
  const machine = session
    ? machines.find((m) => m.id === session.machine_id)
    : null;
  const machineName = machine?.name ?? "remote machine";

  const showBanner = status === "disconnected" || status === "failed";

  return (
    <div className="relative h-full w-full" style={{ background: "#1a1b26" }}>
      <div ref={containerRef} className="h-full w-full" />
      {showBanner && (
        <ConnectionBanner
          status={status === "failed" ? "failed" : "reconnecting"}
          machineName={machineName}
          onReconnect={reconnect}
        />
      )}
    </div>
  );
}
