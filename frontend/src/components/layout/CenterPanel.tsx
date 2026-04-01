import { useEffect, useRef } from "react";
import { AlertTriangle, X } from "lucide-react";
import { useMachineStore } from "../../stores/machineStore";
import { usePanelStore } from "../../stores/panelStore";
import { useSessionStore } from "../../stores/sessionStore";
import { useTaskStore } from "../../stores/taskStore";
import { apiGet } from "../../hooks/useApi";
import { useTasks } from "../../hooks/useTaskQueries";
import type { TerminalSession } from "../../types";
import { isLocalMachine } from "../../types";
import { MachineTabBar } from "../navigation/MachineTabBar";
import { SessionTabBar } from "../navigation/SessionTabBar";
import { ContextStrip } from "../session/ContextStrip";
import { TerminalView } from "../terminal/TerminalView";
import { DiffPanel } from "../diff/DiffPanel";
import { CodeEditor } from "../editor/CodeEditor";
import { FileBreadcrumb } from "../editor/FileBreadcrumb";
import { SettingsPage } from "../settings/SettingsPage";

export function CenterPanel() {
  const activeMachineId = useMachineStore((s) => s.activeMachineId);
  const machineStatuses = useMachineStore((s) => s.machineStatuses);
  const machines = useMachineStore((s) => s.machines);
  const activeSessionId = useSessionStore((s) => s.activeSessionId);
  const sessions = useSessionStore((s) => s.sessions);
  const setSessions = useSessionStore((s) => s.setSessions);
  const setActiveSession = useSessionStore((s) => s.setActiveSession);
  const restoreSessionTabs = useSessionStore((s) => s.restoreSessionTabs);
  const activeTask = useTaskStore((s) => s.activeTask);
  const setActiveTask = useTaskStore((s) => s.setActiveTask);
  // Unified tab system — single source of truth for all tab types
  const tabs = useSessionStore((s) => s.tabs);
  const activeTabId = useSessionStore((s) => s.activeTabId);
  const activeTab = tabs.find((t) => t.id === activeTabId);
  const settingsOpen = usePanelStore((s) => s.settingsOpen);
  const setSettingsOpen = usePanelStore((s) => s.setSettingsOpen);

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
        restoreSessionTabs(fetchedSessions);
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
      {settingsOpen ? (
        <div className="flex flex-1 flex-col overflow-hidden">
          <div className="flex items-center justify-between border-b border-border bg-secondary px-4 py-2">
            <span className="text-sm font-medium text-primary-text">Settings</span>
            <button
              onClick={() => setSettingsOpen(false)}
              className="rounded p-1 text-muted hover:text-primary-text hover:bg-hover transition-colors"
              aria-label="Close settings"
            >
              <X size={14} />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto">
            <SettingsPage />
          </div>
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
                  Option A: Locus Host Agent (Recommended)
                </p>
                <p className="mt-1 text-xs text-muted">
                  A lightweight process running on your host that bridges Docker
                  to the host.
                </p>
                <pre className="mt-2 rounded bg-dominant px-3 py-2 text-xs text-accent font-mono whitespace-pre"><code>pip install ./agent
locus-agent start</code></pre>
                <p className="mt-1 text-xs text-muted">
                  Runs on port 7700 by default. Locus auto-detects the agent from Docker.
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
          <div className="relative flex-1 overflow-hidden">
            {activeTab?.type === "diff" && activeTab.diffData && (
              <div className="absolute inset-0">
                <DiffPanel
                  key={activeTab.id}
                  machineId={activeTab.diffData.machineId}
                  repoPath={activeTab.diffData.repoPath}
                  filePath={activeTab.diffData.filePath}
                  commitSha={activeTab.diffData.commitSha}
                />
              </div>
            )}
            {activeTab?.type === "editor" && renderEditorContent()}
            {!activeTab && !activeMachineId && (
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
            {activeTab?.type !== "diff" && activeTab?.type !== "editor" && activeMachineId && machineSessions.length === 0 && (
              <div className="flex absolute inset-0 items-center justify-center text-muted text-xs">
                No session selected. Click &quot;+&quot; to start a terminal session.
              </div>
            )}
            {machineSessions.map((s) => {
              const isActiveTerminal =
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
