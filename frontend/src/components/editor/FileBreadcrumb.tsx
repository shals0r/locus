import { ChevronRight } from "lucide-react";
import { useRepoStore } from "../../stores/repoStore";

interface FileBreadcrumbProps {
  repoPath: string;
  filePath?: string;
  machineId: string;
  /** Optional callback when a breadcrumb segment is clicked */
  onSegmentClick?: (segment: string, type: "repo" | "branch" | "directory" | "file") => void;
}

export function FileBreadcrumb({
  repoPath,
  filePath,
  machineId,
  onSegmentClick,
}: FileBreadcrumbProps) {
  const repos = useRepoStore((s) => s.repos);

  // Derive repo name from path
  const repoName = repoPath.split("/").pop() ?? repoPath;

  // Derive branch from repo store
  const machineRepos = repos.get(machineId) ?? [];
  const repo = machineRepos.find((r) => r.repo_path === repoPath);
  const branch = repo?.status?.branch ?? "main";

  // Split file path into segments
  const pathSegments = filePath ? filePath.split("/") : [];
  const fileName = pathSegments.length > 0 ? pathSegments.pop() : undefined;
  const dirSegments = pathSegments;

  const handleClick = (segment: string, type: "repo" | "branch" | "directory" | "file") => {
    onSegmentClick?.(segment, type);
  };

  return (
    <div className="flex h-7 shrink-0 items-center bg-dominant px-3 border-b border-border overflow-x-auto">
      {/* Repo name */}
      <button
        onClick={() => handleClick(repoName, "repo")}
        className="shrink-0 text-xs text-muted hover:text-primary-text transition-colors"
      >
        {repoName}
      </button>

      <ChevronRight size={12} className="mx-1 shrink-0 text-muted/50" />

      {/* Branch */}
      <button
        onClick={() => handleClick(branch, "branch")}
        className="shrink-0 text-xs text-accent/80 hover:text-accent transition-colors"
      >
        {branch}
      </button>

      {/* Directory segments */}
      {dirSegments.map((segment, idx) => (
        <span key={`dir-${idx}`} className="flex items-center">
          <ChevronRight size={12} className="mx-1 shrink-0 text-muted/50" />
          <button
            onClick={() => handleClick(dirSegments.slice(0, idx + 1).join("/"), "directory")}
            className="shrink-0 text-xs text-muted hover:text-primary-text transition-colors"
          >
            {segment}
          </button>
        </span>
      ))}

      {/* File name */}
      {fileName && (
        <>
          <ChevronRight size={12} className="mx-1 shrink-0 text-muted/50" />
          <span className="shrink-0 text-xs font-medium text-primary-text">
            {fileName}
          </span>
        </>
      )}
    </div>
  );
}
