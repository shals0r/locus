import { useCallback, useEffect, useRef } from "react";
import {
  Panel,
  PanelGroup,
  PanelResizeHandle,
} from "react-resizable-panels";
import type { ImperativePanelHandle } from "react-resizable-panels";
import { usePanelStore } from "../../stores/panelStore";
import { TopBar } from "./TopBar";
import { Sidebar } from "./Sidebar";
import { CenterPanel } from "./CenterPanel";
import { RightPanel } from "./RightPanel";

export function AppShell() {
  const sidebarCollapsed = usePanelStore((s) => s.sidebarCollapsed);
  const setSidebarCollapsed = usePanelStore((s) => s.setSidebarCollapsed);
  const toggleSidebar = usePanelStore((s) => s.toggleSidebar);
  const sidebarRef = useRef<ImperativePanelHandle>(null);

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
        <Panel defaultSize={80} minSize={30}>
          <CenterPanel />
        </Panel>

        <PanelResizeHandle className="w-0" />

        {/* Right panel (collapsed in Phase 1) */}
        <Panel defaultSize={0} collapsible collapsedSize={0}>
          <RightPanel />
        </Panel>
      </PanelGroup>
    </div>
  );
}
