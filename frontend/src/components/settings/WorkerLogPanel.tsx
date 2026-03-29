import { useEffect, useRef } from "react";
import { useWorkerLogs } from "../../hooks/useWorkerLogs";

interface WorkerLogPanelProps {
  workerId: string;
  expanded: boolean;
}

function colorizeLevel(level: string): string {
  switch (level.toUpperCase()) {
    case "ERROR":
      return "text-error";
    case "WARN":
    case "WARNING":
      return "text-warning";
    case "INFO":
    default:
      return "text-muted";
  }
}

function parseLine(line: string): { timestamp: string; level: string; message: string } {
  // Expected format: "2026-03-28 14:32:01 INFO Polled 12 items"
  const match = line.match(/^(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2})\s+(INFO|WARN|WARNING|ERROR|DEBUG)\s+(.*)$/i);
  if (match) {
    return { timestamp: match[1]!, level: match[2]!, message: match[3]! };
  }
  return { timestamp: "", level: "INFO", message: line };
}

export function WorkerLogPanel({ workerId, expanded }: WorkerLogPanelProps) {
  const { lines, connected, loadMore } = useWorkerLogs({
    workerId,
    enabled: expanded,
  });
  const containerRef = useRef<HTMLDivElement>(null);
  const isAtBottomRef = useRef(true);

  // Track scroll position to determine if user scrolled up
  function handleScroll() {
    const el = containerRef.current;
    if (!el) return;
    const tolerance = 10;
    isAtBottomRef.current =
      el.scrollTop + el.clientHeight >= el.scrollHeight - tolerance;
  }

  // Auto-scroll when new lines arrive (only if at bottom)
  useEffect(() => {
    if (isAtBottomRef.current && containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [lines]);

  if (!expanded) {
    return null;
  }

  return (
    <div
      ref={containerRef}
      className="max-h-[200px] overflow-y-auto border-t border-border bg-dominant transition-all duration-200"
      onScroll={handleScroll}
      role="log"
      aria-live="polite"
    >
      {/* Load earlier logs */}
      <div className="px-3 pt-2">
        <button
          type="button"
          onClick={loadMore}
          className="text-xs text-accent hover:underline"
        >
          Load earlier logs
        </button>
      </div>

      {/* Connection status */}
      {!connected && lines.length === 0 && (
        <div className="px-3 py-4 text-center text-xs text-muted">
          Connecting to log stream...
        </div>
      )}

      {/* Log lines */}
      <div className="px-3 py-1">
        {lines.map((line, i) => {
          const parsed = parseLine(line);
          return (
            <div
              key={`${i}-${line.slice(0, 20)}`}
              className="font-mono text-xs leading-[1.3] whitespace-pre-wrap break-all"
            >
              {parsed.timestamp && (
                <span className="text-muted">{parsed.timestamp} </span>
              )}
              <span className={colorizeLevel(parsed.level)}>
                {parsed.level}{" "}
              </span>
              <span className="text-primary-text">{parsed.message}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
