import { useState } from "react";
import { ChevronDown, ChevronRight, Monitor } from "lucide-react";
import { useMachineStore } from "../../stores/machineStore";
import { useGitStatusAll } from "../../hooks/useGitStatus";
import type { Machine, MachineStatus } from "../../types";
import { isLocalMachine } from "../../types";
import { RepoRow } from "./RepoRow";

const statusIndicator: Record<MachineStatus, string> = {
  online: "bg-success",
  offline: "bg-error",
  reconnecting: "bg-warning animate-pulse",
  needs_setup: "bg-warning",
};

function MachineGroup({ machine }: { machine: Machine }) {
  const machineStatuses = useMachineStore((s) => s.machineStatuses);
  const [collapsed, setCollapsed] = useState(false);
  const status = machineStatuses[machine.id] ?? machine.status;
  const isOnline = status === "online";

  // Only poll when machine is online
  const { data: repos } = useGitStatusAll(isOnline ? machine.id : null);

  return (
    <div>
      {/* Machine header */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="flex w-full items-center gap-1.5 px-2 py-1.5 hover:bg-hover transition-colors"
      >
        {collapsed ? (
          <ChevronRight size={12} className="shrink-0 text-muted" />
        ) : (
          <ChevronDown size={12} className="shrink-0 text-muted" />
        )}
        {isLocalMachine(machine.id) ? (
          <Monitor size={13} className="shrink-0 text-accent" />
        ) : (
          <span
            className={`h-2 w-2 shrink-0 rounded-full ${statusIndicator[status]}`}
          />
        )}
        <span className="flex-1 truncate text-xs font-medium text-primary-text">
          {machine.name}
        </span>
        {repos && repos.length > 0 && (
          <span className="text-[10px] text-muted">{repos.length}</span>
        )}
      </button>

      {/* Repo list */}
      {!collapsed && (
        <div className="pl-3">
          {!isOnline ? (
            <div className="px-2 py-1">
              <span className="text-[10px] text-muted italic">
                {status === "needs_setup" ? "Needs setup" : "Offline"}
              </span>
            </div>
          ) : repos && repos.length > 0 ? (
            repos.map((repo) => (
              <RepoRow key={repo.repo_path} repo={repo} />
            ))
          ) : repos ? (
            <div className="px-2 py-1">
              <span className="text-[10px] text-muted italic">No repos found</span>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

export function RepoList() {
  const machines = useMachineStore((s) => s.machines);

  if (machines.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center px-4 py-8 text-center">
        <h3 className="text-sm font-semibold text-primary-text">
          No machines connected
        </h3>
        <p className="mt-1 text-xs text-muted">
          Add a machine to see repositories.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-0.5 py-1">
      {machines.map((machine) => (
        <MachineGroup key={machine.id} machine={machine} />
      ))}
    </div>
  );
}
