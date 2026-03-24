import { useMachineStore } from "../../stores/machineStore";
import { MachineTabBar } from "../navigation/MachineTabBar";
import { SessionTabBar } from "../navigation/SessionTabBar";

export function CenterPanel() {
  const activeMachineId = useMachineStore((s) => s.activeMachineId);

  return (
    <div className="flex h-full flex-col">
      <MachineTabBar />
      <SessionTabBar />
      <div className="flex flex-1 items-center justify-center">
        {!activeMachineId && (
          <div className="text-center">
            <h3 className="text-sm font-semibold text-primary-text">
              No active sessions
            </h3>
            <p className="mt-1 text-xs text-muted">
              Select a machine from the sidebar, or add a new one to open a
              terminal.
            </p>
          </div>
        )}
        {activeMachineId && (
          <div className="flex h-full w-full items-center justify-center text-muted text-xs">
            {/* Terminal view will be rendered here in Plan 06 */}
          </div>
        )}
      </div>
    </div>
  );
}
