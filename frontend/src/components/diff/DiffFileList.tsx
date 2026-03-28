import { Plus, Pencil, Trash2, FileText } from "lucide-react";

interface ChangedFileEntry {
  path: string;
  status: string;
}

interface DiffFileListProps {
  /** List of changed files */
  files: ChangedFileEntry[];
  /** Whether file list is loading */
  isLoading?: boolean;
  /** Currently selected file path */
  selectedFile?: string;
  /** Callback when a file is clicked */
  onSelectFile: (filePath: string) => void;
}

/** Map git status codes to display info */
function getStatusInfo(status: string): {
  icon: typeof Plus;
  color: string;
  label: string;
} {
  const s = status.toLowerCase().trim();
  if (s === "a" || s === "added" || s === "??" || s === "new file") {
    return { icon: Plus, color: "text-success", label: "Added" };
  }
  if (s === "d" || s === "deleted") {
    return { icon: Trash2, color: "text-destructive", label: "Deleted" };
  }
  // Default: modified (M, modified, renamed, etc.)
  return { icon: Pencil, color: "text-warning", label: "Modified" };
}

/** Extract basename from a file path */
function basename(filePath: string): string {
  const parts = filePath.split("/");
  return parts[parts.length - 1] ?? filePath;
}

export function DiffFileList({
  files,
  isLoading = false,
  selectedFile,
  onSelectFile,
}: DiffFileListProps) {
  return (
    <div className="flex h-full w-[200px] shrink-0 flex-col border-r border-border bg-secondary overflow-hidden">
      {/* Header */}
      <div className="shrink-0 border-b border-border px-2.5 py-1.5">
        <span className="text-[11px] font-medium text-muted">
          {files.length} file{files.length !== 1 ? "s" : ""} changed
        </span>
      </div>

      {/* File list */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-6 text-muted text-xs">
            Loading files...
          </div>
        ) : files.length === 0 ? (
          <div className="flex items-center justify-center py-6 text-muted text-xs">
            No changed files
          </div>
        ) : (
          files.map((file) => {
            const info = getStatusInfo(file.status);
            const StatusIcon = info.icon;
            const isSelected = selectedFile === file.path;
            return (
              <button
                key={file.path}
                onClick={() => onSelectFile(file.path)}
                title={file.path}
                className={`flex w-full items-center gap-1.5 px-2.5 py-1 text-left transition-colors ${
                  isSelected
                    ? "bg-hover text-primary-text"
                    : "text-muted hover:bg-hover hover:text-primary-text"
                }`}
              >
                <StatusIcon size={12} className={`shrink-0 ${info.color}`} />
                <FileText size={11} className="shrink-0 text-muted" />
                <span className="truncate text-xs">{basename(file.path)}</span>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
