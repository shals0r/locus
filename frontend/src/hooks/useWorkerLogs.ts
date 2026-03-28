import { useEffect, useRef, useState, useCallback } from "react";
import { getWsUrl } from "../api/client";
import { apiGet } from "./useApi";

interface UseWorkerLogsOptions {
  workerId: string;
  enabled: boolean;
}

interface UseWorkerLogsReturn {
  lines: string[];
  connected: boolean;
  loadMore: () => void;
}

interface WsMessage {
  type: "initial" | "log" | "ping";
  lines?: string[];
  line?: string;
}

const MAX_LINES = 500;

export function useWorkerLogs({
  workerId,
  enabled,
}: UseWorkerLogsOptions): UseWorkerLogsReturn {
  const [lines, setLines] = useState<string[]>([]);
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (!enabled || !workerId) {
      // Close existing connection when disabled
      if (wsRef.current) {
        wsRef.current.onopen = null;
        wsRef.current.onclose = null;
        wsRef.current.onerror = null;
        wsRef.current.onmessage = null;
        wsRef.current.close();
        wsRef.current = null;
      }
      setConnected(false);
      return;
    }

    const url = getWsUrl(`/ws/workers/${workerId}/logs`);
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
    };

    ws.onmessage = (event) => {
      try {
        const msg: WsMessage = JSON.parse(event.data);

        if (msg.type === "initial" && msg.lines) {
          setLines(msg.lines.slice(-MAX_LINES));
        } else if (msg.type === "log" && msg.line) {
          setLines((prev) => {
            const next = [...prev, msg.line!];
            return next.length > MAX_LINES ? next.slice(-MAX_LINES) : next;
          });
        }
        // "ping" messages are ignored (keepalive)
      } catch {
        // Ignore malformed messages
      }
    };

    ws.onclose = () => {
      setConnected(false);
    };

    ws.onerror = () => {
      // onclose fires after onerror
    };

    return () => {
      ws.onopen = null;
      ws.onclose = null;
      ws.onerror = null;
      ws.onmessage = null;
      ws.close();
      wsRef.current = null;
    };
  }, [workerId, enabled]);

  const loadMore = useCallback(async () => {
    try {
      const data = await apiGet<{ lines: string[] }>(
        `/api/workers/${workerId}/logs?offset=${lines.length}&limit=100`,
      );
      if (data.lines && data.lines.length > 0) {
        setLines((prev) => [...data.lines, ...prev]);
      }
    } catch {
      // Silently fail on load more
    }
  }, [workerId, lines.length]);

  return { lines, connected, loadMore };
}
