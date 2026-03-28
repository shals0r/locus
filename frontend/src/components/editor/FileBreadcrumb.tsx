import { ChevronRight, FileCode } from "lucide-react";

interface FileBreadcrumbProps {
  filePath: string;
  repoPath: string;
}

/**
 * Shows a breadcrumb trail for the open file, relative to the repo root.
 * e.g. src > components > editor > CodeEditor.tsx
 */
export function FileBreadcrumb({ filePath, repoPath }: FileBreadcrumbProps) {
  // Make path relative to repo root
  let relativePath = filePath;
  if (filePath.startsWith(repoPath)) {
    relativePath = filePath.slice(repoPath.length);
    if (relativePath.startsWith("/")) {
      relativePath = relativePath.slice(1);
    }
  }

  const segments = relativePath.split("/").filter(Boolean);
  const fileName = segments.pop() ?? relativePath;

  return (
    <div className="flex items-center gap-0.5 overflow-hidden">
      {segments.map((segment, i) => (
        <span key={i} className="flex items-center gap-0.5 shrink-0">
          <span className="text-[10px] text-muted truncate max-w-[100px]">
            {segment}
          </span>
          <ChevronRight size={10} className="text-muted/50 shrink-0" />
        </span>
      ))}
      <span className="flex items-center gap-1 shrink-0">
        <FileCode size={10} className="text-accent shrink-0" />
        <span className="text-[10px] font-medium text-primary-text">
          {fileName}
        </span>
      </span>
    </div>
  );
}
