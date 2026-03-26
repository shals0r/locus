import { useState } from "react";
import { ArrowDownToLine, ArrowUpFromLine, RefreshCw, Check, X } from "lucide-react";
import { useGitOp } from "../../hooks/useGitStatus";

interface GitOperationsProps {
  machineId: string;
  repoPath: string;
}

type OpStatus = "idle" | "loading" | "success" | "error";

interface OpState {
  fetch: OpStatus;
  pull: OpStatus;
  push: OpStatus;
}

export function GitOperations({ machineId, repoPath }: GitOperationsProps) {
  const gitOp = useGitOp();
  const [opStates, setOpStates] = useState<OpState>({
    fetch: "idle",
    pull: "idle",
    push: "idle",
  });
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const runOp = async (operation: "fetch" | "pull" | "push") => {
    setOpStates((s) => ({ ...s, [operation]: "loading" }));
    setErrorMsg(null);

    try {
      await gitOp.mutateAsync({
        operation,
        machineId,
        repoPath,
      });
      setOpStates((s) => ({ ...s, [operation]: "success" }));
      // Reset success indicator after 2s
      setTimeout(() => {
        setOpStates((s) => ({ ...s, [operation]: "idle" }));
      }, 2000);
    } catch (err) {
      setOpStates((s) => ({ ...s, [operation]: "error" }));
      setErrorMsg(err instanceof Error ? err.message : "Operation failed");
      // Reset error indicator after 3s
      setTimeout(() => {
        setOpStates((s) => ({ ...s, [operation]: "idle" }));
        setErrorMsg(null);
      }, 3000);
    }
  };

  const renderIcon = (
    operation: "fetch" | "pull" | "push",
    IdleIcon: typeof RefreshCw,
  ) => {
    const status = opStates[operation];

    if (status === "loading") {
      return <RefreshCw size={11} className="animate-spin text-accent" />;
    }
    if (status === "success") {
      return <Check size={11} className="text-success" />;
    }
    if (status === "error") {
      return <X size={11} className="text-error" />;
    }
    return <IdleIcon size={11} />;
  };

  return (
    <div className="flex items-center gap-0.5">
      <button
        onClick={(e) => {
          e.stopPropagation();
          runOp("fetch");
        }}
        disabled={opStates.fetch === "loading"}
        className="rounded p-0.5 text-muted hover:bg-hover hover:text-primary-text transition-colors disabled:opacity-50"
        title={errorMsg && opStates.fetch === "error" ? errorMsg : "Fetch"}
      >
        {renderIcon("fetch", RefreshCw)}
      </button>
      <button
        onClick={(e) => {
          e.stopPropagation();
          runOp("pull");
        }}
        disabled={opStates.pull === "loading"}
        className="rounded p-0.5 text-muted hover:bg-hover hover:text-primary-text transition-colors disabled:opacity-50"
        title={errorMsg && opStates.pull === "error" ? errorMsg : "Pull"}
      >
        {renderIcon("pull", ArrowDownToLine)}
      </button>
      <button
        onClick={(e) => {
          e.stopPropagation();
          runOp("push");
        }}
        disabled={opStates.push === "loading"}
        className="rounded p-0.5 text-muted hover:bg-hover hover:text-primary-text transition-colors disabled:opacity-50"
        title={errorMsg && opStates.push === "error" ? errorMsg : "Push"}
      >
        {renderIcon("push", ArrowUpFromLine)}
      </button>
    </div>
  );
}
