import { useState, useRef, useEffect } from "react";
import { Check, GitBranch, Plus } from "lucide-react";
import { useBranches, useGitOp } from "../../hooks/useGitStatus";

interface BranchDropdownProps {
  machineId: string;
  repoPath: string;
  currentBranch: string;
}

export function BranchDropdown({
  machineId,
  repoPath,
  currentBranch,
}: BranchDropdownProps) {
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newBranchName, setNewBranchName] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const { data: branches } = useBranches(
    open ? machineId : null,
    open ? repoPath : null,
  );
  const gitOp = useGitOp();

  // Close dropdown on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
        setCreating(false);
        setNewBranchName("");
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // Focus input when creating
  useEffect(() => {
    if (creating && inputRef.current) {
      inputRef.current.focus();
    }
  }, [creating]);

  const handleCheckout = async (branchName: string) => {
    if (branchName === currentBranch) return;
    await gitOp.mutateAsync({
      operation: "checkout",
      machineId,
      repoPath,
      branch: branchName,
    });
    setOpen(false);
  };

  const handleCreateBranch = async () => {
    const name = newBranchName.trim();
    if (!name) return;
    await gitOp.mutateAsync({
      operation: "create-branch",
      machineId,
      repoPath,
      branch: name,
    });
    setNewBranchName("");
    setCreating(false);
    setOpen(false);
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={(e) => {
          e.stopPropagation();
          setOpen(!open);
        }}
        className="flex items-center gap-1 rounded px-1 py-0.5 text-xs text-accent hover:bg-hover transition-colors truncate max-w-[120px]"
        title={currentBranch}
      >
        <GitBranch size={11} className="shrink-0" />
        <span className="truncate">{currentBranch}</span>
      </button>

      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 w-52 rounded border border-border bg-secondary shadow-lg">
          <div className="max-h-48 overflow-y-auto py-1">
            {branches?.map((branch) => (
              <button
                key={branch.name}
                onClick={() => handleCheckout(branch.name)}
                className="flex w-full items-center gap-2 px-2 py-1 text-xs hover:bg-hover transition-colors"
              >
                {branch.is_current ? (
                  <Check size={11} className="shrink-0 text-success" />
                ) : (
                  <span className="w-[11px] shrink-0" />
                )}
                <span className="truncate text-primary-text">
                  {branch.name}
                </span>
              </button>
            ))}
          </div>
          <div className="border-t border-border">
            {creating ? (
              <div className="flex items-center gap-1 px-2 py-1.5">
                <input
                  ref={inputRef}
                  type="text"
                  value={newBranchName}
                  onChange={(e) => setNewBranchName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleCreateBranch();
                    if (e.key === "Escape") {
                      setCreating(false);
                      setNewBranchName("");
                    }
                  }}
                  placeholder="branch-name"
                  className="flex-1 rounded bg-dominant px-1.5 py-0.5 text-xs text-primary-text outline-none placeholder:text-muted"
                />
              </div>
            ) : (
              <button
                onClick={() => setCreating(true)}
                className="flex w-full items-center gap-2 px-2 py-1.5 text-xs text-muted hover:bg-hover hover:text-primary-text transition-colors"
              >
                <Plus size={11} />
                New branch...
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
