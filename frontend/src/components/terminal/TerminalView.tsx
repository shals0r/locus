import { useEffect, useRef } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import "@xterm/xterm/css/xterm.css";

interface TerminalViewProps {
  sessionId: string;
  machineId: string;
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
export function TerminalView({ sessionId, machineId, isVisible }: TerminalViewProps) {
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

    // Fit BEFORE connecting so we know the real dimensions upfront
    try { fitAddon.fit(); } catch {}

    // Pass actual dimensions in URL so tmux is created at the right size
    const cols = term.cols;
    const rows = term.rows;
    const ws = new WebSocket(wsUrl + `&cols=${cols}&rows=${rows}`);
    ws.binaryType = "arraybuffer";
    const encoder = new TextEncoder();

    ws.onopen = () => {
      // Send dimensions again in case they changed between URL construction and connect
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "resize", cols: term.cols, rows: term.rows }));
      }
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

    // Clipboard handling — single handler for copy, paste (text + images)
    function pasteText(text: string) {
      if (text && ws.readyState === WebSocket.OPEN) {
        ws.send(encoder.encode("\x1b[200~" + text + "\x1b[201~"));
      }
    }

    function pasteFromClipboard() {
      navigator.clipboard.read().then(async (items) => {
        for (const item of items) {
          const imageType = item.types.find((t) => t.startsWith("image/"));
          if (imageType) {
            const blob = await item.getType(imageType);
            term.write("\r\n\x1b[90m[Uploading image...]\x1b[0m");

            const formData = new FormData();
            formData.append("machine_id", machineId);
            formData.append("file", blob, `paste-${Date.now()}.png`);

            try {
              const tkn = localStorage.getItem("locus_token");
              const res = await fetch("/api/upload-image", {
                method: "POST",
                headers: { Authorization: `Bearer ${tkn ?? ""}` },
                body: formData,
              });
              if (res.ok) {
                const { remote_path } = await res.json();
                if (ws.readyState === WebSocket.OPEN) {
                  ws.send(encoder.encode(remote_path));
                }
              } else {
                const detail = await res.text().catch(() => "unknown error");
                term.write(`\r\n\x1b[31m[Image upload failed: ${detail}]\x1b[0m\r\n`);
              }
            } catch (err) {
              term.write("\r\n\x1b[31m[Image upload failed]\x1b[0m\r\n");
            }
            return;
          }
        }
        // No image — paste text
        const text = await navigator.clipboard.readText();
        pasteText(text);
      }).catch((err) => {
        console.warn("[TERM] clipboard.read() failed:", err);
        // Clipboard API read() denied — try text-only
        navigator.clipboard.readText().then(pasteText).catch(() => {});
      });
    }

    term.attachCustomKeyEventHandler((e) => {
      if (e.type !== "keydown") return true;

      // Ctrl+C: copy selection if any, else let SIGINT through
      if (e.ctrlKey && e.key === "c" && !e.shiftKey) {
        if (term.hasSelection()) {
          navigator.clipboard.writeText(term.getSelection());
          term.clearSelection();
          return false;
        }
        return true; // no selection → normal SIGINT
      }

      // Ctrl+Shift+C: always copy
      if (e.ctrlKey && e.shiftKey && e.key === "C") {
        if (term.hasSelection()) {
          navigator.clipboard.writeText(term.getSelection());
          term.clearSelection();
        }
        return false;
      }

      // Ctrl+V / Ctrl+Shift+V: paste (checks for images first)
      if (e.ctrlKey && (e.key === "v" || e.key === "V")) {
        pasteFromClipboard();
        return false;
      }

      return true;
    });

    // Right-click → paste
    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault();
      pasteFromClipboard();
    };
    container.addEventListener("contextmenu", handleContextMenu);

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
      container.removeEventListener("contextmenu", handleContextMenu);
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
      // Don't call term.focus() here — it triggers DA queries whose
      // responses appear as garbage text (e.g. "1;2c0;276;0c").
      // User will click the terminal to focus it.
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
