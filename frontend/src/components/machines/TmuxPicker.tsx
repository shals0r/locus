import { useEffect, useState } from "react";
import { apiGet, apiPost } from "../../hooks/useApi";

interface TmuxSession {
  name: string;
  attached: boolean;
  last_activity: string;
}

interface TmuxPickerProps {
  machineId: string;
  onSelect: (sessionName: string) => void;
  onClose: () => void;
}

export function TmuxPicker({ machineId, onSelect, onClose }: TmuxPickerProps) {
  const [sessions, setSessions] = useState<TmuxSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    apiGet<{ sessions: TmuxSession[] }>(
      `/api/machines/${machineId}/tmux-sessions`,
    )
      .then((data) => {
        if (data.sessions.length === 0) {
          // Auto-create new tmux session if none found
          handleCreate();
        } else {
          setSessions(data.sessions);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [machineId]);

  async function handleCreate() {
    setCreating(true);
    try {
      const result = await apiPost<{ session_name: string }>(
        `/api/machines/${machineId}/tmux-sessions`,
        {},
      );
      onSelect(result.session_name);
    } catch {
      setCreating(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-md rounded-lg border border-border bg-secondary p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-primary-text">
            Tmux Sessions
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-muted hover:text-primary-text"
          >
            &times;
          </button>
        </div>

        {loading ? (
          <p className="text-sm text-muted">Loading tmux sessions...</p>
        ) : (
          <div className="flex flex-col gap-2">
            {sessions.map((session) => (
              <button
                key={session.name}
                type="button"
                onClick={() => onSelect(session.name)}
                className="flex items-center justify-between rounded border border-border bg-dominant px-4 py-3 text-left hover:bg-hover"
              >
                <div>
                  <p className="text-sm font-semibold text-primary-text">
                    {session.name}
                  </p>
                  <p className="text-xs text-muted">
                    {session.last_activity}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {session.attached && (
                    <span className="text-xs text-success">Attached</span>
                  )}
                  <span className="text-xs text-accent">Attach</span>
                </div>
              </button>
            ))}
          </div>
        )}

        <button
          type="button"
          onClick={handleCreate}
          disabled={creating}
          className="mt-4 h-9 w-full rounded bg-accent text-sm font-semibold text-white hover:bg-accent/90 disabled:opacity-50"
        >
          {creating ? "Creating..." : "Create new session"}
        </button>
      </div>
    </div>
  );
}
