import { ChevronRight, GitBranch, FolderGit2 } from "lucide-react";

interface DiffContextBarProps {
  /** Repo name/path */
  repoName: string;
  /** Current branch name */
  branchName?: string;
  /** File path being viewed */
  filePath?: string;
  /** Whether this is an MR/PR diff */
  isMrDiff?: boolean;
  /** MR/PR identifier (e.g., "!123" for GitLab, "#456" for GitHub) */
  mrIdentifier?: string;
  /** MR/PR title */
  mrTitle?: string;
  /** MR/PR status */
  mrStatus?: "open" | "merged" | "closed";
}

/** Extract just the repo folder name from a full path */
function repoBasename(repoPath: string): string {
  const cleaned = repoPath.replace(/[\\/]+$/, "");
  const parts = cleaned.split(/[\\/]/);
  return parts[parts.length - 1] ?? repoPath;
}

function StatusBadge({ status }: { status: "open" | "merged" | "closed" }) {
  const styles: Record<string, string> = {
    open: "bg-success/20 text-success",
    merged: "bg-accent/20 text-accent",
    closed: "bg-destructive/20 text-destructive",
  };
  return (
    <span
      className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium ${styles[status] ?? ""}`}
    >
      {status}
    </span>
  );
}

function Separator() {
  return <ChevronRight size={10} className="shrink-0 text-muted/50" />;
}

export function DiffContextBar({
  repoName,
  branchName,
  filePath,
  isMrDiff = false,
  mrIdentifier,
  mrTitle,
  mrStatus,
}: DiffContextBarProps) {
  if (isMrDiff) {
    // MR/PR context mode
    return (
      <div className="flex h-7 shrink-0 items-center gap-1.5 bg-dominant px-2.5 border-b border-border">
        <FolderGit2 size={11} className="shrink-0 text-muted" />
        <span className="text-[11px] text-muted truncate">
          {mrIdentifier ? `${mrIdentifier}: ` : ""}
          {mrTitle ?? "Merge Request"}
        </span>
        {mrStatus && (
          <>
            <Separator />
            <StatusBadge status={mrStatus} />
          </>
        )}
      </div>
    );
  }

  // Local diff context mode -- breadcrumb: repo > branch > file
  return (
    <div className="flex h-7 shrink-0 items-center gap-1.5 bg-dominant px-2.5 border-b border-border">
      <FolderGit2 size={11} className="shrink-0 text-muted" />
      <span className="text-[11px] text-muted truncate">
        {repoBasename(repoName)}
      </span>
      {branchName && (
        <>
          <Separator />
          <GitBranch size={11} className="shrink-0 text-muted" />
          <span className="text-[11px] text-muted truncate">{branchName}</span>
        </>
      )}
      {filePath && (
        <>
          <Separator />
          <span className="text-[11px] text-primary-text truncate">
            {filePath}
          </span>
        </>
      )}
    </div>
  );
}
