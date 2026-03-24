import { Plus } from "lucide-react";
import { useMachineStore } from "../../stores/machineStore";
import { MachineItem } from "../machines/MachineItem";

export function Sidebar() {
  const machines = useMachineStore((s) => s.machines);

  return (
    <div className="flex h-full flex-col bg-secondary">
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
            {machines.map((machine) => (
              <MachineItem key={machine.id} machine={machine} />
            ))}
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
