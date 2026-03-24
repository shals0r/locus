import { useEffect, useState } from "react";
import { apiGet } from "../../hooks/useApi";

interface Repo {
  path: string;
  name: string;
}

interface RepoPickerProps {
  machineId: string;
  onSelect: (repoPath: string | null) => void;
  onClose: () => void;
}

export function RepoPicker({ machineId, onSelect, onClose }: RepoPickerProps) {
  const [repos, setRepos] = useState<Repo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiGet<Repo[]>(`/api/machines/${machineId}/repos`)
      .then(setRepos)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [machineId]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-md rounded-lg border border-border bg-secondary p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-primary-text">
            Select Repository
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
          <p className="text-sm text-muted">Loading repos...</p>
        ) : (
          <div className="flex max-h-64 flex-col gap-1 overflow-y-auto">
            {repos.map((repo) => (
              <button
                key={repo.path}
                type="button"
                onClick={() => onSelect(repo.path)}
                className="flex flex-col rounded px-4 py-2 text-left hover:bg-hover"
              >
                <span className="text-sm font-semibold text-primary-text">
                  {repo.name}
                </span>
                <span className="text-xs text-muted">{repo.path}</span>
              </button>
            ))}
          </div>
        )}

        <button
          type="button"
          onClick={() => onSelect(null)}
          className="mt-4 h-9 w-full rounded border border-border text-sm text-primary-text hover:bg-hover"
        >
          Open plain shell
        </button>
      </div>
    </div>
  );
}
