import { Loader2, Rocket } from "lucide-react";
import { useIntegratorStore } from "../../stores/integratorStore";

interface IntegratorDeployButtonProps {
  scriptPath: string;
  name: string;
  sourceType: string;
}

/**
 * Deploy action button for the Integrator chat.
 *
 * States:
 * - Ready: Full-width accent button "Deploy Worker"
 * - Deploying: Disabled with spinner "Deploying..."
 * - Deployed: Success message with Rocket icon
 */
export function IntegratorDeployButton({
  scriptPath,
  name,
  sourceType,
}: IntegratorDeployButtonProps) {
  const deploying = useIntegratorStore((s) => s.deploying);
  const deployed = useIntegratorStore((s) => s.deployed);
  const deploy = useIntegratorStore((s) => s.deploy);

  if (deployed) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-border bg-secondary p-3">
        <span className="h-2 w-2 rounded-full bg-success" />
        <Rocket size={16} className="text-success" />
        <span className="text-sm text-primary-text">
          Worker deployed and running
        </span>
      </div>
    );
  }

  return (
    <button
      onClick={() => deploy(scriptPath, name, sourceType)}
      disabled={deploying}
      className="flex w-full items-center justify-center gap-2 rounded-lg bg-accent px-4 text-sm font-medium text-white transition-colors hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-50"
      style={{ height: 36 }}
    >
      {deploying ? (
        <>
          <Loader2 size={16} className="animate-spin" />
          Deploying...
        </>
      ) : (
        "Deploy Worker"
      )}
    </button>
  );
}
