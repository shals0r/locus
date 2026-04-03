import { GeneralSettings } from "./GeneralSettings";
import { MachineSettings } from "./MachineSettings";
import { CredentialSettings } from "./CredentialSettings";
import { ClaudeCodeSettings } from "./ClaudeCodeSettings";
import { IntegrationSettings } from "./IntegrationSettings";

export function SettingsPage() {
  return (
    <div className="min-h-full overflow-y-auto bg-dominant px-8 py-6">
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-8">
        {/* General section */}
        <section className="rounded-lg border border-border bg-secondary p-6">
          <h2 className="mb-4 text-lg font-semibold text-primary-text">
            General
          </h2>
          <GeneralSettings />
        </section>

        {/* Machines section */}
        <section className="rounded-lg border border-border bg-secondary p-6">
          <h2 className="mb-4 text-lg font-semibold text-primary-text">
            Machines
          </h2>
          <MachineSettings />
        </section>

        {/* Credentials section */}
        <section className="rounded-lg border border-border bg-secondary p-6">
          <h2 className="mb-4 text-lg font-semibold text-primary-text">
            Credentials
          </h2>
          <CredentialSettings />
        </section>

        {/* Claude Code section */}
        <section className="rounded-lg border border-border bg-secondary p-6">
          <h2 className="mb-4 text-lg font-semibold text-primary-text">
            Claude Code
          </h2>
          <ClaudeCodeSettings />
        </section>

        {/* Integrations section */}
        <section className="rounded-lg border border-border bg-secondary p-6">
          <IntegrationSettings />
        </section>
      </div>
    </div>
  );
}
