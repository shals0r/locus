import { useEffect, useState } from "react";
import { apiGet, apiPost, apiDelete } from "../../hooks/useApi";
import { CredentialForm } from "./CredentialForm";
import type { Credential } from "../../types";

export function CredentialSettings() {
  const [credentials, setCredentials] = useState<Credential[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<
    Record<string, { success: boolean; message: string }>
  >({});

  useEffect(() => {
    loadCredentials();
  }, []);

  function loadCredentials() {
    apiGet<Credential[]>("/api/settings/credentials")
      .then(setCredentials)
      .catch(() => {});
  }

  async function handleDelete(id: string) {
    try {
      await apiDelete(`/api/settings/credentials/${id}`);
      setCredentials((prev) => prev.filter((c) => c.id !== id));
      setDeleteConfirm(null);
    } catch {
      // Error handling silently
    }
  }

  async function handleTest(id: string) {
    setTestResults((prev) => ({
      ...prev,
      [id]: { success: false, message: "Testing..." },
    }));

    try {
      const result = await apiPost<{ success: boolean; message: string }>(
        `/api/settings/credentials/${id}/test`,
        {},
      );
      setTestResults((prev) => ({ ...prev, [id]: result }));
    } catch (err) {
      setTestResults((prev) => ({
        ...prev,
        [id]: {
          success: false,
          message: err instanceof Error ? err.message : "Test failed",
        },
      }));
    }
  }

  if (showForm) {
    return (
      <div>
        <CredentialForm
          onSuccess={() => {
            setShowForm(false);
            loadCredentials();
          }}
        />
        <button
          type="button"
          onClick={() => setShowForm(false)}
          className="mt-3 text-sm text-muted hover:text-primary-text"
        >
          Cancel
        </button>
      </div>
    );
  }

  return (
    <div>
      {credentials.length === 0 ? (
        <p className="text-sm text-muted">No credentials stored.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {credentials.map((cred) => (
            <div
              key={cred.id}
              className="flex items-center justify-between rounded border border-border bg-dominant px-4 py-3"
            >
              <div className="flex items-center gap-3">
                <span className="rounded bg-border px-2 py-0.5 text-xs text-primary-text">
                  {cred.service_type}
                </span>
                <span className="text-sm text-primary-text">
                  {cred.service_name}
                </span>
              </div>

              <div className="flex items-center gap-2">
                {deleteConfirm === cred.id ? (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-error">
                      This credential will be permanently removed.
                    </span>
                    <button
                      type="button"
                      onClick={() => handleDelete(cred.id)}
                      className="h-7 rounded bg-destructive px-3 text-xs text-white"
                    >
                      Confirm
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeleteConfirm(null)}
                      className="h-7 rounded border border-border px-3 text-xs text-muted"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => handleTest(cred.id)}
                      className="h-7 rounded border border-border px-3 text-xs text-primary-text hover:bg-hover"
                    >
                      Test
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeleteConfirm(cred.id)}
                      className="h-7 rounded border border-border px-3 text-xs text-destructive hover:bg-hover"
                    >
                      Delete
                    </button>
                  </>
                )}

                {testResults[cred.id] && (
                  <span
                    className={`text-xs ${
                      testResults[cred.id].success
                        ? "text-success"
                        : "text-error"
                    }`}
                  >
                    {testResults[cred.id].message}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <button
        type="button"
        onClick={() => setShowForm(true)}
        className="mt-4 h-9 rounded bg-accent px-4 text-sm font-semibold text-white hover:bg-accent/90"
      >
        Add Credential
      </button>
    </div>
  );
}
