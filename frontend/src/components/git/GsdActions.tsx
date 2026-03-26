import { Play, CheckCircle, Map, FileText } from "lucide-react";
import type { GsdState } from "../../types";

interface GsdActionsProps {
  gsdState: GsdState;
  machineId: string;
  repoPath: string;
}

interface ActionButton {
  label: string;
  icon: React.ReactNode;
  command: string;
  variant: "primary" | "secondary";
}

function getActions(gsdState: GsdState): ActionButton[] {
  const actions: ActionButton[] = [];
  const status = gsdState.phase_status;

  if (status === "Planned") {
    actions.push({
      label: "Execute",
      icon: <Play size={11} />,
      command: "/gsd:execute-phase",
      variant: "primary",
    });
  } else if (status === "Executing" || status === "Verifying") {
    actions.push({
      label: "Verify",
      icon: <CheckCircle size={11} />,
      command: "/gsd:verify",
      variant: "primary",
    });
  } else {
    // Complete or no active phase
    actions.push({
      label: "Plan Next",
      icon: <Map size={11} />,
      command: "/gsd:plan-phase",
      variant: "primary",
    });
  }

  actions.push({
    label: "Roadmap",
    icon: <FileText size={11} />,
    command: "/gsd:status",
    variant: "secondary",
  });

  return actions;
}

export function GsdActions({ gsdState, machineId, repoPath }: GsdActionsProps) {
  const actions = getActions(gsdState);

  const handleAction = (command: string) => {
    // Dispatch terminal open with command pre-filled
    // This will be wired to sessionStore in a future plan for terminal dispatch
    console.log(
      `GSD action: ${command} on ${machineId}:${repoPath}`,
    );
  };

  return (
    <div className="flex items-center gap-1 px-1 py-1">
      {actions.map((action) => (
        <button
          key={action.label}
          onClick={(e) => {
            e.stopPropagation();
            handleAction(action.command);
          }}
          className={`flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] transition-colors ${
            action.variant === "primary"
              ? "text-accent hover:bg-accent/10"
              : "text-muted hover:bg-hover"
          }`}
          title={`${action.label} (${action.command})`}
        >
          {action.icon}
          {action.label}
        </button>
      ))}
    </div>
  );
}
