import { useEffect, useRef } from "react";
import { AlertTriangle, X, FileCode, FileEdit, GitCommitHorizontal, GitPullRequest } from "lucide-react";
import { useMachineStore } from "../../stores/machineStore";
import { useSessionStore } from "../../stores/sessionStore";
import { useTaskStore } from "../../stores/taskStore";
import { apiGet } from "../../hooks/useApi";
import { useTasks } from "../../hooks/useTaskQueries";
import { useMrComments } from "../../hooks/useReviewApi";
import type { TerminalSession } from "../../types";
import { isLocalMachine } from "../../types";
import { MachineTabBar } from "../navigation/MachineTabBar";
import { SessionTabBar } from "../navigation/SessionTabBar";
import { ContextStrip } from "../session/ContextStrip";
import { ClaudeOverview } from "../terminal/ClaudeOverview";
import { TerminalView } from "../terminal/TerminalView";
import { DiffViewer } from "../diff/DiffViewer";
import { MrMetadataHeader } from "../diff/MrMetadataHeader";
import { CodeEditor } from "../editor/CodeEditor";
import { FileBreadcrumb } from "../editor/FileBreadcrumb";
import type { DiffTab } from "../../stores/sessionStore";

/**
 * Wrapper that loads MR/PR comments and passes them to DiffViewer.
 * For local diffs, passes through without comment loading.
 */
function DiffViewerWithComments({ activeDiffTab }: { activeDiffTab: DiffTab }) {
  const { data: mrComments } = useMrComments(
    activeDiffTab.isMrDiff ? activeDiffTab.taskId : undefined,
  );

  return (
    <DiffViewer
      machineId={activeDiffTab.machineId}
      repoPath={activeDiffTab.repoPath}
      filePath={activeDiffTab.filePath}
      commitSha={activeDiffTab.commitSha}
      comments={mrComments ?? undefined}
      taskId={activeDiffTab.taskId}
      isMrDiff={activeDiffTab.isMrDiff}
    />
  );
}

