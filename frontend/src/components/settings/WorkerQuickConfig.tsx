import { useState, useEffect, useRef, type RefObject } from "react";
import { useWorkerStore, type Worker } from "../../stores/workerStore";
import { apiGet } from "../../hooks/useApi";

interface Credential {
  id: string;
  service_name: string;
  service_type: string;
}

interface WorkerQuickConfigProps {
  worker: Worker;
  open: boolean;
  onClose: () => void;
  anchorRef: RefObject<HTMLButtonElement | null>;
}

export function WorkerQuickConfig({
  worker,
  open,
  onClose,
  anchorRef,
}: WorkerQuickConfigProps) {
  const { updateWorkerConfig, stopWorker, enableWorker } = useWorkerStore();
  const [pollMinutes, setPollMinutes] = useState(
    Math.round(worker.poll_interval_seconds / 60),
  );
  const [credentialId, setCredentialId] = useState(worker.credential_id ?? "");
  const [isEnabled, setIsEnabled] = useState(worker.is_enabled);
  const [credentials, setCredentials] = useState<Credential[]>([]);
  const popoverRef = useRef<HTMLDivElement>(null);

  // Fetch available credentials
  useEffect(() => {
    if (open) {
      apiGet<Credential[]>("/api/settings/credentials")
        .then(setCredentials)
        .catch(() => {});
    }
  }, [open]);

  // Click outside to close
  useEffect(() => {
    if (!open) return;

    function handleClickOutside(e: MouseEvent) {
      const target = e.target as Node;
      if (
        popoverRef.current &&
        !popoverRef.current.contains(target) &&
        anchorRef.current &&
        !anchorRef.current.contains(target)
      ) {
        onClose();
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open, onClose, anchorRef]);

  if (!open) return null;

  async function handleApply() {
    // Handle enabled toggle side effects
    if (!isEnabled && worker.is_enabled) {
      await stopWorker(worker.id);
    } else if (isEnabled && !worker.is_enabled) {
      await enableWorker(worker.id);
    }

    await updateWorkerConfig(worker.id, {
      poll_interval_seconds: pollMinutes * 60,
      credential_id: credentialId || null,
      is_enabled: isEnabled,
    });
    onClose();
  }

  return (
    <div
      ref={popoverRef}
      className="absolute right-4 top-12 z-50 w-[280px] rounded-lg border border-border bg-dominant p-4 shadow-lg"
    >
      {/* Poll interval */}
      <div className="mb-3">
        <label className="mb-1 block text-xs text-muted">Poll every</label>
        <div className="flex items-center gap-2">
          <input
            type="number"
            min={1}
            step={1}
            value={pollMinutes}
            onChange={(e) => setPollMinutes(Number(e.target.value))}
            className="h-8 w-20 rounded border border-border bg-secondary px-2 text-sm text-primary-text focus:border-accent focus:outline-none"
          />
          <span className="text-xs text-muted">minutes</span>
        </div>
      </div>

      {/* Credential picker */}
      <div className="mb-3">
        <label className="mb-1 block text-xs text-muted">Credential</label>
        <select
          value={credentialId}
          onChange={(e) => setCredentialId(e.target.value)}
          className="h-8 w-full rounded border border-border bg-secondary px-2 text-sm text-primary-text focus:border-accent focus:outline-none"
        >
          <option value="">None</option>
          {credentials.map((cred) => (
            <option key={cred.id} value={cred.id}>
              {cred.service_name} ({cred.service_type})
            </option>
          ))}
        </select>
      </div>

      {/* Enabled toggle */}
      <div className="mb-4 flex items-center justify-between">
        <label className="text-xs text-muted">Enabled</label>
        <button
          type="button"
          role="switch"
          aria-checked={isEnabled}
          onClick={() => setIsEnabled((v) => !v)}
          className={`relative h-5 w-9 rounded-full transition-colors ${
            isEnabled ? "bg-accent" : "bg-border"
          }`}
        >
          <span
            className={`absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white transition-transform ${
              isEnabled ? "translate-x-4" : "translate-x-0"
            }`}
          />
        </button>
      </div>

      {/* Apply button */}
      <button
        type="button"
        onClick={handleApply}
        className="h-8 w-full rounded bg-accent text-sm font-semibold text-white hover:bg-accent/90"
      >
        Apply Config
      </button>
    </div>
  );
}
