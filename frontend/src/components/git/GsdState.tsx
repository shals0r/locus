import { useGsdState } from "../../hooks/useGitStatus";
import type { GsdState as GsdStateType } from "../../types";

const statusColors: Record<string, string> = {
  Executing: "text-accent",
  Complete: "text-success",
  Planned: "text-muted",
  Verifying: "text-warning",
};

interface GsdStateProps {
  machineId: string;
  repoPath: string;
  expanded: boolean;
  onToggle: () => void;
}

function GsdBadge({ gsd }: { gsd: GsdStateType }) {
  if (!gsd.has_gsd) return null;

  const status = gsd.phase_status ?? "Planned";
  const colorClass = statusColors[status] || "text-muted";

  return (
    <div className="flex items-center gap-1.5">
      <span className={`text-[10px] font-medium ${colorClass}`}>
        {gsd.current_phase ? gsd.current_phase : "GSD"}
      </span>
      <span className="text-[10px] text-muted">
        {gsd.completed_phases}/{gsd.total_phases}
      </span>
      {gsd.blockers > 0 && (
        <span className="flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-error/20 px-0.5 text-[9px] font-medium text-error">
          {gsd.blockers}
        </span>
      )}
      {gsd.pending_todos > 0 && (
        <span className="flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-warning/20 px-0.5 text-[9px] font-medium text-warning">
          {gsd.pending_todos}
        </span>
      )}
    </div>
  );
}

export function GsdStateDisplay({
  machineId,
  repoPath,
  expanded,
  onToggle,
}: GsdStateProps) {
  const { data: gsd } = useGsdState(machineId, repoPath);

  if (!gsd || !gsd.has_gsd) return null;

  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      className="flex items-center gap-1 rounded px-1 py-0.5 hover:bg-hover transition-colors"
      title={`GSD: ${gsd.current_phase ?? "No active phase"} (${gsd.phase_status ?? "unknown"})`}
    >
      <GsdBadge gsd={gsd} />
      <svg
        className={`h-2.5 w-2.5 text-muted transition-transform ${expanded ? "rotate-180" : ""}`}
        viewBox="0 0 10 10"
        fill="currentColor"
      >
        <path d="M2 4l3 3 3-3" stroke="currentColor" strokeWidth="1.5" fill="none" />
      </svg>
    </button>
  );
}
