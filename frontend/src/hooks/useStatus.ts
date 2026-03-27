import { useCallback, useState } from "react";
import { useMachineStore } from "../stores/machineStore";
import { useClaudeSessionStore } from "../stores/claudeSessionStore";
import { useSessionStore } from "../stores/sessionStore";
import { useWebSocket } from "./useWebSocket";
import { getWsUrl } from "../api/client";
import type { ClaudeSession, MachineStatus } from "../types";

interface ServiceStatus {
  database: string;
  claude_code: string;
}

/**
 * Hook that connects to /ws/status for live machine and Claude Code updates.
 *
 * Uses useWebSocket for automatic reconnection with exponential backoff.
 * Updates machineStore with machine statuses and claudeSessionStore with
 * Claude Code session data. Returns derived service status for top bar.
 */
export function useStatus() {
  const setMachineStatus = useMachineStore((s) => s.setMachineStatus);
  const setSessions = useClaudeSessionStore((s) => s.setSessions);
  const updateSessionDisplayName = useSessionStore(
    (s) => s.updateSessionDisplayName,
  );
  const [serviceStatus, setServiceStatus] = useState<ServiceStatus>({
    database: "connected",
    claude_code: "unconfigured",
  });

  const onMessage = useCallback(
    (event: MessageEvent) => {
      try {
        const msg = JSON.parse(event.data);

        switch (msg.type) {
          case "initial": {
            if (msg.machines) {
              for (const [id, status] of Object.entries(msg.machines)) {
                setMachineStatus(id, status as MachineStatus);
              }
            }
            if (msg.claude_sessions) {
              setSessions(msg.claude_sessions as ClaudeSession[]);
            }
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

          case "session_names": {
            if (msg.updates) {
              for (const u of msg.updates as {
                session_id: string;
                display_name: string;
              }[]) {
                updateSessionDisplayName(u.session_id, u.display_name);
              }
            }
            break;
          }
        }
      } catch {
        // Ignore malformed messages
      }
    },
    [setMachineStatus, setSessions, updateSessionDisplayName],
  );

  useWebSocket(getWsUrl("/ws/status"), { onMessage });

  return { serviceStatus };
}
