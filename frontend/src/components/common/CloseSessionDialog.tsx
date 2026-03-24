import { useEffect, useRef } from "react";

export function CloseSessionDialog({
  open,
  sessionName,
  onDetach,
  onKill,
  onCancel,
}: {
  open: boolean;
  sessionName: string;
  onDetach: () => void;
  onKill: () => void;
  onCancel: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    else if (!open && el.open) el.close();
  }, [open]);

  if (!open) return null;

  return (
    <dialog
      ref={dialogRef}
      onClose={onCancel}
      className="fixed inset-0 z-50 m-auto w-80 rounded-lg border border-border bg-dominant p-0 text-primary-text shadow-xl backdrop:bg-black/50"
    >
      <div className="p-4">
        <h3 className="text-sm font-medium">Close session</h3>
        <p className="mt-2 text-xs text-muted">
          <span className="font-mono">{sessionName}</span>
        </p>
        <div className="mt-4 flex flex-col gap-2">
          <button
            onClick={onDetach}
            className="w-full rounded border border-border px-3 py-1.5 text-xs text-primary-text hover:bg-hover transition-colors"
          >
            Detach
            <span className="ml-1 text-muted">- hide tab, tmux stays alive</span>
          </button>
          <button
            onClick={onKill}
            className="w-full rounded bg-red-600 px-3 py-1.5 text-xs text-white hover:bg-red-700 transition-colors"
          >
            Kill
            <span className="ml-1 text-red-200">- permanently destroy session</span>
          </button>
        </div>
        <button
          onClick={onCancel}
          className="mt-3 w-full rounded px-3 py-1 text-xs text-muted hover:text-primary-text transition-colors"
        >
          Cancel
        </button>
      </div>
    </dialog>
  );
}
