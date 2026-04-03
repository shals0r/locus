import { useCallback, useEffect, useRef, useState } from "react";
import {
  FolderTree,
  FilePlus,
  FolderPlus,
  Loader2,
  Trash2,
  Pencil,
} from "lucide-react";
import { useRepoStore } from "../../stores/repoStore";
import { useFileTreeStore } from "../../stores/fileTreeStore";
import {
  useListDirectory,
  useCreateFile,
  useDeleteFile,
} from "../../hooks/useFileOperations";
import { FileTreeNode } from "./FileTreeNode";

/**
 * Top-level file tree component for the sidebar Files tab.
 * Shows the directory tree for the currently selected repository.
 */
export function FileTree() {
  const selectedMachineId = useRepoStore((s) => s.selectedMachineId);
  const selectedRepoPath = useRepoStore((s) => s.selectedRepoPath);
  const contextMenuTarget = useFileTreeStore((s) => s.contextMenuTarget);
  const clearContextMenu = useFileTreeStore((s) => s.clearContextMenu);
  const setRenamingPath = useFileTreeStore((s) => s.setRenamingPath);

  const createFile = useCreateFile();
  const deleteFile = useDeleteFile();

  // New file/folder input at root
  const [newItemMode, setNewItemMode] = useState<"file" | "folder" | null>(null);
  const [newItemName, setNewItemName] = useState("");
  const newItemRef = useRef<HTMLInputElement>(null);

  const { data: rootListing, isLoading } = useListDirectory(
    selectedMachineId,
    selectedRepoPath,
    1, // Load one level — children lazy-load on expand
  );

  // Focus new item input when mode changes
  useEffect(() => {
    if (newItemMode && newItemRef.current) {
      newItemRef.current.focus();
    }
  }, [newItemMode]);

  // Close context menu on click outside
  useEffect(() => {
    if (!contextMenuTarget) return;
    const handleClick = () => clearContextMenu();
    document.addEventListener("click", handleClick);
    return () => document.removeEventListener("click", handleClick);
  }, [contextMenuTarget, clearContextMenu]);

  const handleCreateNewItem = useCallback(() => {
    if (!newItemName.trim() || !selectedMachineId || !selectedRepoPath) {
      setNewItemMode(null);
      setNewItemName("");
      return;
    }
    createFile.mutate(
      {
        machineId: selectedMachineId,
        filePath: `${selectedRepoPath}/${newItemName}`,
        isDir: newItemMode === "folder",
        content: "",
      },
      {
        onSuccess: () => {
          setNewItemMode(null);
          setNewItemName("");
        },
        onError: () => {
          setNewItemMode(null);
          setNewItemName("");
        },
      },
    );
  }, [newItemName, selectedMachineId, selectedRepoPath, newItemMode, createFile]);

  // Context menu: create new file in selected directory
  const handleContextNewFile = useCallback(() => {
    if (!contextMenuTarget || !selectedMachineId) return;
    const dirPath = contextMenuTarget.isDir
      ? contextMenuTarget.path
      : contextMenuTarget.path.substring(
          0,
          contextMenuTarget.path.lastIndexOf("/"),
        );
    const name = prompt("File name:");
    if (name) {
      createFile.mutate({
        machineId: selectedMachineId,
        filePath: `${dirPath}/${name}`,
        isDir: false,
        content: "",
      });
    }
    clearContextMenu();
  }, [contextMenuTarget, selectedMachineId, createFile, clearContextMenu]);

  // Context menu: create new folder
  const handleContextNewFolder = useCallback(() => {
    if (!contextMenuTarget || !selectedMachineId) return;
    const dirPath = contextMenuTarget.isDir
      ? contextMenuTarget.path
      : contextMenuTarget.path.substring(
          0,
          contextMenuTarget.path.lastIndexOf("/"),
        );
    const name = prompt("Folder name:");
    if (name) {
      createFile.mutate({
        machineId: selectedMachineId,
        filePath: `${dirPath}/${name}`,
        isDir: true,
      });
    }
    clearContextMenu();
  }, [contextMenuTarget, selectedMachineId, createFile, clearContextMenu]);

  // Context menu: rename
  const handleContextRename = useCallback(() => {
    if (!contextMenuTarget) return;
    setRenamingPath(contextMenuTarget.path);
    clearContextMenu();
  }, [contextMenuTarget, setRenamingPath, clearContextMenu]);

  // Context menu: delete
  const handleContextDelete = useCallback(() => {
    if (!contextMenuTarget || !selectedMachineId) return;
    const name = contextMenuTarget.path.split("/").pop() ?? contextMenuTarget.path;
    const confirmed = confirm(`Delete "${name}"?`);
    if (confirmed) {
      deleteFile.mutate({
        machineId: selectedMachineId,
        filePath: contextMenuTarget.path,
      });
    }
    clearContextMenu();
  }, [contextMenuTarget, selectedMachineId, deleteFile, clearContextMenu]);

  // No repo selected
  if (!selectedMachineId || !selectedRepoPath) {
    return (
      <div className="flex flex-col items-center justify-center px-4 py-8 text-center">
        <FolderTree size={20} className="text-muted/40 mb-2" />
        <p className="text-[10px] text-muted">
          Select a repository to browse files
        </p>
      </div>
    );
  }

  // Sort entries: directories first, then alphabetically
  const sortedEntries = rootListing?.entries
    ? [...rootListing.entries].sort((a, b) => {
        if (a.is_dir !== b.is_dir) return a.is_dir ? -1 : 1;
        return a.name.localeCompare(b.name);
      })
    : [];

  return (
    <div className="flex flex-col h-full">
      {/* Header with quick actions */}
      <div className="flex items-center justify-between px-2 py-1 border-b border-border">
        <span className="text-[10px] font-medium text-muted uppercase tracking-wide truncate">
          {selectedRepoPath.split("/").pop()}
        </span>
        <div className="flex items-center gap-0.5">
          <button
            onClick={() => {
              setNewItemMode("file");
              setNewItemName("");
            }}
            className="p-1 text-muted hover:text-primary-text rounded hover:bg-hover transition-colors"
            title="New File"
          >
            <FilePlus size={12} />
          </button>
          <button
            onClick={() => {
              setNewItemMode("folder");
              setNewItemName("");
            }}
            className="p-1 text-muted hover:text-primary-text rounded hover:bg-hover transition-colors"
            title="New Folder"
          >
            <FolderPlus size={12} />
          </button>
        </div>
      </div>

      {/* New item input at root level */}
      {newItemMode && (
        <div className="flex items-center gap-1 px-2 py-1 border-b border-border bg-dominant">
          {newItemMode === "folder" ? (
            <FolderPlus size={12} className="text-accent shrink-0" />
          ) : (
            <FilePlus size={12} className="text-accent shrink-0" />
          )}
          <input
            ref={newItemRef}
            value={newItemName}
            onChange={(e) => setNewItemName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleCreateNewItem();
              if (e.key === "Escape") {
                setNewItemMode(null);
                setNewItemName("");
              }
            }}
            onBlur={handleCreateNewItem}
            placeholder={newItemMode === "folder" ? "folder name" : "file name"}
            className="flex-1 min-w-0 bg-transparent border-none text-xs text-primary-text outline-none placeholder:text-muted/50"
          />
        </div>
      )}

      {/* File tree content */}
      <div className="flex-1 overflow-y-auto py-0.5" role="tree">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 size={16} className="animate-spin text-muted" />
          </div>
        ) : (
          sortedEntries.map((entry) => (
            <FileTreeNode
              key={entry.path}
              entry={entry}
              machineId={selectedMachineId}
              repoPath={selectedRepoPath}
              parentPath={selectedRepoPath}
              depth={0}
            />
          ))
        )}
      </div>

      {/* Context menu */}
      {contextMenuTarget && (
        <div
          className="fixed z-50 min-w-[140px] rounded border border-border bg-secondary shadow-lg py-1"
          style={{ left: contextMenuTarget.x, top: contextMenuTarget.y }}
        >
          <button
            onClick={handleContextNewFile}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-primary-text hover:bg-hover transition-colors"
          >
            <FilePlus size={12} />
            New File
          </button>
          <button
            onClick={handleContextNewFolder}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-primary-text hover:bg-hover transition-colors"
          >
            <FolderPlus size={12} />
            New Folder
          </button>
          <div className="my-1 border-t border-border" />
          <button
            onClick={handleContextRename}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-primary-text hover:bg-hover transition-colors"
          >
            <Pencil size={12} />
            Rename
          </button>
          <button
            onClick={handleContextDelete}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-danger hover:bg-hover transition-colors"
          >
            <Trash2 size={12} />
            Delete
          </button>
        </div>
      )}
    </div>
  );
}
