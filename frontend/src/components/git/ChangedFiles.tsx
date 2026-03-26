import { useChangedFiles } from "../../hooks/useGitStatus";

interface ChangedFilesProps {
  machineId: string;
  repoPath: string;
}

const statusConfig: Record<string, { label: string; color: string }> = {
  M: { label: "M", color: "text-accent" },
  A: { label: "A", color: "text-success" },
  D: { label: "D", color: "text-error" },
  "?": { label: "?", color: "text-muted" },
  R: { label: "R", color: "text-warning" },
  C: { label: "C", color: "text-warning" },
  U: { label: "U", color: "text-error" },
};

function getStatusDisplay(status: string) {
  return statusConfig[status] ?? { label: status, color: "text-muted" };
}

/**
 * Splits a file path into directory (dimmed) and filename.
 */
function splitPath(filePath: string): { dir: string; name: string } {
  const lastSlash = filePath.lastIndexOf("/");
  if (lastSlash === -1) return { dir: "", name: filePath };
  return {
    dir: filePath.slice(0, lastSlash + 1),
    name: filePath.slice(lastSlash + 1),
  };
}

export function ChangedFiles({ machineId, repoPath }: ChangedFilesProps) {
  const { data: files, isLoading } = useChangedFiles(machineId, repoPath);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-2">
        <span className="text-[10px] text-muted">Loading changes...</span>
      </div>
    );
  }

  if (!files || files.length === 0) {
    return null; // No changed files -- show nothing, timeline gets full space
  }

  return (
    <div className="border-b border-border py-1">
      <div className="flex items-center justify-between px-2 py-0.5">
        <span className="text-[10px] font-medium text-muted uppercase tracking-wide">
          Changes
        </span>
        <span className="text-[10px] text-muted">{files.length}</span>
      </div>
      <div className="max-h-32 overflow-y-auto">
        {files.map((file) => {
          const { label, color } = getStatusDisplay(file.status);
          const { dir, name } = splitPath(file.path);

          return (
            <button
              key={file.path}
              className="flex w-full items-center gap-1.5 px-2 py-0.5 text-left hover:bg-hover/50 transition-colors"
              title={`${file.status} ${file.path}`}
            >
              <span
                className={`w-3 shrink-0 text-center text-[10px] font-mono font-bold ${color}`}
              >
                {label}
              </span>
              <span className="min-w-0 truncate text-[10px]">
                <span className="text-muted">{dir}</span>
                <span className="text-primary-text">{name}</span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
