import { useState, useCallback } from "react";
import { DiffModeEnum } from "@git-diff-view/react";
import { useRepoStore } from "../../stores/repoStore";
import { useChangedFiles } from "../../hooks/useDiffData";
import { DiffViewer } from "./DiffViewer";
import { DiffFileList } from "./DiffFileList";
import { DiffToolbar } from "./DiffToolbar";
import { DiffContextBar } from "./DiffContextBar";

// ---------------------------------------------------------------------------
// Storage key for persisting view mode preference
// ---------------------------------------------------------------------------
const DIFF_MODE_KEY = "locus-diff-mode";

function getStoredMode(): DiffModeEnum {
  try {
    const stored = localStorage.getItem(DIFF_MODE_KEY);
    if (stored === "unified") return DiffModeEnum.Unified;
  } catch {
    // Ignore storage errors
  }
  return DiffModeEnum.Split;
}

function storeMode(mode: DiffModeEnum): void {
  try {
    localStorage.setItem(
      DIFF_MODE_KEY,
      mode === DiffModeEnum.Unified ? "unified" : "split",
    );
  } catch {
    // Ignore storage errors
  }
}

// ---------------------------------------------------------------------------
// DiffPanel Props
// ---------------------------------------------------------------------------
interface DiffPanelProps {
  machineId: string;
  repoPath: string;
  filePath?: string;
  commitSha?: string;
  /** Whether this is an MR/PR diff */
  isMrDiff?: boolean;
  /** MR/PR metadata */
  mrIdentifier?: string;
  mrTitle?: string;
  mrStatus?: "open" | "merged" | "closed";
}

/**
 * Full diff layout: file list sidebar | (toolbar + context bar + diff viewer)
 */
export function DiffPanel({
  machineId,
  repoPath,
  filePath,
  commitSha,
  isMrDiff = false,
  mrIdentifier,
  mrTitle,
  mrStatus,
}: DiffPanelProps) {
  // View mode state (shared between toolbar and viewer)
  const [mode, setMode] = useState<DiffModeEnum>(getStoredMode);

  const handleModeChange = useCallback((newMode: DiffModeEnum) => {
    setMode(newMode);
    storeMode(newMode);
  }, []);

  // File list for multi-file view (commit diffs or MR diffs)
  const isMultiFile = !!commitSha && !filePath;
  const { files, isLoading: filesLoading } = useChangedFiles(
    isMultiFile ? machineId : undefined,
    isMultiFile ? repoPath : undefined,
  );

  // Selected file in multi-file mode
  const [selectedFile, setSelectedFile] = useState<string | undefined>(undefined);

  // Determine the active file path for the diff viewer
  const activeFilePath = isMultiFile
    ? selectedFile ?? files[0]?.path
    : filePath;

  // Get branch name from repo store
  const repos = useRepoStore((s) => s.repos);
  const machineRepos = repos.get(machineId);
  const currentRepo = machineRepos?.find((r) => r.repo_path === repoPath);
  const branchName = currentRepo?.status.branch;

  // Extract repo name from path
  const repoName = repoPath;

  return (
    <div className="flex h-full">
      {/* File list sidebar -- shown for multi-file diffs */}
      {isMultiFile && (
        <DiffFileList
          files={files}
          isLoading={filesLoading}
          selectedFile={selectedFile ?? files[0]?.path}
          onSelectFile={setSelectedFile}
        />
      )}

      {/* Right side: toolbar + context + viewer */}
      <div className="flex flex-1 flex-col min-w-0">
        <DiffToolbar
          mode={mode}
          onModeChange={handleModeChange}
          isMrDiff={isMrDiff}
        />

        <DiffContextBar
          repoName={repoName}
          branchName={branchName}
          filePath={activeFilePath}
          isMrDiff={isMrDiff}
          mrIdentifier={mrIdentifier}
          mrTitle={mrTitle}
          mrStatus={mrStatus}
        />

        {/* Diff viewer fills remaining space */}
        <div className="flex-1 min-h-0 overflow-hidden">
          <DiffViewer
            machineId={machineId}
            repoPath={repoPath}
            filePath={activeFilePath}
            commitSha={commitSha}
            isMrDiff={isMrDiff}
            mode={mode}
            onModeChange={handleModeChange}
            selectedFile={selectedFile}
          />
        </div>
      </div>
    </div>
  );
}
