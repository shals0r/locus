import { MachineSettings } from "./MachineSettings";
import { CredentialSettings } from "./CredentialSettings";
import { ClaudeCodeSettings } from "./ClaudeCodeSettings";

export function SettingsPage() {
  return (
    <div className="min-h-full overflow-y-auto bg-dominant p-8">
      <h1 className="mb-8 text-lg font-semibold text-primary-text">
        Settings
      </h1>

      <div className="flex max-w-2xl flex-col gap-8">
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
      </div>
    </div>
  );
}
