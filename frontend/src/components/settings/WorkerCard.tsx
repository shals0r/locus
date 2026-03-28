import { useRef, useState } from "react";
import { Play, Pause, Settings2, RotateCcw } from "lucide-react";
import { useWorkerStore, type Worker } from "../../stores/workerStore";
import { WorkerLogPanel } from "./WorkerLogPanel";
import { WorkerQuickConfig } from "./WorkerQuickConfig";

interface WorkerCardProps {
  worker: Worker;
}

const STATUS_DOT_COLORS: Record<Worker["worker_status"], string> = {
  running: "bg-success",
  starting: "bg-success animate-pulse",
  degraded: "bg-warning",
  crashed: "bg-error",
  disabled: "bg-error opacity-50",
  stopped: "bg-muted",
};

const STATUS_LABELS: Record<Worker["worker_status"], string> = {
  running: "Running",
  starting: "Starting...",
  degraded: "Degraded",
  crashed: "Crashed",
  disabled: "Disabled",
  stopped: "Stopped",
};

function formatRelativeTime(isoDate: string | null): string {
  if (!isoDate) return "Never";
  const diff = Date.now() - new Date(isoDate).getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function formatInterval(seconds: number): string {
  const minutes = Math.round(seconds / 60);
  return `${minutes}m`;
}

export function WorkerCard({ worker }: WorkerCardProps) {
  const { toggleExpanded, startWorker, stopWorker, enableWorker, expandedWorkerId } =
    useWorkerStore();
  const [configOpen, setConfigOpen] = useState(false);
  const gearRef = useRef<HTMLButtonElement>(null);

  const isExpanded = expandedWorkerId === worker.id;
  const isRunning = worker.worker_status === "running";
  const isDisabled = worker.worker_status === "disabled";
  const canStart =
    worker.worker_status === "stopped" ||
    worker.worker_status === "crashed";

  function handleCardClick(e: React.MouseEvent) {
    // Don't toggle when clicking buttons
    if ((e.target as HTMLElement).closest("button")) return;
    toggleExpanded(worker.id);
  }

  function handlePlayPause() {
    if (isRunning) {
      stopWorker(worker.id);
    } else if (canStart) {
      startWorker(worker.id);
    }
  }

  function handleReEnable() {
    enableWorker(worker.id);
  }

  return (
    <div className="rounded-lg border border-border bg-secondary">
      {/* Card body - clickable for log expansion */}
      <div
        className="cursor-pointer p-4 hover:bg-hover/30"
        onClick={handleCardClick}
      >
        {/* Top row: status dot + name + actions */}
        <div className="flex items-center gap-3">
          <span
            className={`h-2 w-2 shrink-0 rounded-full ${STATUS_DOT_COLORS[worker.worker_status]}`}
            title={STATUS_LABELS[worker.worker_status]}
          />
          <span className="text-sm font-semibold text-primary-text">
            {worker.name}
          </span>
          <span className="text-xs text-muted">
            {STATUS_LABELS[worker.worker_status]}
          </span>
          <div className="flex-1" />

          {/* Gear button */}
          <button
            ref={gearRef}
            type="button"
            onClick={() => setConfigOpen((v) => !v)}
            className="rounded p-1 text-muted hover:text-primary-text hover:bg-hover"
            title="Worker settings"
            aria-label={`Settings for ${worker.name}`}
          >
            <Settings2 size={16} />
          </button>

          {/* Play/Pause or Re-enable */}
          {isDisabled ? (
            <button
              type="button"
              onClick={handleReEnable}
              className="flex items-center gap-1.5 rounded px-2 py-1 text-xs text-muted hover:text-primary-text hover:bg-hover"
              title="Re-enable Worker"
              aria-label={`Re-enable ${worker.name}`}
            >
              <RotateCcw size={14} />
              Re-enable Worker
            </button>
          ) : (
            <button
              type="button"
              onClick={handlePlayPause}
              className="rounded p-1 text-muted hover:text-primary-text hover:bg-hover"
              title={isRunning ? "Stop worker" : "Start worker"}
              aria-label={isRunning ? `Stop ${worker.name}` : `Start ${worker.name}`}
            >
              {isRunning ? <Pause size={16} /> : <Play size={16} />}
            </button>
          )}
        </div>

        {/* Metadata row */}
        <div className="mt-2 text-xs text-muted">
          {isDisabled ? (
            <span className="text-error">
              Disabled after {worker.failure_count} failures
            </span>
          ) : (
            <>
              <span>Poll: {formatInterval(worker.poll_interval_seconds)}</span>
              <span className="mx-2">|</span>
              <span>Last: {formatRelativeTime(worker.last_polled_at)}</span>
              <span className="mx-2">|</span>
              <span>Items: {worker.total_items_ingested.toLocaleString()}</span>
            </>
          )}
        </div>
      </div>

      {/* Expandable log panel */}
      <WorkerLogPanel workerId={worker.id} expanded={isExpanded} />

      {/* Quick config popover */}
      {configOpen && (
        <WorkerQuickConfig
          worker={worker}
          open={configOpen}
          onClose={() => setConfigOpen(false)}
          anchorRef={gearRef}
        />
      )}
    </div>
  );
}
