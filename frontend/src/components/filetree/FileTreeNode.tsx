import { useState, useRef, useEffect, useCallback } from "react";
import {
  ChevronRight,
  Folder,
  FolderOpen,
  FileCode,
  Loader2,
} from "lucide-react";
import { useFileTreeStore } from "../../stores/fileTreeStore";
import { useSessionStore } from "../../stores/sessionStore";
import { useListDirectory, useRenameFile, type DirectoryEntry } from "../../hooks/useFileOperations";

interface FileTreeNodeProps {
  entry: DirectoryEntry;
  machineId: string;
  repoPath: string;
  parentPath: string;
  depth: number;
}

export function FileTreeNode({
  entry,
  machineId,
  repoPath,
  parentPath,
  depth,
}: FileTreeNodeProps) {
  const isExpanded = useFileTreeStore((s) => s.isExpanded);
  const toggleDir = useFileTreeStore((s) => s.toggleDir);
  const setContextMenu = useFileTreeStore((s) => s.setContextMenu);
  const renamingPath = useFileTreeStore((s) => s.renamingPath);
  const setRenamingPath = useFileTreeStore((s) => s.setRenamingPath);
  const openEditorTab = useSessionStore((s) => s.openEditorTab);
  const renameFile = useRenameFile();

  const fullPath = entry.path;
  const expanded = entry.is_dir && isExpanded(fullPath);

  // Only fetch children when directory is expanded
  const { data: children, isLoading: childrenLoading } = useListDirectory(
    expanded ? machineId : null,
    expanded ? fullPath : null,
  );

  // Inline rename state
  const [renameValue, setRenameValue] = useState(entry.name);
  const renameInputRef = useRef<HTMLInputElement>(null);
  const isRenaming = renamingPath === fullPath;

  useEffect(() => {
    if (isRenaming && renameInputRef.current) {
      renameInputRef.current.focus();
      // Select file name without extension
      const dotIndex = entry.name.lastIndexOf(".");
      renameInputRef.current.setSelectionRange(
        0,
        dotIndex > 0 ? dotIndex : entry.name.length,
      );
    }
  }, [isRenaming, entry.name]);

  const handleClick = useCallback(() => {
    if (entry.is_dir) {
      toggleDir(fullPath);
    } else {
      openEditorTab(machineId, repoPath, fullPath);
    }
  }, [entry.is_dir, fullPath, machineId, repoPath, toggleDir, openEditorTab]);

  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setContextMenu({
        path: fullPath,
        isDir: entry.is_dir,
        x: e.clientX,
        y: e.clientY,
      });
    },
    [fullPath, entry.is_dir, setContextMenu],
  );

  const handleRenameSubmit = useCallback(() => {
    if (!renameValue.trim() || renameValue === entry.name) {
      setRenamingPath(null);
      setRenameValue(entry.name);
      return;
    }
    const newPath = parentPath
      ? `${parentPath}/${renameValue}`
      : renameValue;
    renameFile.mutate(
      { machineId, oldPath: fullPath, newPath },
      {
        onSuccess: () => setRenamingPath(null),
        onError: () => {
          setRenameValue(entry.name);
          setRenamingPath(null);
        },
      },
    );
  }, [
    renameValue,
    entry.name,
    parentPath,
    machineId,
    fullPath,
    renameFile,
    setRenamingPath,
  ]);

  const handleRenameKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        handleRenameSubmit();
      } else if (e.key === "Escape") {
        setRenameValue(entry.name);
        setRenamingPath(null);
      }
    },
    [handleRenameSubmit, entry.name, setRenamingPath],
  );

  // Sort entries: directories first, then alphabetically
  const sortedChildren = children?.entries
    ? [...children.entries].sort((a, b) => {
        if (a.is_dir !== b.is_dir) return a.is_dir ? -1 : 1;
        return a.name.localeCompare(b.name);
      })
    : [];

  return (
    <div>
      {/* This node */}
      <div
        onClick={handleClick}
        onContextMenu={handleContextMenu}
        className="flex items-center gap-1 py-0.5 pr-2 text-xs cursor-pointer hover:bg-hover transition-colors group"
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
        role="treeitem"
        aria-expanded={entry.is_dir ? expanded : undefined}
      >
        {/* Expand/collapse chevron for directories */}
        {entry.is_dir ? (
          <ChevronRight
            size={12}
            className={`shrink-0 text-muted transition-transform ${
              expanded ? "rotate-90" : ""
            }`}
          />
        ) : (
          <span className="w-3 shrink-0" />
        )}

        {/* Icon */}
        {entry.is_dir ? (
          expanded ? (
            <FolderOpen size={14} className="shrink-0 text-accent" />
          ) : (
            <Folder size={14} className="shrink-0 text-accent" />
          )
        ) : (
          <FileCode size={14} className="shrink-0 text-muted" />
        )}

        {/* Name or rename input */}
        {isRenaming ? (
          <input
            ref={renameInputRef}
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onBlur={handleRenameSubmit}
            onKeyDown={handleRenameKeyDown}
            onClick={(e) => e.stopPropagation()}
            className="flex-1 min-w-0 bg-dominant border border-accent rounded px-1 py-0 text-xs text-primary-text outline-none"
          />
        ) : (
          <span className="truncate text-primary-text">{entry.name}</span>
        )}
      </div>

      {/* Children (when directory is expanded) */}
      {expanded && entry.is_dir && (
        <div role="group">
          {childrenLoading && (
            <div
              className="flex items-center gap-1.5 py-1 text-muted"
              style={{ paddingLeft: `${(depth + 1) * 16 + 8}px` }}
            >
              <Loader2 size={11} className="animate-spin" />
              <span className="text-[10px]">Loading...</span>
            </div>
          )}
          {sortedChildren.map((child) => (
            <FileTreeNode
              key={child.path}
              entry={child}
              machineId={machineId}
              repoPath={repoPath}
              parentPath={fullPath}
              depth={depth + 1}
            />
          ))}
          {!childrenLoading && sortedChildren.length === 0 && (
            <div
              className="py-1 text-[10px] text-muted italic"
              style={{ paddingLeft: `${(depth + 1) * 16 + 8}px` }}
            >
              Empty directory
            </div>
          )}
        </div>
      )}
    </div>
  );
}
