import { useState, useEffect, useCallback } from "react";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import { Plus, GitCommit } from "lucide-react";
import { useMachineStore } from "../../stores/machineStore";
import { useRepoStore } from "../../stores/repoStore";
import { RepoList } from "../git/RepoList";
import { CommitTimeline } from "../git/CommitTimeline";
import { ChangedFiles } from "../git/ChangedFiles";
import { FileTree } from "../filetree/FileTree";
import { FileSearch } from "../filetree/FileSearch";
import {
  SidebarTabs,
  type SidebarTabId,
} from "../navigation/SidebarTabs";

export function Sidebar() {
  const machines = useMachineStore((s) => s.machines);
  const machineStatuses = useMachineStore((s) => s.machineStatuses);
  const selectedMachineId = useRepoStore((s) => s.selectedMachineId);
  const selectedRepoPath = useRepoStore((s) => s.selectedRepoPath);
  const [activeTab, setActiveTab] = useState<SidebarTabId>("git");

  // Listen for sidebar tab change events from command palette
  const handleTabEvent = useCallback((e: Event) => {
    const tab = (e as CustomEvent<SidebarTabId>).detail;
    if (tab) setActiveTab(tab);
  }, []);

  useEffect(() => {
    window.addEventListener("locus:sidebar-tab", handleTabEvent);
    return () => window.removeEventListener("locus:sidebar-tab", handleTabEvent);
  }, [handleTabEvent]);

  // Compute aggregate status for the header
  const statuses = Object.values(machineStatuses);
  const onlineCount = statuses.filter((s) => s === "online").length;

  return (
    <div className="flex h-full flex-col bg-secondary">
      {/* Sidebar tabs */}
      <SidebarTabs activeTab={activeTab} onTabChange={setActiveTab} />

      {activeTab === "git" && (
        <PanelGroup direction="vertical" className="flex-1">
          {/* Top panel: Repo tree */}
          <Panel defaultSize={50} minSize={20}>
            <div className="flex h-full flex-col">
              {/* Header */}
              <div className="flex items-center justify-between px-3 py-2 border-b border-border">
                <span className="text-xs font-medium text-muted uppercase tracking-wide">
                  Repositories
                </span>
                {onlineCount > 0 && (
                  <span className="text-[10px] text-success">
                    {onlineCount} online
                  </span>
                )}
              </div>

              {/* Repo list */}
              <div className="flex-1 overflow-y-auto">
                <RepoList />
              </div>

              {/* Add machine button */}
              {machines.length === 0 && (
                <div className="border-t border-border p-2">
                  <button className="flex w-full items-center justify-center gap-1.5 rounded px-3 py-2 text-sm text-accent hover:bg-hover transition-colors">
                    <Plus size={14} />
                    Add Machine
                  </button>
                </div>
              )}
            </div>
          </Panel>

          <PanelResizeHandle className="h-1 bg-border hover:bg-accent transition-colors cursor-row-resize" />

          {/* Bottom panel: Commit timeline + Changed files */}
          <Panel defaultSize={50} minSize={15}>
            <div className="flex h-full flex-col">
              {/* Bottom panel header */}
              <div className="flex items-center gap-1.5 px-3 py-1.5 border-b border-border">
                <GitCommit size={12} className="text-muted" />
                <span className="text-[10px] font-medium text-muted uppercase tracking-wide">
                  {selectedRepoPath
                    ? selectedRepoPath.split("/").pop()
                    : "Timeline"}
                </span>
              </div>

              {/* Content */}
              <div className="flex-1 overflow-y-auto">
                {selectedMachineId && selectedRepoPath ? (
                  <>
                    <ChangedFiles
                      machineId={selectedMachineId}
                      repoPath={selectedRepoPath}
                    />
                    <CommitTimeline
                      machineId={selectedMachineId}
                      repoPath={selectedRepoPath}
                    />
                  </>
                ) : (
                  <div className="flex flex-col items-center justify-center px-4 py-8 text-center">
                    <GitCommit size={20} className="text-muted/40 mb-2" />
                    <p className="text-[10px] text-muted">
                      Select a repo to view timeline
                    </p>
                  </div>
                )}
              </div>
            </div>
          </Panel>
        </PanelGroup>
      )}

      {activeTab === "search" && (
        <div className="flex-1 overflow-hidden">
          <FileSearch />
        </div>
      )}

      {activeTab === "files" && (
        <div className="flex flex-1 flex-col overflow-hidden">
          <FileTree />
        </div>
      )}
    </div>
  );
}
