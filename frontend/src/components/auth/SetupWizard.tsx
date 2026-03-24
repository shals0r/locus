import { useState } from "react";
import { useAuthStore } from "../../stores/authStore";
import { apiPost } from "../../hooks/useApi";
import { WizardStep } from "./WizardStep";
import { MachineForm } from "../machines/MachineForm";

type ServiceType = "gitlab" | "github" | "jira" | "google" | "other";

export function SetupWizard() {
  const setToken = useAuthStore((s) => s.setToken);
  const setIsSetup = useAuthStore((s) => s.setIsSetup);

  const [step, setStep] = useState(1);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [loading, setLoading] = useState(false);

  // Step 3 state
  const [serviceType, setServiceType] = useState<ServiceType>("gitlab");
  const [serviceName, setServiceName] = useState("");
  const [credentialData, setCredentialData] = useState<Record<string, string>>(
    {},
  );
  const [credSaving, setCredSaving] = useState(false);

  async function handlePasswordSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPasswordError("");

    if (password.length < 8) {
      setPasswordError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setPasswordError("Passwords do not match.");
      return;
    }

    setLoading(true);
    try {
      const data = await apiPost<{ access_token: string; token_type: string }>(
        "/api/auth/setup",
        { password },
      );
      setToken(data.access_token);
      setStep(2);
    } catch (err) {
      setPasswordError(
        err instanceof Error ? err.message : "Setup failed. Try again.",
      );
    } finally {
      setLoading(false);
    }
  }

  function handleMachineSuccess() {
    setStep(3);
  }

  async function handleCredentialSave() {
    setCredSaving(true);
    try {
      await apiPost("/api/settings/credentials", {
        service_type: serviceType,
        service_name: serviceName,
        data: credentialData,
      });
      finishWizard();
    } catch {
      // Non-blocking: user can still finish
      finishWizard();
    } finally {
      setCredSaving(false);
    }
  }

  function finishWizard() {
    setIsSetup(true);
  }

  function renderCredentialFields() {
    switch (serviceType) {
      case "gitlab":
      case "github":
        return (
          <input
            type="password"
            value={credentialData.token ?? ""}
            onChange={(e) =>
              setCredentialData({ ...credentialData, token: e.target.value })
            }
            placeholder="Access token"
            className="h-9 rounded border border-border bg-dominant px-3 text-sm text-primary-text placeholder:text-muted focus:border-accent focus:outline-none"
          />
        );
      case "jira":
        return (
          <>
            <input
              type="text"
              value={credentialData.email ?? ""}
              onChange={(e) =>
                setCredentialData({ ...credentialData, email: e.target.value })
              }
              placeholder="Email"
              className="h-9 rounded border border-border bg-dominant px-3 text-sm text-primary-text placeholder:text-muted focus:border-accent focus:outline-none"
            />
            <input
              type="password"
              value={credentialData.api_token ?? ""}
              onChange={(e) =>
                setCredentialData({
                  ...credentialData,
                  api_token: e.target.value,
                })
              }
              placeholder="API token"
              className="h-9 rounded border border-border bg-dominant px-3 text-sm text-primary-text placeholder:text-muted focus:border-accent focus:outline-none"
            />
          </>
        );
      case "google":
        return (
          <textarea
            value={credentialData.credentials_json ?? ""}
            onChange={(e) =>
              setCredentialData({
                ...credentialData,
                credentials_json: e.target.value,
              })
            }
            placeholder="Credentials JSON"
            rows={4}
            className="rounded border border-border bg-dominant px-3 py-2 text-sm text-primary-text placeholder:text-muted focus:border-accent focus:outline-none"
          />
        );
      case "other":
        return (
          <>
            <input
              type="text"
              value={credentialData.key ?? ""}
              onChange={(e) =>
                setCredentialData({ ...credentialData, key: e.target.value })
              }
              placeholder="Key"
              className="h-9 rounded border border-border bg-dominant px-3 text-sm text-primary-text placeholder:text-muted focus:border-accent focus:outline-none"
            />
            <input
              type="password"
              value={credentialData.value ?? ""}
              onChange={(e) =>
                setCredentialData({ ...credentialData, value: e.target.value })
              }
              placeholder="Value"
              className="h-9 rounded border border-border bg-dominant px-3 text-sm text-primary-text placeholder:text-muted focus:border-accent focus:outline-none"
            />
          </>
        );
    }
  }

  return (
    <div className="flex min-h-screen items-start justify-center bg-dominant px-12 py-12">
      <div className="w-full max-w-lg">
        <h1 className="mb-2 text-center text-lg font-semibold text-primary-text">
          Locus
        </h1>

        {/* Progress indicator */}
        <div className="mb-8 flex items-center justify-center gap-2">
          {[1, 2, 3].map((s) => (
            <div
              key={s}
              className={`h-2 w-8 rounded-full ${
                s <= step ? "bg-accent" : "bg-border"
              }`}
            />
          ))}
        </div>

        <div className="flex flex-col gap-6">
          {/* Step 1: Password */}
          <WizardStep
            heading="Set your password"
            body="Choose a password to secure your Locus instance."
            isActive={step === 1}
            isCompleted={step > 1}
          >
            <form
              onSubmit={handlePasswordSubmit}
              className="flex flex-col gap-4"
            >
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password (min 8 characters)"
                autoFocus
                className="h-9 rounded border border-border bg-dominant px-3 text-sm text-primary-text placeholder:text-muted focus:border-accent focus:outline-none"
              />
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirm password"
                className="h-9 rounded border border-border bg-dominant px-3 text-sm text-primary-text placeholder:text-muted focus:border-accent focus:outline-none"
              />

              {passwordError && (
                <p className="text-sm text-error">{passwordError}</p>
              )}

              <button
                type="submit"
                disabled={loading || !password || !confirmPassword}
                className="h-9 rounded bg-accent text-sm font-semibold text-white hover:bg-accent/90 disabled:opacity-50"
              >
                {loading ? "Setting up..." : "Next"}
              </button>
            </form>
          </WizardStep>

          {/* Step 2: Machine */}
          <WizardStep
            heading="Connect your first machine"
            body="Add a remote machine to start working. You can add more later in Settings."
            isActive={step === 2}
            isCompleted={step > 2}
          >
            <MachineForm onSuccess={handleMachineSuccess} />
            <button
              type="button"
              onClick={() => setStep(3)}
              className="mt-3 text-sm text-muted hover:text-primary-text"
            >
              Skip for now
            </button>
          </WizardStep>

          {/* Step 3: Credentials */}
          <WizardStep
            heading="Add service credentials"
            body="Connect GitLab, GitHub, or other services. You can skip this and add them later."
            isActive={step === 3}
            isCompleted={false}
          >
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-1">
                <label className="text-xs text-muted">Service type</label>
                <select
                  value={serviceType}
                  onChange={(e) => {
                    setServiceType(e.target.value as ServiceType);
                    setCredentialData({});
                  }}
                  className="h-9 rounded border border-border bg-dominant px-3 text-sm text-primary-text focus:border-accent focus:outline-none"
                >
                  <option value="gitlab">GitLab</option>
                  <option value="github">GitHub</option>
                  <option value="jira">Jira</option>
                  <option value="google">Google</option>
                  <option value="other">Other</option>
                </select>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-xs text-muted">Service name</label>
                <input
                  type="text"
                  value={serviceName}
                  onChange={(e) => setServiceName(e.target.value)}
                  placeholder="e.g., Work GitLab"
                  className="h-9 rounded border border-border bg-dominant px-3 text-sm text-primary-text placeholder:text-muted focus:border-accent focus:outline-none"
                />
              </div>

              {renderCredentialFields()}

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={handleCredentialSave}
                  disabled={credSaving || !serviceName}
                  className="h-9 rounded bg-accent px-4 text-sm font-semibold text-white hover:bg-accent/90 disabled:opacity-50"
                >
                  {credSaving ? "Saving..." : "Save credential"}
                </button>
              </div>
            </div>

            <div className="mt-4 flex items-center justify-between">
              <button
                type="button"
                onClick={finishWizard}
                className="text-sm text-muted hover:text-primary-text"
              >
                Skip for now
              </button>
              <button
                type="button"
                onClick={finishWizard}
                className="h-9 rounded bg-accent px-4 text-sm font-semibold text-white hover:bg-accent/90"
              >
                Start using Locus
              </button>
            </div>
          </WizardStep>
        </div>
      </div>
    </div>
  );
}
