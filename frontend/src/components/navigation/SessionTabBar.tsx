import { useState, useRef } from "react";
import { Plus, Terminal, FileCode, GitCompareArrows, Bot, X } from "lucide-react";
import { useMachineStore } from "../../stores/machineStore";
import { useSessionStore, type CenterTab } from "../../stores/sessionStore";
import { useEditorStore } from "../../stores/editorStore";
import { useClaudeSessionStore } from "../../stores/claudeSessionStore";
import { apiPost } from "../../hooks/useApi";
import { useWriteFile } from "../../hooks/useFileOperations";
import { UnsavedDialog } from "../editor/UnsavedDialog";
import type { TerminalSession, ClaudeStatus } from "../../types";

function TabIcon({ tab, claudeStatus }: { tab: CenterTab; claudeStatus?: ClaudeStatus }) {
  if (tab.type === "terminal" && claudeStatus) {
    return <Bot size={12} className="shrink-0" />;
  }
  switch (tab.icon) {
    case "terminal":
      return <Terminal size={12} className="shrink-0" />;
    case "diff":
      return <GitCompareArrows size={12} className="shrink-0" />;
    case "file":
      return <FileCode size={12} className="shrink-0" />;
  }
}

export function SessionTabBar() {
  const activeMachineId = useMachineStore((s) => s.activeMachineId);
  const tabs = useSessionStore((s) => s.tabs);
  const activeTabId = useSessionStore((s) => s.activeTabId);
  const setActiveTab = useSessionStore((s) => s.setActiveTab);
  const closeTab = useSessionStore((s) => s.closeTab);
  const reorderTabs = useSessionStore((s) => s.reorderTabs);
  const sessions = useSessionStore((s) => s.sessions);
  const addSession = useSessionStore((s) => s.addSession);
  const removeSession = useSessionStore((s) => s.removeSession);
  const isDirty = useEditorStore((s) => s.isDirty);
  const getContent = useEditorStore((s) => s.getContent);
  const clearTab = useEditorStore((s) => s.clearTab);
  const markClean = useEditorStore((s) => s.markClean);
  const setOriginal = useEditorStore((s) => s.setOriginal);
  const claudeSessions = useClaudeSessionStore((s) => s.claudeSessions);
  const writeFile = useWriteFile();

  const [creating, setCreating] = useState(false);
  const [unsavedTab, setUnsavedTab] = useState<CenterTab | null>(null);
  const dragIndexRef = useRef<number | null>(null);

  if (!activeMachineId) return null;

  // Filter tabs for the active machine (terminal tabs for this machine + all diff/editor tabs for this machine)
  const machineTabs = tabs.filter((tab) => {
    if (tab.type === "terminal") {
      return tab.terminalData?.machineId === activeMachineId;
    }
    if (tab.type === "diff") {
      return tab.diffData?.machineId === activeMachineId;
    }
    if (tab.type === "editor") {
      return tab.editorData?.machineId === activeMachineId;
    }
    return false;
  });

  async function handleNewSession() {
    if (!activeMachineId || creating) return;
    setCreating(true);
    try {
      const session = await apiPost<TerminalSession>("/api/sessions", {
        machine_id: activeMachineId,
        session_type: "shell",
      });
      addSession(session);
    } catch (err) {
      console.error("Failed to create session:", err);
    } finally {
      setCreating(false);
    }
  }

  function handleCloseTab(e: React.MouseEvent, tab: CenterTab) {
    e.stopPropagation();
    if (tab.type === "editor" && isDirty(tab.id)) {
      // Show unsaved dialog instead of window.confirm
      setUnsavedTab(tab);
      return;
    }
    performCloseTab(tab);
  }

  function performCloseTab(tab: CenterTab) {
    // Clean up editor state
    if (tab.type === "editor") {
      clearTab(tab.id);
    }
    // For terminal tabs, also remove the session
    if (tab.type === "terminal" && tab.terminalData) {
      removeSession(tab.terminalData.sessionId);
      return;
    }
    closeTab(tab.id);
  }

  function handleUnsavedSave() {
    if (!unsavedTab?.editorData) return;
    const content = getContent(unsavedTab.id);
    if (content !== undefined) {
      writeFile.mutate(
        {
          machineId: unsavedTab.editorData.machineId,
          filePath: unsavedTab.editorData.filePath,
          content,
          repoPath: unsavedTab.editorData.repoPath,
        },
        {
          onSuccess: () => {
            if (unsavedTab) {
              markClean(unsavedTab.id);
              setOriginal(unsavedTab.id, content);
              performCloseTab(unsavedTab);
              setUnsavedTab(null);
            }
          },
        },
      );
    }
  }

  function handleUnsavedDiscard() {
    if (unsavedTab) {
      performCloseTab(unsavedTab);
      setUnsavedTab(null);
    }
  }

  function handleUnsavedCancel() {
    setUnsavedTab(null);
  }

  function handleDragStart(e: React.DragEvent, index: number) {
    dragIndexRef.current = index;
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", String(index));
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  }

  function handleDrop(e: React.DragEvent, dropIndex: number) {
    e.preventDefault();
    const fromIndex = dragIndexRef.current;
    if (fromIndex === null || fromIndex === dropIndex) return;
    // Map machine tab indices back to global tab indices
    const fromGlobalIndex = tabs.indexOf(machineTabs[fromIndex]!);
    const toGlobalIndex = tabs.indexOf(machineTabs[dropIndex]!);
    if (fromGlobalIndex >= 0 && toGlobalIndex >= 0) {
      reorderTabs(fromGlobalIndex, toGlobalIndex);
    }
    dragIndexRef.current = null;
  }

  return (
    <>
      <div className="flex h-8 shrink-0 items-stretch bg-dominant border-b border-border overflow-x-auto overflow-y-hidden scrollbar-hide" style={{ scrollbarWidth: 'none' }}>
        {machineTabs.map((tab, localIndex) => {
          const isActive = tab.id === activeTabId;
          // For terminal tabs, check for Claude session status
          let claudeStatus: ClaudeStatus | undefined;
          if (tab.type === "terminal" && tab.terminalData) {
            const session = sessions.find(
              (s) => s.id === tab.terminalData?.sessionId,
            );
            if (session?.session_type === "claude") {
              const claudeMatch = claudeSessions.find(
                (cs) =>
                  cs.machine_id === activeMachineId &&
                  cs.tmux_session === session.tmux_session_name,
              );
              claudeStatus = claudeMatch?.status;
            }
          }

          // Dirty indicator for editor tabs
          const dirty = tab.type === "editor" && isDirty(tab.id);

          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              draggable
              onDragStart={(e) => handleDragStart(e, localIndex)}
              onDragOver={handleDragOver}
              onDrop={(e) => handleDrop(e, localIndex)}
              className={`group flex shrink-0 items-center gap-1.5 px-2 text-xs transition-colors ${
                isActive
                  ? "border-b-2 border-accent text-primary-text"
                  : "border-b-2 border-transparent text-muted hover:text-primary-text"
              }`}
              style={{ height: "32px" }}
            >
              <TabIcon tab={tab} claudeStatus={claudeStatus} />
              {claudeStatus && (
                <span
                  className={`h-1.5 w-1.5 rounded-full ${
                    claudeStatus === "waiting"
                      ? "bg-warning animate-pulse"
                      : claudeStatus === "running"
                        ? "bg-success"
                        : "bg-muted"
                  }`}
                />
              )}
              {dirty && (
                <span className="h-1.5 w-1.5 rounded-full bg-warning shrink-0" />
              )}
              <span className="truncate max-w-[120px]">{tab.label}</span>
              <span
                role="button"
                tabIndex={0}
                onClick={(e) => handleCloseTab(e, tab)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    handleCloseTab(e as unknown as React.MouseEvent, tab);
                  }
                }}
                className="ml-1 hidden rounded p-0.5 text-muted hover:bg-hover hover:text-primary-text group-hover:inline-flex"
              >
                <X size={10} />
              </span>
            </button>
          );
        })}
        <button
          onClick={handleNewSession}
          disabled={creating}
          className="flex shrink-0 items-center px-2 text-muted hover:text-primary-text transition-colors disabled:opacity-50"
          aria-label="New session"
        >
          <Plus size={12} />
        </button>
      </div>

      {/* Unsaved changes dialog */}
      {unsavedTab && (
        <UnsavedDialog
          fileName={unsavedTab.label}
          onSave={handleUnsavedSave}
          onDiscard={handleUnsavedDiscard}
          onCancel={handleUnsavedCancel}
        />
      )}
    </>
  );
}
