import { useEffect, useRef, useState } from "react";
import { getWsUrl } from "../api/client";
import { useMachineStore } from "../stores/machineStore";
import { useClaudeSessionStore } from "../stores/claudeSessionStore";
import type { ClaudeSession, MachineStatus } from "../types";

interface ServiceStatus {
  database: string;
  claude_code: string;
}

/**
 * Hook that connects to /ws/status for live machine and Claude Code updates.
 *
 * Updates machineStore with machine statuses and claudeSessionStore with
 * Claude Code session data. Returns derived service status for top bar.
 */
export function useStatus() {
  const setMachineStatus = useMachineStore((s) => s.setMachineStatus);
  const setSessions = useClaudeSessionStore((s) => s.setSessions);
  const [serviceStatus, setServiceStatus] = useState<ServiceStatus>({
    database: "connected",
    claude_code: "unconfigured",
  });
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    const url = getWsUrl("/ws/status");
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);

        switch (msg.type) {
          case "initial": {
            // Set machine statuses
            if (msg.machines) {
              for (const [id, status] of Object.entries(msg.machines)) {
                setMachineStatus(id, status as MachineStatus);
              }
            }
            // Set Claude sessions
            if (msg.claude_sessions) {
              setSessions(msg.claude_sessions as ClaudeSession[]);
            }
            // Set service status
            if (msg.services) {
              setServiceStatus(msg.services);
            }
            break;
          }

          case "machine_status": {
            setMachineStatus(msg.machine_id, msg.status as MachineStatus);
            break;
          }

          case "claude_sessions": {
            if (msg.sessions) {
              setSessions(msg.sessions as ClaudeSession[]);
            }
            break;
          }
        }
      } catch {
        // Ignore malformed messages
      }
    };

    return () => {
      ws.close();
      wsRef.current = null;
    };
  }, [setMachineStatus, setSessions]);

  return { serviceStatus };
}
