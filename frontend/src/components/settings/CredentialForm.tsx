import { useState } from "react";
import { apiPost } from "../../hooks/useApi";

type ServiceType = "gitlab" | "github" | "jira" | "google" | "other";

interface CredentialFormProps {
  onSuccess?: () => void;
}

export function CredentialForm({ onSuccess }: CredentialFormProps) {
  const [serviceType, setServiceType] = useState<ServiceType>("gitlab");
  const [serviceName, setServiceName] = useState("");
  const [data, setData] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");

    try {
      await apiPost("/api/settings/credentials", {
        service_type: serviceType,
        service_name: serviceName,
        data,
      });
      onSuccess?.();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to save credential",
      );
    } finally {
      setSaving(false);
    }
  }

  function renderFields() {
    switch (serviceType) {
      case "gitlab":
      case "github":
        return (
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted">Access token</label>
            <input
              type="password"
              value={data.token ?? ""}
              onChange={(e) => setData({ ...data, token: e.target.value })}
              placeholder="Token"
              className="h-9 rounded border border-border bg-dominant px-3 text-sm text-primary-text placeholder:text-muted focus:border-accent focus:outline-none"
            />
          </div>
        );
      case "jira":
        return (
          <>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-muted">Email</label>
              <input
                type="text"
                value={data.email ?? ""}
                onChange={(e) => setData({ ...data, email: e.target.value })}
                placeholder="user@example.com"
                className="h-9 rounded border border-border bg-dominant px-3 text-sm text-primary-text placeholder:text-muted focus:border-accent focus:outline-none"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-muted">API token</label>
              <input
                type="password"
                value={data.api_token ?? ""}
                onChange={(e) =>
                  setData({ ...data, api_token: e.target.value })
                }
                placeholder="API token"
                className="h-9 rounded border border-border bg-dominant px-3 text-sm text-primary-text placeholder:text-muted focus:border-accent focus:outline-none"
              />
            </div>
          </>
        );
      case "google":
        return (
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted">Credentials JSON</label>
            <textarea
              value={data.credentials_json ?? ""}
              onChange={(e) =>
                setData({ ...data, credentials_json: e.target.value })
              }
              placeholder="Paste credentials JSON"
              rows={4}
              className="rounded border border-border bg-dominant px-3 py-2 text-sm text-primary-text placeholder:text-muted focus:border-accent focus:outline-none"
            />
          </div>
        );
      case "other":
        return (
          <>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-muted">Key</label>
              <input
                type="text"
                value={data.key ?? ""}
                onChange={(e) => setData({ ...data, key: e.target.value })}
                placeholder="Key"
                className="h-9 rounded border border-border bg-dominant px-3 text-sm text-primary-text placeholder:text-muted focus:border-accent focus:outline-none"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-muted">Value</label>
              <input
                type="password"
                value={data.value ?? ""}
                onChange={(e) => setData({ ...data, value: e.target.value })}
                placeholder="Value"
                className="h-9 rounded border border-border bg-dominant px-3 text-sm text-primary-text placeholder:text-muted focus:border-accent focus:outline-none"
              />
            </div>
          </>
        );
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <label className="text-xs text-muted">Service type</label>
        <select
          value={serviceType}
          onChange={(e) => {
            setServiceType(e.target.value as ServiceType);
            setData({});
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
          required
          className="h-9 rounded border border-border bg-dominant px-3 text-sm text-primary-text placeholder:text-muted focus:border-accent focus:outline-none"
        />
      </div>

      {renderFields()}

      {error && <p className="text-sm text-error">{error}</p>}

      <button
        type="submit"
        disabled={saving || !serviceName}
        className="h-9 rounded bg-accent text-sm font-semibold text-white hover:bg-accent/90 disabled:opacity-50"
      >
        {saving ? "Saving..." : "Save"}
      </button>
    </form>
  );
}
