import { CheckCircle2, XCircle, Rocket } from "lucide-react";
import type { StructuredCard } from "../../stores/integratorStore";
import { IntegratorDeployButton } from "./IntegratorDeployButton";

interface IntegratorCardProps {
  card: StructuredCard;
}

/**
 * Structured card rendered inline within Integrator chat messages.
 * Handles: credential_prompt, config_step, test_running, test_success,
 *          test_failed, deploy_ready, deploy_complete.
 */
export function IntegratorCard({ card }: IntegratorCardProps) {
  switch (card.type) {
    case "credential_prompt":
      return <CredentialPromptCard data={card.data} />;
    case "config_step":
      return <ConfigStepCard data={card.data} />;
    case "test_running":
      return <TestRunningCard />;
    case "test_success":
      return <TestSuccessCard data={card.data} />;
    case "test_failed":
      return <TestFailedCard data={card.data} />;
    case "deploy_ready":
      return <DeployReadyCard data={card.data} />;
    case "deploy_complete":
      return <DeployCompleteCard />;
    default:
      return null;
  }
}

function CredentialPromptCard({ data }: { data: Record<string, unknown> }) {
  const service = (data.service as string) || "this service";

  return (
    <div className="my-2 rounded-lg border border-border border-l-4 border-l-accent bg-secondary p-3">
      <p className="text-xs font-medium text-primary-text">
        Credential needed
      </p>
      <p className="mt-1 text-xs text-muted">
        Add credentials for {service} in{" "}
        <span className="text-accent">Settings &gt; Credentials</span>.
      </p>
      <p className="mt-2 text-xs text-success">
        Credentials saved securely -- Claude never sees your credentials.
      </p>
    </div>
  );
}

function ConfigStepCard({ data }: { data: Record<string, unknown> }) {
  const label = (data.label as string) || "Configuration";
  const value = (data.value as string) || "";

  return (
    <div className="my-2 rounded-lg border border-border border-l-4 border-l-accent bg-secondary p-3">
      <p className="text-xs font-medium text-primary-text">{label}</p>
      {value && (
        <p className="mt-1 text-xs text-muted">{value}</p>
      )}
      <button className="mt-2 rounded bg-accent px-3 py-1 text-xs text-white hover:bg-accent/90 transition-colors">
        Apply Config
      </button>
    </div>
  );
}

function TestRunningCard() {
  return (
    <div className="my-2 flex items-center gap-2 rounded-lg border border-border bg-secondary p-3">
      <span className="h-2 w-2 animate-pulse rounded-full bg-success" />
      <span className="text-xs text-muted">Testing against live API...</span>
    </div>
  );
}

function TestSuccessCard({ data }: { data: Record<string, unknown> }) {
  const itemCount = (data.item_count as number) ?? 0;
  const items = (data.items as Array<Record<string, unknown>>) || [];

  return (
    <div className="my-2 rounded-lg border border-border bg-secondary p-3">
      <div className="flex items-center gap-2">
        <CheckCircle2 size={16} className="text-success" />
        <span className="text-xs text-primary-text">
          Returned {itemCount} items
        </span>
      </div>

      {items.length > 0 && (
        <div className="mt-2 space-y-1">
          {items.slice(0, 5).map((item, i) => (
            <div
              key={i}
              className="flex items-stretch gap-2 rounded bg-dominant/50 p-2"
            >
              <div className="w-1 shrink-0 rounded-full bg-accent" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium text-primary-text">
                  {(item.title as string) || "Untitled"}
                </p>
                <p className="truncate text-xs text-muted">
                  {(item.snippet as string) || ""}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function TestFailedCard({ data }: { data: Record<string, unknown> }) {
  const error = (data.error as string) || "Unknown error";

  return (
    <div className="my-2 rounded-lg border border-border bg-secondary p-3">
      <div className="flex items-center gap-2">
        <XCircle size={16} className="text-error" />
        <span className="text-xs text-primary-text">{error}</span>
      </div>
      <p className="mt-1 text-xs text-muted">
        Claude will adjust the code.
      </p>
    </div>
  );
}

function DeployReadyCard({ data }: { data: Record<string, unknown> }) {
  const scriptPath = (data.script_path as string) || "";
  const name = (data.name as string) || "Integration Worker";
  const sourceType = (data.source_type as string) || "custom";

  return (
    <div className="my-2">
      <IntegratorDeployButton
        scriptPath={scriptPath}
        name={name}
        sourceType={sourceType}
      />
    </div>
  );
}

function DeployCompleteCard() {
  return (
    <div className="my-2 flex items-center gap-2 rounded-lg border border-border bg-secondary p-3">
      <span className="h-2 w-2 rounded-full bg-success" />
      <Rocket size={16} className="text-success" />
      <span className="text-sm text-primary-text">
        Worker deployed and running
      </span>
    </div>
  );
}
