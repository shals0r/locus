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
  const [status, setStatus] = useState<WsStatus>("connecting");
  const wsRef = useRef<WebSocket | null>(null);
  const retriesRef = useRef(0);
  const delayRef = useRef(INITIAL_DELAY);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const unmountedRef = useRef(false);
  const urlRef = useRef(url);
  const optsRef = useRef(options);

  // Keep refs in sync
  urlRef.current = url;
  optsRef.current = options;

  const cleanup = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (wsRef.current) {
      wsRef.current.onopen = null;
      wsRef.current.onclose = null;
      wsRef.current.onerror = null;
      wsRef.current.onmessage = null;
      wsRef.current.close();
      wsRef.current = null;
    }
  }, []);

  const connect = useCallback(() => {
    const currentUrl = urlRef.current;
    if (!currentUrl || unmountedRef.current) return;

    cleanup();
    setStatus("connecting");

    const ws = new WebSocket(currentUrl);
    ws.binaryType = optsRef.current.binaryType ?? "arraybuffer";
    wsRef.current = ws;

    ws.onopen = () => {
      if (unmountedRef.current) return;
      retriesRef.current = 0;
      delayRef.current = INITIAL_DELAY;
      setStatus("connected");
      optsRef.current.onOpen?.();
    };

    ws.onmessage = (event) => {
      if (unmountedRef.current) return;
      optsRef.current.onMessage?.(event);
    };

    ws.onclose = () => {
      if (unmountedRef.current) return;
      optsRef.current.onClose?.();

      if (retriesRef.current >= MAX_RETRIES) {
        setStatus("failed");
        return;
      }

      setStatus("disconnected");
      retriesRef.current += 1;
      const delay = delayRef.current;
      delayRef.current = Math.min(delayRef.current * 2, MAX_DELAY);

      timerRef.current = setTimeout(() => {
        if (!unmountedRef.current) {
          connect();
        }
      }, delay);
    };

    ws.onerror = () => {
      // The close event will fire after this, which handles reconnection
    };
  }, [cleanup]);

  const send = useCallback((data: string | ArrayBuffer | Uint8Array) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(data);
    }
  }, []);

  const reconnect = useCallback(() => {
    retriesRef.current = 0;
    delayRef.current = INITIAL_DELAY;
    connect();
  }, [connect]);

  useEffect(() => {
    unmountedRef.current = false;
    if (url) {
      connect();
    }
    return () => {
      unmountedRef.current = true;
      cleanup();
    };
  }, [url, connect, cleanup]);

  return { ws: wsRef.current, status, send, reconnect };
}
