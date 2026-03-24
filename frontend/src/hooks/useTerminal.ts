import { useEffect, useRef, useCallback, type RefObject } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { getWsUrl } from "../api/client";
import { useWebSocket, type WsStatus } from "./useWebSocket";

/**
 * Tokyo Night color theme for xterm.js.
 */
const TOKYO_NIGHT_THEME = {
  background: "#1a1b26",
  foreground: "#c0caf5",
  cursor: "#c0caf5",
  selectionBackground: "#33467c",
  black: "#15161e",
  red: "#f7768e",
  green: "#9ece6a",
  yellow: "#e0af68",
  blue: "#7aa2f7",
  magenta: "#bb9af7",
  cyan: "#7dcfff",
  white: "#a9b1d6",
  brightBlack: "#414868",
  brightRed: "#f7768e",
  brightGreen: "#9ece6a",
  brightYellow: "#e0af68",
  brightBlue: "#7aa2f7",
  brightMagenta: "#bb9af7",
  brightCyan: "#7dcfff",
  brightWhite: "#c0caf5",
};

interface UseTerminalReturn {
  status: WsStatus;
  reconnect: () => void;
}

/**
 * Hook that manages xterm.js lifecycle: terminal instance, WebSocket I/O,
 * fit addon for resize, and debounced resize propagation to the backend.
 *
 * Does NOT use @xterm/addon-attach -- uses a custom binary WebSocket handler
 * per RESEARCH.md recommendation for binary transparency.
 */
export function useTerminal(
  sessionId: string | null,
  containerRef: RefObject<HTMLDivElement | null>,
): UseTerminalReturn {
  const termRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const resizeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const encoder = useRef(new TextEncoder());

  const wsUrl = sessionId ? getWsUrl(`/ws/terminal/${sessionId}`) : null;

  const handleMessage = useCallback((event: MessageEvent) => {
    const term = termRef.current;
    if (!term) return;

    if (event.data instanceof ArrayBuffer) {
      term.write(new Uint8Array(event.data));
    } else if (typeof event.data === "string") {
      // JSON control messages from backend
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === "error") {
          term.write(`\r\n\x1b[31m${msg.message}\x1b[0m\r\n`);
        }
      } catch {
        // Not JSON, write as text
        term.write(event.data);
      }
    }
  }, []);

  const { status, send, reconnect } = useWebSocket(wsUrl, {
    binaryType: "arraybuffer",
    onMessage: handleMessage,
  });

  // Create and mount terminal
  useEffect(() => {
    const container = containerRef.current;
    if (!container || !sessionId) return;

    const term = new Terminal({
      cursorBlink: true,
      fontFamily: "JetBrains Mono, monospace",
      fontSize: 14,
      lineHeight: 1.2,
      theme: TOKYO_NIGHT_THEME,
    });

    const fitAddon = new FitAddon();
    const webLinksAddon = new WebLinksAddon();

    term.loadAddon(fitAddon);
    term.loadAddon(webLinksAddon);

    term.open(container);

    // Initial fit after a frame to let the DOM settle
    requestAnimationFrame(() => {
      fitAddon.fit();
    });

    termRef.current = term;
    fitAddonRef.current = fitAddon;

    return () => {
      if (resizeTimerRef.current) {
        clearTimeout(resizeTimerRef.current);
        resizeTimerRef.current = null;
      }
      if (resizeObserverRef.current) {
        resizeObserverRef.current.disconnect();
        resizeObserverRef.current = null;
      }
      term.dispose();
      termRef.current = null;
      fitAddonRef.current = null;
    };
  }, [sessionId, containerRef]);

  // Wire up terminal data -> WebSocket (send user input)
  useEffect(() => {
    const term = termRef.current;
    if (!term) return;

    const disposable = term.onData((data: string) => {
      send(encoder.current.encode(data));
    });

    return () => disposable.dispose();
  }, [sessionId, send]);

  // Wire up terminal resize -> debounced WebSocket message
  useEffect(() => {
    const term = termRef.current;
    if (!term) return;

    const disposable = term.onResize(({ cols, rows }) => {
      if (resizeTimerRef.current) {
        clearTimeout(resizeTimerRef.current);
      }
      resizeTimerRef.current = setTimeout(() => {
        send(JSON.stringify({ type: "resize", cols, rows }));
      }, 150);
    });

    return () => disposable.dispose();
  }, [sessionId, send]);

  // ResizeObserver on container -> fitAddon.fit() for panel resize handling
  useEffect(() => {
    const container = containerRef.current;
    const fitAddon = fitAddonRef.current;
    if (!container || !fitAddon) return;

    const observer = new ResizeObserver(() => {
      try {
        fitAddon.fit();
      } catch {
        // Terminal may not be ready yet
      }
    });
    observer.observe(container);
    resizeObserverRef.current = observer;

    return () => {
      observer.disconnect();
      resizeObserverRef.current = null;
    };
  }, [sessionId, containerRef]);

  return { status, reconnect };
}
