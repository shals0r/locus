/**
 * Overlay banner shown on terminal when SSH connection is lost.
 *
 * Reconnecting state: auto-reconnecting with spinner.
 * Failed state: all retries exhausted, manual "Reconnect" button.
 */
export function ConnectionBanner({
  status,
  machineName,
  onReconnect,
}: {
  status: "reconnecting" | "failed";
  machineName: string;
  onReconnect: () => void;
}) {
  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/70">
      <div className="flex flex-col items-center gap-3 rounded-lg border border-border bg-secondary px-6 py-5 text-center shadow-lg">
        {status === "reconnecting" && (
          <>
            {/* Spinner */}
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-muted border-t-accent" />
            <p className="text-sm text-primary-text">
              Connection lost. Reconnecting...
            </p>
          </>
        )}

        {status === "failed" && (
          <>
            <div className="h-5 w-5 rounded-full bg-error" />
            <p className="text-sm text-primary-text">
              Could not reconnect to {machineName}.
            </p>
            <button
              onClick={onReconnect}
              className="mt-1 rounded bg-accent px-4 py-1.5 text-sm font-medium text-white hover:bg-accent/80 transition-colors"
            >
              Reconnect
            </button>
          </>
        )}
      </div>
    </div>
  );
}
