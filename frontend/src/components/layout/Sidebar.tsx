import { Plus } from "lucide-react";
import { useMachineStore } from "../../stores/machineStore";
import { MachineItem } from "../machines/MachineItem";
import type { MachineStatus } from "../../types";

const statusText: Record<MachineStatus, string> = {
  online: "Connected",
  offline: "Offline",
  reconnecting: "Reconnecting",
};

export function Sidebar() {
  const machines = useMachineStore((s) => s.machines);
  const machineStatuses = useMachineStore((s) => s.machineStatuses);

  // Compute aggregate status for the header
  const statuses = Object.values(machineStatuses);
  const onlineCount = statuses.filter((s) => s === "online").length;

  return (
    <div className="flex h-full flex-col bg-secondary">
      {/* Header with machine count */}
      {machines.length > 0 && (
        <div className="flex items-center justify-between px-3 py-2 border-b border-border">
          <span className="text-xs font-medium text-muted uppercase tracking-wide">
            Machines
          </span>
          {onlineCount > 0 && (
            <span className="text-xs text-success">
              {onlineCount} online
            </span>
          )}
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-2">
        {machines.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-4 py-8 text-center">
            <h3 className="text-sm font-semibold text-primary-text">
              No machines connected
            </h3>
            <p className="mt-1 text-xs text-muted">
              Add a remote machine to get started.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-0.5">
            {machines.map((machine) => {
              const status = machineStatuses[machine.id] ?? machine.status;
              return (
                <div key={machine.id}>
                  <MachineItem machine={machine} />
                  <div className="pl-6 pb-1">
                    <span className="text-[10px] text-muted">
                      {statusText[status]}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
      <div className="border-t border-border p-2">
        <button className="flex w-full items-center justify-center gap-1.5 rounded px-3 py-2 text-sm text-accent hover:bg-hover transition-colors">
          <Plus size={14} />
          Add Machine
        </button>
      </div>
    </div>
  );
}
