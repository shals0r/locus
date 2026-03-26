import { Monitor } from "lucide-react";
import type { Machine, MachineStatus } from "../../types";
import { isLocalMachine } from "../../types";
import { useMachineStore } from "../../stores/machineStore";

const statusColors: Record<MachineStatus, string> = {
  online: "bg-success",
  offline: "bg-error",
  reconnecting: "bg-warning",
};

export function MachineTab({ machine }: { machine: Machine }) {
  const activeMachineId = useMachineStore((s) => s.activeMachineId);
  const setActiveMachine = useMachineStore((s) => s.setActiveMachine);
  const machineStatuses = useMachineStore((s) => s.machineStatuses);

  const isLocal = isLocalMachine(machine.id);
  const status = machineStatuses[machine.id] ?? machine.status;
  const isActive = activeMachineId === machine.id;

  return (
    <button
      onClick={() => setActiveMachine(machine.id)}
      className={`flex shrink-0 items-center gap-1.5 px-3 text-sm transition-colors ${
        isActive
          ? "border-b-2 border-accent text-primary-text"
          : "border-b-2 border-transparent text-muted hover:text-primary-text"
      }`}
      style={{ height: "36px" }}
    >
      {isLocal ? (
        <Monitor size={16} className="shrink-0 text-accent" />
      ) : (
        <span className={`h-1.5 w-1.5 rounded-full ${statusColors[status]}`} />
      )}
      <span className="truncate">{machine.name}</span>
    </button>
  );
}
