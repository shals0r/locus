import { useEffect, useState } from "react";
import { useMachineStore } from "../../stores/machineStore";
import { apiGet, apiDelete } from "../../hooks/useApi";
import { MachineForm } from "../machines/MachineForm";
import type { Machine } from "../../types";

export function MachineSettings() {
  const machines = useMachineStore((s) => s.machines);
  const setMachines = useMachineStore((s) => s.setMachines);
  const removeMachine = useMachineStore((s) => s.removeMachine);

  const [showForm, setShowForm] = useState(false);
  const [editMachine, setEditMachine] = useState<Machine | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  useEffect(() => {
    apiGet<Machine[]>("/api/machines")
      .then(setMachines)
      .catch(() => {});
  }, [setMachines]);

  async function handleDelete(machine: Machine) {
    try {
      await apiDelete(`/api/machines/${machine.id}`);
      removeMachine(machine.id);
      setDeleteConfirm(null);
    } catch {
      // Error handling silently
    }
  }

  if (showForm || editMachine) {
    return (
      <div>
        <MachineForm
          mode={editMachine ? "edit" : "create"}
          initialData={editMachine ?? undefined}
          onSuccess={() => {
            setShowForm(false);
            setEditMachine(null);
            apiGet<Machine[]>("/api/machines")
              .then(setMachines)
              .catch(() => {});
          }}
        />
        <button
          type="button"
          onClick={() => {
            setShowForm(false);
            setEditMachine(null);
          }}
          className="mt-3 text-sm text-muted hover:text-primary-text"
        >
          Cancel
        </button>
      </div>
    );
  }

  return (
    <div>
      {machines.length === 0 ? (
        <p className="text-sm text-muted">No machines configured.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {machines.map((machine) => (
            <div
              key={machine.id}
              className="flex items-center justify-between rounded border border-border bg-dominant px-4 py-3"
            >
              <div className="flex items-center gap-3">
                <span
                  className={`h-2 w-2 rounded-full ${
                    machine.status === "online"
                      ? "bg-success"
                      : machine.status === "reconnecting"
                        ? "bg-warning"
                        : "bg-error"
                  }`}
                />
                <div>
                  <p className="text-sm font-semibold text-primary-text">
                    {machine.name}
                  </p>
                  <p className="text-xs text-muted">
                    {machine.username}@{machine.host}:{machine.port}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {deleteConfirm === machine.id ? (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-error">
                      This will close all active sessions on this machine. This
                      cannot be undone.
                    </span>
                    <button
                      type="button"
                      onClick={() => handleDelete(machine)}
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
                      onClick={() => setEditMachine(machine)}
                      className="h-7 rounded border border-border px-3 text-xs text-primary-text hover:bg-hover"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeleteConfirm(machine.id)}
                      className="h-7 rounded border border-border px-3 text-xs text-destructive hover:bg-hover"
                    >
                      Delete
                    </button>
                  </>
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
        Add Machine
      </button>
    </div>
  );
}
