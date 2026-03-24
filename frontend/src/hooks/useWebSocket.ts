import { useCallback, useEffect, useRef, useState } from "react";

export type WsStatus = "connecting" | "connected" | "disconnected" | "failed";

interface UseWebSocketOptions {
  /** WebSocket binary type. Default "arraybuffer". */
  binaryType?: BinaryType;
  /** Called on each message event. */
  onMessage?: (event: MessageEvent) => void;
  /** Called when connection opens. */
  onOpen?: () => void;
  /** Called when connection closes (before reconnect logic). */
  onClose?: () => void;
}

interface UseWebSocketReturn {
  ws: WebSocket | null;
  status: WsStatus;
  send: (data: string | ArrayBuffer | Uint8Array) => void;
  reconnect: () => void;
  disconnect: () => void;
}

const INITIAL_DELAY = 1000;
const MAX_DELAY = 30000;
const MAX_RETRIES = 10;

/**
 * Reconnecting WebSocket hook with exponential backoff.
 *
 * Auto-reconnects on close/error up to MAX_RETRIES times.
 * After exhaustion, status becomes "failed" and retrying stops.
 * Call reconnect() to manually reset the counter and try again.
 */
export function useWebSocket(
  url: string | null,
  options: UseWebSocketOptions = {},
): UseWebSocketReturn {
  const [status, setStatus] = useState<WsStatus>(url ? "connecting" : "disconnected");
  const wsRef = useRef<WebSocket | null>(null);
  const retriesRef = useRef(0);
  const delayRef = useRef(INITIAL_DELAY);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const intentionalCloseRef = useRef(false);
  // Store options in ref to avoid dependency churn
  const optsRef = useRef(options);
  optsRef.current = options;

  const cleanupWs = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    const ws = wsRef.current;
    if (ws) {
      ws.onopen = null;
      ws.onclose = null;
      ws.onerror = null;
      ws.onmessage = null;
      ws.close();
      wsRef.current = null;
    }
  }, []);

  const send = useCallback((data: string | ArrayBuffer | Uint8Array) => {
    const ws = wsRef.current;
    const ready = ws?.readyState;
    if (ready === WebSocket.OPEN) {
      ws!.send(data);
    } else {
      console.warn("[WS] send dropped: readyState=", ready, "wsExists=", !!ws);
    }
  }, []);

  const disconnect = useCallback(() => {
    intentionalCloseRef.current = true;
    cleanupWs();
    setStatus("disconnected");
  }, [cleanupWs]);

  // The main connect/lifecycle effect — only re-runs when `url` changes
  useEffect(() => {
    if (!url) {
      setStatus("disconnected");
      return;
    }

    let alive = true; // tracks whether this effect instance is still active

    function doConnect() {
      if (!alive || !url) return;

      // Clean previous socket
      if (wsRef.current) {
        wsRef.current.onopen = null;
        wsRef.current.onclose = null;
        wsRef.current.onerror = null;
        wsRef.current.onmessage = null;
        wsRef.current.close();
        wsRef.current = null;
      }

      setStatus("connecting");
      intentionalCloseRef.current = false;

      const ws = new WebSocket(url);
      ws.binaryType = optsRef.current.binaryType ?? "arraybuffer";
      wsRef.current = ws;

      ws.onopen = () => {
        if (!alive) { console.log("[WS] onopen but effect dead, closing"); ws.close(); return; }
        console.log("[WS] CONNECTED to", url);
        retriesRef.current = 0;
        delayRef.current = INITIAL_DELAY;
        setStatus("connected");
        optsRef.current.onOpen?.();
      };

      ws.onmessage = (event) => {
        if (!alive) return;
        optsRef.current.onMessage?.(event);
      };

      ws.onclose = (ev) => {
        if (!alive) return;
        console.log("[WS] CLOSED code=", ev.code, "reason=", ev.reason, "url=", url);
        optsRef.current.onClose?.();

        if (intentionalCloseRef.current) {
          intentionalCloseRef.current = false;
          setStatus("disconnected");
          return;
        }

        if (retriesRef.current >= MAX_RETRIES) {
          setStatus("failed");
          return;
        }

        setStatus("disconnected");
        retriesRef.current += 1;
        const delay = delayRef.current;
        delayRef.current = Math.min(delayRef.current * 2, MAX_DELAY);

        timerRef.current = setTimeout(() => {
          doConnect();
        }, delay);
      };

      ws.onerror = () => {
        // onclose fires after onerror, which handles reconnection
      };
    }

    doConnect();

    return () => {
      alive = false;
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      const ws = wsRef.current;
      if (ws) {
        ws.onopen = null;
        ws.onclose = null;
        ws.onerror = null;
        ws.onmessage = null;
        ws.close();
        wsRef.current = null;
      }
    };
  }, [url]); // Only url — no function deps that cause re-renders

  const reconnect = useCallback(() => {
    // Force a fresh connection by toggling the intentional close then reconnecting
    retriesRef.current = 0;
    delayRef.current = INITIAL_DELAY;
    // Trigger effect re-run by disconnecting and the consumer re-providing the url
    // For now, just do an inline reconnect
    const currentUrl = url;
    if (!currentUrl) return;

    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    const ws = wsRef.current;
    if (ws) {
      ws.onopen = null;
      ws.onclose = null;
      ws.onerror = null;
      ws.onmessage = null;
      ws.close();
      wsRef.current = null;
    }

    setStatus("connecting");
    intentionalCloseRef.current = false;

    const newWs = new WebSocket(currentUrl);
    newWs.binaryType = optsRef.current.binaryType ?? "arraybuffer";
    wsRef.current = newWs;

    newWs.onopen = () => {
      retriesRef.current = 0;
      delayRef.current = INITIAL_DELAY;
      setStatus("connected");
      optsRef.current.onOpen?.();
    };

    newWs.onmessage = (event) => {
      optsRef.current.onMessage?.(event);
    };

    newWs.onclose = () => {
      optsRef.current.onClose?.();
      if (intentionalCloseRef.current) {
        intentionalCloseRef.current = false;
        setStatus("disconnected");
        return;
      }
      if (retriesRef.current >= MAX_RETRIES) {
        setStatus("failed");
        return;
      }
      setStatus("disconnected");
    };

    newWs.onerror = () => {};
  }, [url]);

  return { ws: wsRef.current, status, send, reconnect, disconnect };
}
