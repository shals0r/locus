import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { FolderOpen, Plus, X, Save, Loader2 } from "lucide-react";
import { apiGet, apiPut } from "../../hooks/useApi";

interface GeneralSettingsData {
  local_repo_scan_paths: string[];
}

export function GeneralSettings() {
  const [paths, setPaths] = useState<string[]>([]);
  const [newPath, setNewPath] = useState("");
  const [dirty, setDirty] = useState(false);
  const [saved, setSaved] = useState(false);
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["settings", "general"],
    queryFn: () => apiGet<GeneralSettingsData>("/api/settings/general"),
  });

  useEffect(() => {
    if (data) {
      setPaths(data.local_repo_scan_paths);
      setDirty(false);
    }
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: (newPaths: string[]) =>
      apiPut<GeneralSettingsData>("/api/settings/general", {
        local_repo_scan_paths: newPaths,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["settings", "general"] });
      setDirty(false);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    },
  });

  const addPath = () => {
    const trimmed = newPath.trim();
    if (trimmed && !paths.includes(trimmed)) {
      setPaths([...paths, trimmed]);
      setNewPath("");
      setDirty(true);
    }
  };

  const removePath = (index: number) => {
    setPaths(paths.filter((_, i) => i !== index));
    setDirty(true);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      addPath();
    }
  };

  const handleSave = () => {
    saveMutation.mutate(paths);
  };

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading settings...
      </div>
    );
  }

  return (
    <div>
      <div className="mb-3 flex items-center gap-2">
        <FolderOpen className="h-4 w-4 text-muted" />
        <span className="text-sm font-medium text-primary-text">
          Local Repository Scan Paths
        </span>
      </div>

      <p className="mb-3 text-xs text-muted">
        Absolute paths to directories containing git repos. Locus will scan
        these directories (up to 2 levels deep) to discover repositories.
      </p>

      {/* Current paths */}
      {paths.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-2">
          {paths.map((path, index) => (
            <div
              key={path}
              className="flex items-center gap-1 rounded border border-border bg-dominant px-3 py-1.5"
            >
              <span className="text-xs text-primary-text">{path}</span>
              <button
                type="button"
                onClick={() => removePath(index)}
                className="ml-1 text-muted hover:text-destructive"
                aria-label={`Remove ${path}`}
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Add path input */}
      <div className="flex gap-2">
        <input
          type="text"
          value={newPath}
          onChange={(e) => setNewPath(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="e.g., C:\Users\you\projects or /home/you/projects"
          className="flex-1 rounded border border-border bg-dominant px-3 py-2 text-xs text-primary-text placeholder:text-muted focus:border-accent focus:outline-none"
        />
        <button
          type="button"
          onClick={addPath}
          disabled={!newPath.trim()}
          className="flex items-center gap-1 rounded border border-border px-3 py-2 text-xs text-primary-text hover:bg-hover disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Plus className="h-3 w-3" />
          Add
        </button>
      </div>

      {/* Save button + status */}
      <div className="mt-4 flex items-center gap-3">
        {dirty && (
          <button
            type="button"
            onClick={handleSave}
            disabled={saveMutation.isPending}
            className="flex items-center gap-2 rounded bg-accent px-4 py-2 text-xs font-semibold text-white hover:bg-accent/90 disabled:opacity-50"
          >
            {saveMutation.isPending ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Save className="h-3 w-3" />
            )}
            Save
          </button>
        )}
        {saved && (
          <span className="text-xs text-success">Saved</span>
        )}
        {saveMutation.isError && (
          <span className="text-xs text-error">
            Failed to save settings
          </span>
        )}
      </div>
    </div>
  );
}
