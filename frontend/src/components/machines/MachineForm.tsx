import { useState } from "react";
import { apiPost } from "../../hooks/useApi";
import { useMachineStore } from "../../stores/machineStore";
import type { Machine } from "../../types";

interface MachineFormProps {
  onSuccess?: (machine: Machine) => void;
  initialData?: Partial<Machine>;
  mode?: "create" | "edit";
}

interface TestResult {
  success: boolean;
  message: string;
  tmux_sessions?: string[];
}

export function MachineForm({
  onSuccess,
  initialData,
  mode = "create",
}: MachineFormProps) {
  const addMachine = useMachineStore((s) => s.addMachine);

  const [name, setName] = useState(initialData?.name ?? "");
  const [host, setHost] = useState(initialData?.host ?? "");
  const [port, setPort] = useState(initialData?.port ?? 22);
  const [username, setUsername] = useState(initialData?.username ?? "");
  const [sshKeyPath, setSshKeyPath] = useState(
    initialData?.ssh_key_path ?? "",
  );
  const [repoScanPaths, setRepoScanPaths] = useState(
    initialData?.repo_scan_paths?.join(", ") ?? "",
  );

  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function handleTestConnection() {
    setTesting(true);
    setTestResult(null);

    try {
      const result = await apiPost<TestResult>(
        "/api/machines/test-connection",
        { host, port, username, ssh_key_path: sshKeyPath },
      );
      setTestResult(result);
    } catch (err) {
      setTestResult({
        success: false,
        message:
          err instanceof Error ? err.message : "Connection test failed",
      });
    } finally {
      setTesting(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);

    try {
      const payload = {
        name,
        host,
        port,
        username,
        ssh_key_path: sshKeyPath,
        repo_scan_paths: repoScanPaths
          .split(",")
          .map((p) => p.trim())
          .filter(Boolean),
      };

      const machine = await apiPost<Machine>("/api/machines", payload);
      addMachine(machine);
      onSuccess?.(machine);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to add machine",
      );
    } finally {
      setSubmitting(false);
    }
  }

  const isValid = name && host && username && sshKeyPath;

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <label className="text-xs text-muted">Name</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="my-server"
          required
          className="h-9 rounded border border-border bg-dominant px-3 text-sm text-primary-text placeholder:text-muted focus:border-accent focus:outline-none"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs text-muted">Host</label>
        <input
          type="text"
          value={host}
          onChange={(e) => setHost(e.target.value)}
          placeholder="192.168.1.100"
          required
          className="h-9 rounded border border-border bg-dominant px-3 text-sm text-primary-text placeholder:text-muted focus:border-accent focus:outline-none"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs text-muted">Port</label>
        <input
          type="number"
          value={port}
          onChange={(e) => setPort(Number(e.target.value))}
          className="h-9 rounded border border-border bg-dominant px-3 text-sm text-primary-text focus:border-accent focus:outline-none"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs text-muted">Username</label>
        <input
          type="text"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="root"
          required
          className="h-9 rounded border border-border bg-dominant px-3 text-sm text-primary-text placeholder:text-muted focus:border-accent focus:outline-none"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs text-muted">SSH Key Path</label>
        <input
          type="text"
          value={sshKeyPath}
          onChange={(e) => setSshKeyPath(e.target.value)}
          placeholder="~/.ssh/id_ed25519"
          required
          className="h-9 rounded border border-border bg-dominant px-3 text-sm text-primary-text placeholder:text-muted focus:border-accent focus:outline-none"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs text-muted">
          Repo Scan Paths (comma-separated)
        </label>
        <input
          type="text"
          value={repoScanPaths}
          onChange={(e) => setRepoScanPaths(e.target.value)}
          placeholder="~/projects, ~/work"
          className="h-9 rounded border border-border bg-dominant px-3 text-sm text-primary-text placeholder:text-muted focus:border-accent focus:outline-none"
        />
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleTestConnection}
          disabled={testing || !host || !username || !sshKeyPath}
          className="h-9 rounded border border-border px-4 text-sm text-primary-text hover:bg-hover disabled:opacity-50"
        >
          {testing ? "Testing..." : "Test connection"}
        </button>

        {testResult && (
          <span
            className={`text-sm ${
              testResult.success ? "text-success" : "text-error"
            }`}
          >
            {testResult.success
              ? "Connected successfully."
              : `Connection test failed: ${testResult.message}`}
          </span>
        )}
      </div>

      {error && <p className="text-sm text-error">{error}</p>}

      <button
        type="submit"
        disabled={submitting || !isValid}
        className="h-9 rounded bg-accent text-sm font-semibold text-white hover:bg-accent/90 disabled:opacity-50"
      >
        {submitting
          ? "Saving..."
          : mode === "edit"
            ? "Save"
            : "Add Machine"}
      </button>
    </form>
  );
}
