import { useEffect, useRef, useState } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { getWsUrl } from "../api/client";

export type WsStatus = "connecting" | "connected" | "disconnected" | "failed";

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
 * Self-contained terminal hook. Creates xterm.js instance, WebSocket,
 * and wires all I/O in a single effect to avoid React StrictMode ref races.
 */
export function useTerminal(
  sessionId: string | null,
  containerRef: React.RefObject<HTMLDivElement | null>,
  isVisible: boolean = true,
): UseTerminalReturn {
  const [status, setStatus] = useState<WsStatus>("disconnected");
  const reconnectRef = useRef(0); // bump to force reconnect

  // Single effect that owns: terminal + websocket + all wiring
  useEffect(() => {
    const container = containerRef.current;
    if (!container || !sessionId || !isVisible) return;

    const url = getWsUrl(`/ws/terminal/${sessionId}`);
    const encoder = new TextEncoder();
    let ws: WebSocket | null = null;
    let resizeTimer: ReturnType<typeof setTimeout> | null = null;
    let alive = true;

    // 1. Create terminal
    const term = new Terminal({
      cursorBlink: true,
      fontFamily: "JetBrains Mono, monospace",
      fontSize: 14,
      lineHeight: 1.2,
      theme: TOKYO_NIGHT_THEME,
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.loadAddon(new WebLinksAddon());
    term.open(container);

    // 2. Create WebSocket
    ws = new WebSocket(url);
    ws.binaryType = "arraybuffer";
    setStatus("connecting");

    ws.onopen = () => {
      if (!alive) return;
      console.log("[TERM] WS open for", sessionId);
      setStatus("connected");
      // Fit now that connection is live — sends initial resize
      requestAnimationFrame(() => {
        if (alive) {
          try { fitAddon.fit(); } catch {}
        }
      });
    };

    ws.onmessage = (event) => {
      if (!alive) return;
      if (event.data instanceof ArrayBuffer) {
        term.write(new Uint8Array(event.data));
      } else if (typeof event.data === "string") {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === "error") {
            term.write(`\r\n\x1b[31m${msg.message}\x1b[0m\r\n`);
          }
        } catch {
          term.write(event.data);
        }
      }
    };

    ws.onclose = () => {
      if (!alive) return;
      console.log("[TERM] WS closed for", sessionId);
      setStatus("disconnected");
    };

    ws.onerror = () => {};

    // 3. Wire terminal input → WebSocket
    const onDataDisposable = term.onData((data: string) => {
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(encoder.encode(data));
      }
    });

    // 4. Wire terminal resize → WebSocket (debounced)
    const onResizeDisposable = term.onResize(({ cols, rows }) => {
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: "resize", cols, rows }));
        }
      }, 150);
    });

    // 5. ResizeObserver → fit terminal when container resizes
    const observer = new ResizeObserver(() => {
      try { fitAddon.fit(); } catch {}
    });
    observer.observe(container);

    // Cleanup
    return () => {
      alive = false;
      if (resizeTimer) clearTimeout(resizeTimer);
      onDataDisposable.dispose();
      onResizeDisposable.dispose();
      observer.disconnect();
      if (ws) {
        ws.onopen = null;
        ws.onclose = null;
        ws.onerror = null;
        ws.onmessage = null;
        ws.close();
      }
      term.dispose();
    };
  }, [sessionId, isVisible, containerRef, reconnectRef.current]);

  const reconnect = () => {
    reconnectRef.current += 1;
  };

  return { status, reconnect };
}
