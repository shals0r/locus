import { useEffect, useRef } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import "@xterm/xterm/css/xterm.css";

interface TerminalViewProps {
  sessionId: string;
  isVisible: boolean;
}

/**
 * Terminal component using the Hyper pattern: inactive tabs are positioned
 * off-screen (left: -9999px) instead of display:none. This preserves xterm.js
 * dimensions so data arriving while hidden is rendered correctly. xterm's
 * built-in IntersectionObserver pauses canvas rendering for off-screen
 * terminals automatically (zero CPU cost).
 *
 * On tab switch we just fit + focus. No scrollback replay, no jitter-resize.
 */
export function TerminalView({ sessionId, isVisible }: TerminalViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
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
    const encoder = new TextEncoder();

    ws.onopen = () => {
      requestAnimationFrame(() => {
        try { fitAddon.fit(); } catch {}
      });
    };

    ws.onmessage = (e) => {
      if (e.data instanceof ArrayBuffer) {
        term.write(new Uint8Array(e.data));
      } else {
        term.write(e.data);
      }
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
      if (fitTimer) clearTimeout(fitTimer);
      fitTimer = setTimeout(() => {
        try { fitAddon.fit(); } catch {}
      }, 50);
    });
    observer.observe(container);

    return () => {
      initDone.current = false;
      if (fitTimer) clearTimeout(fitTimer);
      observer.disconnect();
      ws.onopen = null;
      ws.onclose = null;
      ws.onerror = null;
      ws.onmessage = null;
      ws.close();
      term.dispose();
      termRef.current = null;
      fitRef.current = null;
    };
  }, [sessionId]);

  // Tab switch: repaint buffer, fit, focus
  useEffect(() => {
    if (!isVisible || !fitRef.current || !termRef.current) return;
    const term = termRef.current;
    const fit = fitRef.current;
    const id = requestAnimationFrame(() => {
      try { fit.fit(); } catch {}
      // Force full repaint — renderer was paused while off-screen
      term.refresh(0, term.rows - 1);
      term.focus();
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
