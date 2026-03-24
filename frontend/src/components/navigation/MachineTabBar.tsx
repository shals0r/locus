import { Bot, Plus } from "lucide-react";
import { useMachineStore } from "../../stores/machineStore";
import { MachineTab } from "./MachineTab";

export function MachineTabBar() {
  const machines = useMachineStore((s) => s.machines);
  const claudeViewActive = useMachineStore((s) => s.claudeViewActive);
  const setClaudeViewActive = useMachineStore((s) => s.setClaudeViewActive);

  return (
    <div className="flex h-9 shrink-0 items-stretch bg-secondary border-b border-border overflow-x-auto">
      {machines.map((machine) => (
        <MachineTab key={machine.id} machine={machine} />
      ))}
      <button
        onClick={() => setClaudeViewActive(true)}
        className={`flex shrink-0 items-center gap-1.5 px-3 text-sm transition-colors ${
          claudeViewActive
            ? "border-b-2 border-accent text-primary-text"
            : "border-b-2 border-transparent text-muted hover:text-primary-text"
        }`}
        style={{ height: "36px" }}
      >
        <Bot size={14} />
        <span>Claude</span>
      </button>
      <button
        className="flex shrink-0 items-center px-2 text-muted hover:text-primary-text transition-colors"
        aria-label="Add machine"
      >
        <Plus size={14} />
      </button>
    </div>
  );
}
