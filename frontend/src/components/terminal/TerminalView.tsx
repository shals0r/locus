import { useEffect, useRef } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import "@xterm/xterm/css/xterm.css";

interface TerminalViewProps {
  sessionId: string;
  isVisible: boolean;
}

export function TerminalView({ sessionId, isVisible }: TerminalViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const initDone = useRef(false);

  // One-time setup: terminal + WebSocket + wiring. Never torn down until unmount.
  useEffect(() => {
    const container = containerRef.current;
    if (!container || initDone.current) return;
    initDone.current = true;

    const token = localStorage.getItem("locus_token");
    const wsUrl =
      (location.protocol === "https:" ? "wss:" : "ws:") +
      "//" +
      location.host +
      "/ws/terminal/" +
      sessionId +
      "?token=" +
      encodeURIComponent(token ?? "");

    const term = new Terminal({
      cursorBlink: true,
      fontFamily: "JetBrains Mono, monospace",
      fontSize: 14,
      lineHeight: 1.2,
      theme: {
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
      },
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.loadAddon(new WebLinksAddon());
    term.open(container);
    termRef.current = term;
    fitRef.current = fitAddon;

    const ws = new WebSocket(wsUrl);
    ws.binaryType = "arraybuffer";
    wsRef.current = ws;
    const encoder = new TextEncoder();

    /**
     * Send resize with optional "refresh" flag.
     * refresh=true tells the backend to jitter-resize tmux so it repaints.
     * Only used on initial connect and tab switch — not on regular window resizes.
     */
    function forceSendSize(refresh = false) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(
          JSON.stringify({
            type: "resize",
            cols: term.cols,
            rows: term.rows,
            ...(refresh ? { refresh: true } : {}),
          }),
        );
      }
    }

    ws.onopen = () => {
      // Only fit/send when the container is actually visible.
      // Hidden tabs (display:none) have 0 dimensions — fitting would
      // send bogus sizes to the backend. The isVisible effect handles
      // fitting when the tab becomes visible.
      if (container.offsetWidth === 0 || container.offsetHeight === 0) return;
      requestAnimationFrame(() => {
        if (container.offsetWidth === 0 || container.offsetHeight === 0) return;
        try {
          fitAddon.fit();
        } catch {}
        forceSendSize(true);
      });
    };

    /**
     * Safety-net refresh: after output settles (no new writes for 80ms),
     * force a full viewport repaint. Catches any remaining stale cells
     * that the renderer's dirty-tracking missed during fast output.
     */
    let refreshTimer: ReturnType<typeof setTimeout> | null = null;

    ws.onmessage = (e) => {
      if (e.data instanceof ArrayBuffer) {
        term.write(new Uint8Array(e.data));
      } else {
        // Filter out JSON control messages from the backend
        const text = e.data as string;
        if (text.startsWith("{") && text.includes('"type"')) {
          try {
            const msg = JSON.parse(text);
            if (msg.type === "error" && msg.message) {
              term.write(`\r\n\x1b[31m⚠ ${msg.message}\x1b[0m\r\n`);
              return;
            }
          } catch {
            // Not valid JSON, write as normal terminal output
          }
        }
        term.write(e.data);
      }
      // After output settles, force full viewport repaint
      if (refreshTimer) clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => {
        term.refresh(0, term.rows - 1);
      }, 80);
    };

    term.onData((data) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(encoder.encode(data));
      }
    });

    term.onResize(({ cols, rows }) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "resize", cols, rows }));
      }
    });

    let fitTimer: ReturnType<typeof setTimeout> | null = null;
    const observer = new ResizeObserver(() => {
      // Don't fit when hidden (display:none gives 0 dimensions, corrupts tmux)
      if (container.offsetWidth === 0 || container.offsetHeight === 0) return;
      if (fitTimer) clearTimeout(fitTimer);
      fitTimer = setTimeout(() => {
        try {
          fitAddon.fit();
        } catch {}
      }, 50);
    });
    observer.observe(container);

    return () => {
      initDone.current = false;
      if (fitTimer) clearTimeout(fitTimer);
      if (refreshTimer) clearTimeout(refreshTimer);
      observer.disconnect();
      ws.onopen = null;
      ws.onclose = null;
      ws.onerror = null;
      ws.onmessage = null;
      ws.close();
      wsRef.current = null;
      term.dispose();
      termRef.current = null;
      fitRef.current = null;
    };
  }, [sessionId]);

  // When tab becomes visible: refit to correct dimensions and force tmux redraw
  useEffect(() => {
    if (!isVisible || !fitRef.current || !termRef.current) return;
    const term = termRef.current;
    const fit = fitRef.current;
    const ws = wsRef.current;
    // Double rAF: first for display:block layout, second for accurate measurement
    const id = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        try {
          fit.fit();
        } catch {}
        // Force-send resize with refresh flag so tmux redraws at correct size
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.send(
            JSON.stringify({
              type: "resize",
              cols: term.cols,
              rows: term.rows,
              refresh: true,
            }),
          );
        }
        term.scrollToBottom();
        term.focus();
      });
    });
    return () => cancelAnimationFrame(id);
  }, [isVisible]);

  return (
    <div
      className="h-full w-full"
      style={{ background: "#1a1b26" }}
      ref={containerRef}
    />
  );
}
