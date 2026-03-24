import { Plus } from "lucide-react";
import { useMachineStore } from "../../stores/machineStore";
import { MachineTab } from "./MachineTab";

export function MachineTabBar() {
  const machines = useMachineStore((s) => s.machines);

  return (
    <div className="flex h-9 shrink-0 items-stretch bg-secondary border-b border-border overflow-x-auto">
      {machines.map((machine) => (
        <MachineTab key={machine.id} machine={machine} />
      ))}
      <button
        className="flex shrink-0 items-center px-2 text-muted hover:text-primary-text transition-colors"
        aria-label="Add machine"
      >
        <Plus size={14} />
      </button>
    </div>
  );
}
