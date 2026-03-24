import type { Machine, MachineStatus } from "../../types";
import { useMachineStore } from "../../stores/machineStore";

const statusColors: Record<MachineStatus, string> = {
  online: "bg-success",
  offline: "bg-error",
  reconnecting: "bg-warning animate-pulse",
};

export function MachineItem({ machine }: { machine: Machine }) {
  const activeMachineId = useMachineStore((s) => s.activeMachineId);
  const setActiveMachine = useMachineStore((s) => s.setActiveMachine);
  const machineStatuses = useMachineStore((s) => s.machineStatuses);

  const status = machineStatuses[machine.id] ?? machine.status;
  const isActive = activeMachineId === machine.id;

  return (
    <button
      onClick={() => setActiveMachine(machine.id)}
      className={`flex w-full items-center gap-2 rounded px-2 py-2 text-sm transition-colors ${
        isActive
          ? "bg-hover text-primary-text"
          : "text-muted hover:bg-hover hover:text-primary-text"
      }`}
      style={{ minHeight: "36px" }}
    >
      <span className={`h-2 w-2 shrink-0 rounded-full ${statusColors[status]}`} />
      <span className="truncate">{machine.name}</span>
    </button>
  );
}
