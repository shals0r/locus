import { useState, useMemo } from "react";
import { Monitor, GitBranch, X, Loader2 } from "lucide-react";
import type { Task, Machine, RepoDetail } from "../../types";
import { useMachineStore } from "../../stores/machineStore";
import { useRepoStore } from "../../stores/repoStore";
import { useTaskStore } from "../../stores/taskStore";
import { useTransitionTask } from "../../hooks/useTaskQueries";

/** Sanitize a task title into a branch name. */
function toBranchName(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
}

interface StartFlowPickerProps {
  task: Task;
}

/**
 * Inline start flow picker: machine -> repo -> optional branch.
 * Shows below the task card when startFlowTaskId matches.
 */
export function StartFlowPicker({ task }: StartFlowPickerProps) {
  const machines = useMachineStore((s) => s.machines);
  const machineStatuses = useMachineStore((s) => s.machineStatuses);
  const repoMap = useRepoStore((s) => s.repos);
  const setStartFlowTaskId = useTaskStore((s) => s.setStartFlowTaskId);

  const transitionMutation = useTransitionTask();

  // Flow state
  const [selectedMachineId, setSelectedMachineId] = useState<string | null>(
    null,
  );
  const [selectedRepoPath, setSelectedRepoPath] = useState<string | null>(null);
  const [newBranch, setNewBranch] = useState("");
  const [useNewBranch, setUseNewBranch] = useState(false);

  // Available machines (only online or needs_setup ones)
  const availableMachines = useMemo(
    () =>
      machines.filter((m) => {
        const status =
          machineStatuses[m.id] ?? m.status;
        return status === "online";
      }),
    [machines, machineStatuses],
  );

  // Repos for selected machine
  const machineRepos: RepoDetail[] = useMemo(() => {
    if (!selectedMachineId) return [];
    return repoMap.get(selectedMachineId) ?? [];
  }, [selectedMachineId, repoMap]);

  const handleSelectMachine = (m: Machine) => {
    setSelectedMachineId(m.id);
    setSelectedRepoPath(null);
    setNewBranch(toBranchName(task.title));
    setUseNewBranch(false);
  };

  const handleSelectRepo = (repo: RepoDetail) => {
    setSelectedRepoPath(repo.repo_path);
  };

  const handleStart = () => {
    if (!selectedMachineId || !selectedRepoPath) return;

    const branch = useNewBranch && newBranch.trim() ? newBranch.trim() : undefined;

    transitionMutation.mutate(
      {
        id: task.id,
        status: "active",
        machine_id: selectedMachineId,
        repo_path: selectedRepoPath,
        branch,
      },
      {
        onSuccess: () => {
          setStartFlowTaskId(null);
        },
      },
    );
  };

  const handleCancel = () => {
    setStartFlowTaskId(null);
  };

  const selectedRepo = machineRepos.find(
    (r) => r.repo_path === selectedRepoPath,
  );

  return (
    <div className="border-t border-border bg-secondary px-3 py-2 space-y-2">
      {/* Step 1: Select machine */}
      {!selectedMachineId && (
        <div>
          <p className="text-[10px] font-semibold text-muted uppercase tracking-wide mb-1">
            Select machine
          </p>
          {availableMachines.length === 0 ? (
            <p className="text-xs text-muted italic">No online machines</p>
          ) : (
            <div className="space-y-0.5">
              {availableMachines.map((m) => (
                <button
                  key={m.id}
                  className="flex w-full items-center gap-1.5 rounded px-2 py-1 text-xs text-primary-text hover:bg-hover transition-colors"
                  onClick={() => handleSelectMachine(m)}
                >
                  <Monitor size={12} className="text-green-400 shrink-0" />
                  <span className="truncate">{m.name}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Step 2: Select repo */}
      {selectedMachineId && !selectedRepoPath && (
        <div>
          <p className="text-[10px] font-semibold text-muted uppercase tracking-wide mb-1">
            Select repo on{" "}
            {machines.find((m) => m.id === selectedMachineId)?.name ?? "machine"}
          </p>
          {machineRepos.length === 0 ? (
            <p className="text-xs text-muted italic">No repos found</p>
          ) : (
            <div className="space-y-0.5 max-h-[120px] overflow-y-auto">
              {machineRepos.map((r) => (
                <button
                  key={r.repo_path}
                  className="flex w-full items-center gap-1.5 rounded px-2 py-1 text-xs text-primary-text hover:bg-hover transition-colors"
                  onClick={() => handleSelectRepo(r)}
                >
                  <GitBranch size={12} className="text-accent shrink-0" />
                  <span className="truncate flex-1 text-left">{r.name}</span>
                  <span className="text-[10px] text-muted shrink-0">
                    {r.status.branch}
                  </span>
                </button>
              ))}
            </div>
          )}
          <button
            className="mt-1 text-[10px] text-muted hover:text-primary-text transition-colors"
            onClick={() => setSelectedMachineId(null)}
          >
            Back
          </button>
        </div>
      )}

      {/* Step 3: Optional branch + confirm */}
      {selectedMachineId && selectedRepoPath && (
        <div>
          <p className="text-[10px] font-semibold text-muted uppercase tracking-wide mb-1">
            Branch on {selectedRepo?.name ?? "repo"}
          </p>
          <div className="space-y-1.5">
            {/* Current branch option */}
            <label className="flex items-center gap-1.5 text-xs text-primary-text cursor-pointer">
              <input
                type="radio"
                name="branch"
                checked={!useNewBranch}
                onChange={() => setUseNewBranch(false)}
                className="accent-accent"
              />
              <span>
                Use current:{" "}
                <span className="text-accent">
                  {selectedRepo?.status.branch ?? "main"}
                </span>
              </span>
            </label>

            {/* New branch option */}
            <label className="flex items-center gap-1.5 text-xs text-primary-text cursor-pointer">
              <input
                type="radio"
                name="branch"
                checked={useNewBranch}
                onChange={() => setUseNewBranch(true)}
                className="accent-accent"
              />
              <span>New branch</span>
            </label>

            {useNewBranch && (
              <input
                type="text"
                value={newBranch}
                onChange={(e) => setNewBranch(e.target.value)}
                placeholder="branch-name"
                className="w-full rounded border border-border bg-dominant px-2 py-1 text-xs text-primary-text outline-none focus:border-accent"
              />
            )}

            {/* Actions */}
            <div className="flex items-center gap-2 pt-1">
              <button
                className="rounded bg-accent px-2.5 py-1 text-xs font-medium text-white hover:bg-accent/90 transition-colors disabled:opacity-50"
                onClick={handleStart}
                disabled={transitionMutation.isPending}
              >
                {transitionMutation.isPending ? (
                  <Loader2 size={12} className="animate-spin" />
                ) : (
                  "Start session"
                )}
              </button>
              <button
                className="text-xs text-muted hover:text-primary-text transition-colors"
                onClick={handleCancel}
              >
                Cancel
              </button>
              <button
                className="text-xs text-muted hover:text-primary-text transition-colors ml-auto"
                onClick={() => setSelectedRepoPath(null)}
              >
                Back
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cancel always visible if nothing selected */}
      {!selectedMachineId && (
        <div className="flex justify-end">
          <button
            className="text-xs text-muted hover:text-primary-text transition-colors"
            onClick={handleCancel}
          >
            <X size={12} className="inline mr-0.5" />
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}
