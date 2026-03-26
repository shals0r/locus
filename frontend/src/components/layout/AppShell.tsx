import { useCallback, useEffect, useRef } from "react";
import {
  Panel,
  PanelGroup,
  PanelResizeHandle,
} from "react-resizable-panels";
import type { ImperativePanelHandle } from "react-resizable-panels";
import { usePanelStore } from "../../stores/panelStore";
import { useMachineStore } from "../../stores/machineStore";
import { apiGet } from "../../hooks/useApi";
import type { Machine } from "../../types";
import { TopBar } from "./TopBar";
import { Sidebar } from "./Sidebar";
import { CenterPanel } from "./CenterPanel";
import { RightPanel } from "./RightPanel";

const RIGHT_PANEL_DEFAULT_SIZE = 25;

export function AppShell() {
  const sidebarCollapsed = usePanelStore((s) => s.sidebarCollapsed);
  const setSidebarCollapsed = usePanelStore((s) => s.setSidebarCollapsed);
  const rightPanelCollapsed = usePanelStore((s) => s.rightPanelCollapsed);
  const setRightPanelCollapsed = usePanelStore((s) => s.setRightPanelCollapsed);
  const toggleSidebar = usePanelStore((s) => s.toggleSidebar);
  const setMachines = useMachineStore((s) => s.setMachines);
  const sidebarRef = useRef<ImperativePanelHandle>(null);
  const rightPanelRef = useRef<ImperativePanelHandle>(null);

  // Fetch machines on mount
  useEffect(() => {
    apiGet<Machine[]>("/api/machines")
      .then(setMachines)
      .catch(() => {});
  }, [setMachines]);

  // Sync panel ref with store state
  useEffect(() => {
    const panel = sidebarRef.current;
    if (!panel) return;

    if (sidebarCollapsed) {
      panel.collapse();
    } else {
      panel.expand();
    }
  }, [sidebarCollapsed]);

  // Sync right panel ref with store state
  useEffect(() => {
    const panel = rightPanelRef.current;
    if (!panel) return;

    if (rightPanelCollapsed) {
      panel.collapse();
    } else {
      panel.expand();
    }
  }, [rightPanelCollapsed]);

  // Right panel collapse/expand events from drag
  const handleRightPanelCollapse = useCallback(() => {
    setRightPanelCollapsed(true);
  }, [setRightPanelCollapsed]);

  const handleRightPanelExpand = useCallback(() => {
    setRightPanelCollapsed(false);
  }, [setRightPanelCollapsed]);

  // Keyboard shortcut: Ctrl+B to toggle sidebar
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === "b") {
        e.preventDefault();
        toggleSidebar();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [toggleSidebar]);

  // Handle panel collapse/expand events from drag
  const handleSidebarCollapse = useCallback(() => {
    setSidebarCollapsed(true);
  }, [setSidebarCollapsed]);

  const handleSidebarExpand = useCallback(() => {
    setSidebarCollapsed(false);
  }, [setSidebarCollapsed]);

  // Double-click resize handle to reset sidebar to default width
  const handleDoubleClickSidebar = useCallback(() => {
    const panel = sidebarRef.current;
    if (panel) {
      if (sidebarCollapsed) {
        panel.expand();
        panel.resize(20);
      } else {
        panel.resize(20);
      }
    }
  }, [sidebarCollapsed]);

  return (
    <div className="flex h-screen flex-col bg-dominant text-primary-text">
      <TopBar />
      <PanelGroup direction="horizontal" className="flex-1">
        {/* Left sidebar */}
        <Panel
          ref={sidebarRef}
          defaultSize={20}
          minSize={10}
          collapsible
          collapsedSize={0}
          onCollapse={handleSidebarCollapse}
          onExpand={handleSidebarExpand}
        >
          <Sidebar />
        </Panel>

        <PanelResizeHandle
          className="w-1 bg-border hover:bg-accent transition-colors cursor-col-resize"
          onDoubleClick={handleDoubleClickSidebar}
        />

        {/* Center panel */}
        <Panel defaultSize={80 - RIGHT_PANEL_DEFAULT_SIZE} minSize={30}>
          <CenterPanel />
        </Panel>

        <PanelResizeHandle className="w-1 bg-border hover:bg-accent transition-colors cursor-col-resize" />

        {/* Right panel (feed/board) */}
        <Panel
          ref={rightPanelRef}
          defaultSize={RIGHT_PANEL_DEFAULT_SIZE}
          minSize={15}
          collapsible
          collapsedSize={0}
          onCollapse={handleRightPanelCollapse}
          onExpand={handleRightPanelExpand}
        >
          <RightPanel />
        </Panel>
      </PanelGroup>
    </div>
  );
}
