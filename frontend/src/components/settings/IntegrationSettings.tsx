import { useEffect } from "react";
import { Plus } from "lucide-react";
import { useWorkerStore } from "../../stores/workerStore";
import { WorkerCard } from "./WorkerCard";

export function IntegrationSettings() {
  const { workers, loading, fetchWorkers } = useWorkerStore();

  useEffect(() => {
    fetchWorkers();
  }, [fetchWorkers]);

  function handleNewIntegration() {
    window.dispatchEvent(new CustomEvent("open-integrator"));
  }

  if (loading && workers.length === 0) {
    return (
      <div>
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-primary-text">
              Integrations
            </h3>
            <p className="mt-1 text-xs text-muted">
              Manage integration workers that feed data into Locus.
            </p>
          </div>
        </div>
        <div className="flex flex-col gap-6">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-20 animate-pulse rounded-lg border border-border bg-dominant"
            />
          ))}
        </div>
      </div>
    );
  }

  if (workers.length === 0) {
    return (
      <div>
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-primary-text">
              Integrations
            </h3>
            <p className="mt-1 text-xs text-muted">
              Manage integration workers that feed data into Locus.
            </p>
          </div>
        </div>
        <div className="flex flex-col items-center py-8 text-center">
          <p className="text-sm font-semibold text-primary-text">
            No integrations configured
          </p>
          <p className="mt-2 max-w-xs text-xs text-muted">
            Build your first integration with Claude. Describe what you want to
            connect and Claude will create a worker for you.
          </p>
          <button
            type="button"
            onClick={handleNewIntegration}
            className="mt-4 flex h-9 items-center gap-2 rounded bg-accent px-4 text-sm font-semibold text-white hover:bg-accent/90"
          >
            <Plus size={16} />
            New Integration
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-primary-text">
            Integrations
          </h3>
          <p className="mt-1 text-xs text-muted">
            Manage integration workers that feed data into Locus.
          </p>
        </div>
        <button
          type="button"
          onClick={handleNewIntegration}
          className="flex h-9 items-center gap-2 rounded bg-accent px-4 text-sm font-semibold text-white hover:bg-accent/90"
        >
          <Plus size={16} />
          New Integration
        </button>
      </div>
      <div className="flex flex-col gap-6">
        {workers.map((worker) => (
          <WorkerCard key={worker.id} worker={worker} />
        ))}
      </div>
    </div>
  );
}
