import { useEffect, useState } from "react";
import { apiGet, apiPut, apiPost } from "../../hooks/useApi";
import { useMachineStore } from "../../stores/machineStore";

type AuthType = "api_key" | "oauth";

interface ClaudeCodeConfig {
  type: string;
  masked_key: string;
}

export function ClaudeCodeSettings() {
  const machines = useMachineStore((s) => s.machines);
  const [config, setConfig] = useState<ClaudeCodeConfig | null>(null);
  const [authType, setAuthType] = useState<AuthType>("api_key");
  const [apiKey, setApiKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [pushingTo, setPushingTo] = useState<string | null>(null);
  const [pushResult, setPushResult] = useState<
    Record<string, { success: boolean; message: string }>
  >({});

  useEffect(() => {
    apiGet<ClaudeCodeConfig>("/api/settings/claude-code")
      .then((data) => {
        setConfig(data);
        if (data.type) {
          setAuthType(data.type as AuthType);
        }
      })
      .catch(() => {});
  }, []);

  async function handleSave() {
    setSaving(true);
    try {
      const payload =
        authType === "api_key"
          ? { type: "api_key", api_key: apiKey }
          : { type: "oauth" };

      await apiPut("/api/settings/claude-code", payload);
      // Reload config
      const data = await apiGet<ClaudeCodeConfig>("/api/settings/claude-code");
      setConfig(data);
      setApiKey("");
    } catch {
      // Error handling silently
    } finally {
      setSaving(false);
    }
  }

  async function handlePush(machineId: string) {
    setPushingTo(machineId);
    try {
      const result = await apiPost<{ success: boolean; message: string }>(
        `/api/settings/claude-code/push/${machineId}`,
        {},
      );
      setPushResult((prev) => ({ ...prev, [machineId]: result }));
    } catch (err) {
      setPushResult((prev) => ({
        ...prev,
        [machineId]: {
          success: false,
          message: err instanceof Error ? err.message : "Push failed",
        },
      }));
    } finally {
      setPushingTo(null);
    }
  }

  const isConfigured = config?.type && config.type !== "";

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted">Status:</span>
        <span
          className={`text-sm ${isConfigured ? "text-success" : "text-warning"}`}
        >
          {isConfigured ? "Configured" : "Unconfigured"}
        </span>
        {config?.masked_key && (
          <span className="text-xs text-muted">({config.masked_key})</span>
        )}
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs text-muted">Auth type</label>
        <select
          value={authType}
          onChange={(e) => setAuthType(e.target.value as AuthType)}
          className="h-9 rounded border border-border bg-dominant px-3 text-sm text-primary-text focus:border-accent focus:outline-none"
        >
          <option value="api_key">API Key</option>
          <option value="oauth">OAuth</option>
        </select>
      </div>

      {authType === "api_key" && (
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted">API Key</label>
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="sk-ant-..."
            className="h-9 rounded border border-border bg-dominant px-3 text-sm text-primary-text placeholder:text-muted focus:border-accent focus:outline-none"
          />
        </div>
      )}

      <button
        type="button"
        onClick={handleSave}
        disabled={saving || (authType === "api_key" && !apiKey)}
        className="h-9 w-fit rounded bg-accent px-4 text-sm font-semibold text-white hover:bg-accent/90 disabled:opacity-50"
      >
        {saving ? "Saving..." : "Save"}
      </button>

      {isConfigured && machines.length > 0 && (
        <div className="mt-2 border-t border-border pt-4">
          <p className="mb-2 text-sm text-muted">Push to machine</p>
          <div className="flex flex-col gap-2">
            {machines.map((machine) => (
              <div
                key={machine.id}
                className="flex items-center justify-between rounded border border-border bg-dominant px-3 py-2"
              >
                <span className="text-sm text-primary-text">
                  {machine.name}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handlePush(machine.id)}
                    disabled={pushingTo === machine.id}
                    className="h-7 rounded border border-border px-3 text-xs text-primary-text hover:bg-hover disabled:opacity-50"
                  >
                    {pushingTo === machine.id ? "Pushing..." : "Push"}
                  </button>
                  {pushResult[machine.id] && (
                    <span
                      className={`text-xs ${
                        pushResult[machine.id]?.success
                          ? "text-success"
                          : "text-error"
                      }`}
                    >
                      {pushResult[machine.id]?.message}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