export function CenterPanel() {
  const activeMachineId = useMachineStore((s) => s.activeMachineId);
  const claudeViewActive = useMachineStore((s) => s.claudeViewActive);
  const machineStatuses = useMachineStore((s) => s.machineStatuses);
  const machines = useMachineStore((s) => s.machines);
  const activeSessionId = useSessionStore((s) => s.activeSessionId);
  const sessions = useSessionStore((s) => s.sessions);
  const setSessions = useSessionStore((s) => s.setSessions);
  const setActiveSession = useSessionStore((s) => s.setActiveSession);
  const activeTask = useTaskStore((s) => s.activeTask);
  const setActiveTask = useTaskStore((s) => s.setActiveTask);
  const activeDiffTab = useSessionStore((s) => s.activeDiffTab);
  const openDiffTab = useSessionStore((s) => s.openDiffTab);
  const closeDiffTab = useSessionStore((s) => s.closeDiffTab);

  // Unified tab system
  const tabs = useSessionStore((s) => s.tabs);
  const activeTabId = useSessionStore((s) => s.activeTabId);
  const activeTab = tabs.find((t) => t.id === activeTabId);

  // Hydrate activeTask from server ONLY on initial mount
  const { data: allTasks } = useTasks();
  const hydrated = useRef(false);
  useEffect(() => {
    if (hydrated.current) return;
    if (!activeTask && allTasks) {
      const firstActive = allTasks.find((t) => t.status === "active");
      if (firstActive) {
        setActiveTask(firstActive);
      }
      hydrated.current = true;
    }
  }, [allTasks, activeTask, setActiveTask]);

  const fetchedMachinesRef = useRef<Set<string>>(new Set());

  // Determine if active machine needs setup
  const activeMachine = machines.find((m) => m.id === activeMachineId);
  const activeStatus = activeMachineId
    ? machineStatuses[activeMachineId] ?? activeMachine?.status
    : undefined;
  const machineNeedsSetup =
    activeMachineId &&
    isLocalMachine(activeMachineId) &&
    activeStatus === "needs_setup";

  // Fetch sessions only once per machine (not on every tab switch)
  useEffect(() => {
    if (!activeMachineId) return;
    if (machineNeedsSetup) return;
    if (fetchedMachinesRef.current.has(activeMachineId)) return;

    fetchedMachinesRef.current.add(activeMachineId);
    apiGet<TerminalSession[]>(`/api/sessions?machine_id=${activeMachineId}`)
      .then((fetchedSessions) => {
        setSessions(fetchedSessions);
        const first = fetchedSessions[0];
        if (first && !activeSessionId) {
          setActiveSession(first.id);
        }
      })
      .catch((err) => console.error("Failed to fetch sessions:", err));
  }, [activeMachineId, machineNeedsSetup, setSessions, setActiveSession, activeSessionId]);

  const machineSessions = sessions.filter(
    (s) => s.machine_id === activeMachineId,
  );

  // Render editor content when the active tab is an editor tab
  function renderEditorContent() {
    if (!activeTab || activeTab.type !== "editor" || !activeTab.editorData) {
      return null;
    }
    return (
      <div className="absolute inset-0 flex flex-col">
        <div className="flex items-center gap-2 px-3 py-1 border-b border-border bg-secondary shrink-0">
          <FileBreadcrumb
            filePath={activeTab.editorData.filePath}
            repoPath={activeTab.editorData.repoPath}
            machineId={activeTab.editorData.machineId}
          />
        </div>
        <div className="flex-1 min-h-0">
          <CodeEditor
            tabId={activeTab.id}
            machineId={activeTab.editorData.machineId}
            repoPath={activeTab.editorData.repoPath}
            filePath={activeTab.editorData.filePath}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <MachineTabBar />
      {claudeViewActive ? (
        <div className="flex-1 overflow-y-auto">
          <ClaudeOverview />
        </div>
      ) : machineNeedsSetup ? (
        <div className="flex flex-1 items-center justify-center">
          <div className="max-w-md text-center px-6">
            <AlertTriangle size={32} className="mx-auto mb-4 text-warning" />
            <h3 className="text-base font-semibold text-primary-text">
              Host access not configured
            </h3>
            <p className="mt-2 text-sm text-muted leading-relaxed">
              Locus is running inside Docker and cannot reach your host machine
              directly. To use &quot;This Machine&quot; terminals, configure one of:
            </p>
            <div className="mt-4 space-y-3 text-left">
              <div className="rounded border border-border bg-secondary p-3">
                <p className="text-sm font-medium text-primary-text">
                  Option A: Locus Host Agent
                </p>
                <p className="mt-1 text-xs text-muted">
                  A lightweight process running on your host that bridges Docker
                  to the host. Coming in Phase 5.
                </p>
              </div>
              <div className="rounded border border-border bg-secondary p-3">
                <p className="text-sm font-medium text-primary-text">
                  Option B: SSH to host
                </p>
                <p className="mt-1 text-xs text-muted">
                  Set <code className="rounded bg-dominant px-1 text-accent">LOCUS_LOCAL_SSH_USER</code>{" "}
                  and <code className="rounded bg-dominant px-1 text-accent">LOCUS_LOCAL_SSH_KEY</code>{" "}
                  in your Docker environment to connect to the host via SSH.
                </p>
              </div>
            </div>
            <p className="mt-4 text-xs text-muted">
              Remote machines are unaffected and work normally.
            </p>
          </div>
        </div>
      ) : (
        <>
          {activeTask && <ContextStrip />}
          <SessionTabBar />
          {activeDiffTab && (
            <>
              <div className="flex h-7 shrink-0 items-center gap-2 bg-secondary border-b border-border px-2">
                {activeDiffTab.type === "mr" ? (
                  <GitPullRequest size={12} className="text-accent shrink-0" />
                ) : activeDiffTab.type === "file" ? (
                  <FileCode size={12} className="text-accent shrink-0" />
                ) : (
                  <GitCommitHorizontal size={12} className="text-accent shrink-0" />
                )}
                <span className="text-xs font-medium text-accent truncate">
                  {activeDiffTab.label}
                </span>
                {/* Open in Editor button -- opens file in a separate editor tab */}
                {activeDiffTab.filePath && (
                  <button
                    onClick={() => {
                      // Open the file as a new diff tab of type "file" (editor tab)
                      // This creates an independent tab for the same file
                      openDiffTab({
                        type: "file",
                        machineId: activeDiffTab.machineId,
                        repoPath: activeDiffTab.repoPath,
                        filePath: activeDiffTab.filePath,
                        label: `[Edit] ${activeDiffTab.filePath?.split("/").pop() ?? activeDiffTab.label}`,
                      });
                    }}
                    className="ml-1 flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-[10px] text-muted hover:text-primary-text hover:bg-hover transition-colors"
                    title="Open in Editor"
                  >
                    <FileEdit size={11} />
                    Edit
                  </button>
                )}
                <button
                  onClick={closeDiffTab}
                  className="ml-auto shrink-0 text-muted hover:text-primary-text p-0.5 rounded hover:bg-dominant transition-colors"
                  aria-label="Close diff tab"
                >
                  <X size={12} />
                </button>
              </div>
              {/* Breadcrumb navigation */}
              <FileBreadcrumb
                machineId={activeDiffTab.machineId}
                repoPath={activeDiffTab.repoPath}
                filePath={activeDiffTab.filePath}
              />
            </>
          )}
          {activeDiffTab?.isMrDiff && activeDiffTab.taskId && (
            <MrMetadataHeader taskId={activeDiffTab.taskId} />
          )}
          <div className="relative flex-1 overflow-hidden">
            {activeDiffTab && (
              <div className="absolute inset-0">
                <DiffViewerWithComments activeDiffTab={activeDiffTab} />
              </div>
            )}
            {/* Editor tab content */}
            {!activeDiffTab && activeTab?.type === "editor" && renderEditorContent()}
            {!activeDiffTab && !activeTab && !activeMachineId && (
              <div className="flex absolute inset-0 items-center justify-center">
                <div className="text-center">
                  <h3 className="text-sm font-semibold text-primary-text">
                    No active sessions
                  </h3>
                  <p className="mt-1 text-xs text-muted">
                    Select a machine from the sidebar, or add a new one to open a
                    terminal.
                  </p>
                </div>
              </div>
            )}
            {!activeDiffTab && activeTab?.type !== "editor" && activeMachineId && machineSessions.length === 0 && (
              <div className="flex absolute inset-0 items-center justify-center text-muted text-xs">
                No session selected. Click &quot;+&quot; to start a terminal session.
              </div>
            )}
            {/* Keep all terminal views mounted (for state preservation) but only show the active one */}
            {machineSessions.map((s) => {
              const isActiveTerminal =
                !activeDiffTab &&
                activeTab?.type === "terminal" &&
                activeTab.terminalData?.sessionId === s.id;
              return (
                <div
                  key={s.id}
                  className="absolute inset-0"
                  style={
                    isActiveTerminal
                      ? undefined
                      : { transform: "translateX(-200%)", pointerEvents: "none" }
                  }
                >
                  <TerminalView
                    sessionId={s.id}
                    machineId={s.machine_id}
                    isVisible={isActiveTerminal}
                  />
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
