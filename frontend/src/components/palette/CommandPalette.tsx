import { useCallback, useEffect, useRef, useState } from "react";
import { Command } from "cmdk";
import {
  GitBranch,
  Server,
  Inbox,
  CheckSquare,
  PanelLeft,
  PanelRight,
  Plus,
  Terminal,
  Search,
  FileText,
  ArrowDownToLine,
  FolderSearch,
  SplitSquareHorizontal,
  Save,
  FileEdit,
} from "lucide-react";
import { useCommandPaletteStore } from "../../stores/commandPaletteStore";
import { usePanelStore } from "../../stores/panelStore";
import { useMachineStore } from "../../stores/machineStore";
import { useSessionStore } from "../../stores/sessionStore";
import { apiGet } from "../../hooks/useApi";

// ------------------------------------------------------------------
// Types for search results from /api/search
// ------------------------------------------------------------------
interface SearchResult {
  type: "repo" | "machine" | "feed_item" | "task";
  id: string;
  title: string;
  subtitle?: string;
}

interface SearchResponse {
  results: SearchResult[];
}

// ------------------------------------------------------------------
// Static actions that always appear in the palette
// ------------------------------------------------------------------
interface StaticAction {
  id: string;
  title: string;
  subtitle?: string;
  shortcut?: string;
  icon: typeof GitBranch;
  group: "navigation" | "file" | "editor";
  onSelect: () => void;
  /** Only show when condition is met */
  when?: () => boolean;
}

// ------------------------------------------------------------------
// Icon map per result type
// ------------------------------------------------------------------
const typeIcons: Record<SearchResult["type"], typeof GitBranch> = {
  repo: GitBranch,
  machine: Server,
  feed_item: Inbox,
  task: CheckSquare,
};

const groupLabels: Record<SearchResult["type"], string> = {
  repo: "Repos",
  machine: "Machines",
  feed_item: "Feed Items",
  task: "Tasks",
};

const groupOrder: SearchResult["type"][] = [
  "repo",
  "machine",
  "feed_item",
  "task",
];

export function CommandPalette() {
  const isOpen = useCommandPaletteStore((s) => s.isOpen);
  const close = useCommandPaletteStore((s) => s.close);
  const toggle = useCommandPaletteStore((s) => s.toggle);
  const mode = useCommandPaletteStore((s) => s.mode);
  const setMode = useCommandPaletteStore((s) => s.setMode);

  const toggleSidebar = usePanelStore((s) => s.toggleSidebar);
  const setSidebarCollapsed = usePanelStore((s) => s.setSidebarCollapsed);
  const setRightPanelCollapsed = usePanelStore(
    (s) => s.setRightPanelCollapsed,
  );
  const rightPanelCollapsed = usePanelStore((s) => s.rightPanelCollapsed);
  const setActiveMachine = useMachineStore((s) => s.setActiveMachine);
  const activeDiffTab = useSessionStore((s) => s.activeDiffTab);

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [lineNumber, setLineNumber] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ------------------------------------------------------------------
  // Keyboard shortcut: Ctrl+K and Ctrl+P both toggle palette
  // ------------------------------------------------------------------
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (
        (e.ctrlKey || e.metaKey) &&
        (e.key === "k" || e.key === "p")
      ) {
        e.preventDefault();
        toggle();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [toggle]);

  // ------------------------------------------------------------------
  // Reset state when palette closes
  // ------------------------------------------------------------------
  useEffect(() => {
    if (!isOpen) {
      setQuery("");
      setResults([]);
      setLineNumber("");
      setMode("default");
      return;
    }
  }, [isOpen, setMode]);

  // ------------------------------------------------------------------
  // Debounced server-side search (default mode only)
  // ------------------------------------------------------------------
  useEffect(() => {
    if (mode !== "default") return;
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    if (!query.trim()) {
      setResults([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const data = await apiGet<SearchResponse>(
          `/api/search?q=${encodeURIComponent(query.trim())}`,
        );
        setResults(data.results ?? []);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 200);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [query, mode]);

  // ------------------------------------------------------------------
  // Navigation handlers for search results
  // ------------------------------------------------------------------
  const handleResultSelect = useCallback(
    (result: SearchResult) => {
      close();
      switch (result.type) {
        case "repo":
          usePanelStore.getState().setSidebarCollapsed(false);
          break;
        case "machine":
          setActiveMachine(result.id);
          break;
        case "feed_item":
          setRightPanelCollapsed(false);
          break;
        case "task":
          setRightPanelCollapsed(false);
          break;
      }
    },
    [close, setActiveMachine, setRightPanelCollapsed],
  );

  // ------------------------------------------------------------------
  // Go to Line handler
  // ------------------------------------------------------------------
  const handleGoToLine = useCallback(() => {
    const num = parseInt(lineNumber, 10);
    if (isNaN(num) || num < 1) return;
    // Currently a no-op until full editor with Monaco is wired.
    // The line number can be used in the future via editorRef.revealLineInCenter.
    close();
  }, [lineNumber, close]);

  // ------------------------------------------------------------------
  // Static actions -- always visible
  // ------------------------------------------------------------------
  const staticActions: StaticAction[] = [
    // Navigation actions
    {
      id: "action-toggle-sidebar",
      title: "Toggle Sidebar",
      shortcut: "Ctrl+B",
      icon: PanelLeft,
      group: "navigation",
      onSelect: () => {
        close();
        toggleSidebar();
      },
    },
    {
      id: "action-toggle-feed",
      title: "Toggle Feed Panel",
      shortcut: "Ctrl+J",
      icon: PanelRight,
      group: "navigation",
      onSelect: () => {
        close();
        setRightPanelCollapsed(!rightPanelCollapsed);
      },
    },
    {
      id: "action-new-task",
      title: "New Task",
      icon: Plus,
      group: "navigation",
      onSelect: () => {
        close();
      },
    },
    {
      id: "action-open-terminal",
      title: "Open Terminal",
      shortcut: "Ctrl+`",
      icon: Terminal,
      group: "navigation",
      onSelect: () => {
        close();
      },
    },
    // File actions
    {
      id: "action-open-file",
      title: "Open File...",
      subtitle: "Switch to sidebar Files tab",
      icon: FileText,
      group: "file",
      onSelect: () => {
        close();
        setSidebarCollapsed(false);
        // Trigger sidebar to switch to Files tab
        // The sidebar listens via a global event for simplicity
        window.dispatchEvent(new CustomEvent("locus:sidebar-tab", { detail: "files" }));
      },
    },
    {
      id: "action-search-in-files",
      title: "Search in Files...",
      subtitle: "Switch to sidebar Search tab",
      icon: FolderSearch,
      group: "file",
      onSelect: () => {
        close();
        setSidebarCollapsed(false);
        window.dispatchEvent(new CustomEvent("locus:sidebar-tab", { detail: "search" }));
        // Focus search input after a brief delay for re-render
        setTimeout(() => {
          const focusFn = (window as unknown as Record<string, unknown>).__locusFileSearchFocus;
          if (typeof focusFn === "function") {
            (focusFn as () => void)();
          }
        }, 100);
      },
    },
    // Editor actions
    {
      id: "action-goto-line",
      title: "Go to Line...",
      subtitle: "Jump to a specific line number",
      icon: ArrowDownToLine,
      group: "editor",
      onSelect: () => {
        setMode("goto-line");
      },
      when: () => !!activeDiffTab,
    },
    {
      id: "action-toggle-diff-mode",
      title: "Toggle Split/Unified Diff",
      subtitle: "Switch between split and unified diff view",
      icon: SplitSquareHorizontal,
      group: "editor",
      onSelect: () => {
        close();
        // Dispatch event for DiffViewer to toggle mode
        window.dispatchEvent(new CustomEvent("locus:toggle-diff-mode"));
      },
      when: () => !!activeDiffTab,
    },
    {
      id: "action-save-file",
      title: "Save File",
      shortcut: "Ctrl+S",
      icon: Save,
      group: "editor",
      onSelect: () => {
        close();
        // Future: trigger file save when editor is implemented
      },
      when: () => !!activeDiffTab,
    },
    {
      id: "action-edit-file",
      title: "Open in Editor",
      subtitle: "Open current diff file in editor tab",
      icon: FileEdit,
      group: "editor",
      onSelect: () => {
        if (activeDiffTab?.filePath) {
          close();
          useSessionStore.getState().openDiffTab({
            type: "file",
            machineId: activeDiffTab.machineId,
            repoPath: activeDiffTab.repoPath,
            filePath: activeDiffTab.filePath,
            label: `[Edit] ${activeDiffTab.filePath.split("/").pop() ?? activeDiffTab.label}`,
          });
        }
      },
      when: () => !!activeDiffTab?.filePath,
    },
  ];

  // Filter actions by `when` condition
  const visibleActions = staticActions.filter(
    (a) => !a.when || a.when(),
  );

  // Group actions
  const actionGroups = [
    { label: "Navigation", actions: visibleActions.filter((a) => a.group === "navigation") },
    { label: "Files", actions: visibleActions.filter((a) => a.group === "file") },
    { label: "Editor", actions: visibleActions.filter((a) => a.group === "editor") },
  ].filter((g) => g.actions.length > 0);

  // ------------------------------------------------------------------
  // Group results by type
  // ------------------------------------------------------------------
  const groupedResults = groupOrder
    .map((type) => ({
      type,
      label: groupLabels[type],
      items: results.filter((r) => r.type === type),
    }))
    .filter((g) => g.items.length > 0);

  if (!isOpen) return null;

  // Go to Line mode
  if (mode === "goto-line") {
    return (
      <Command.Dialog
        open={isOpen}
        onOpenChange={(open) => {
          if (!open) close();
        }}
        shouldFilter={false}
        label="Go to Line"
        overlayClassName="fixed inset-0 bg-black/50 z-50"
        contentClassName="fixed top-[20%] left-1/2 -translate-x-1/2 w-[400px] bg-dominant rounded-lg shadow-2xl border border-border z-50"
      >
        <div className="flex items-center gap-2 border-b border-border px-4 py-3">
          <ArrowDownToLine size={16} className="text-muted shrink-0" />
          <input
            type="number"
            min={1}
            value={lineNumber}
            onChange={(e) => setLineNumber(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleGoToLine();
              if (e.key === "Escape") close();
            }}
            placeholder="Enter line number..."
            className="w-full bg-transparent text-primary-text text-sm outline-none placeholder:text-muted [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
            autoFocus
          />
        </div>
        <div className="px-4 py-2 text-xs text-muted">
          Press Enter to go to line, Escape to cancel
        </div>
      </Command.Dialog>
    );
  }

  return (
    <Command.Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) close();
      }}
      shouldFilter={false}
      label="Command Palette"
      overlayClassName="fixed inset-0 bg-black/50 z-50"
      contentClassName="fixed top-[20%] left-1/2 -translate-x-1/2 w-[560px] bg-dominant rounded-lg shadow-2xl border border-border z-50"
    >
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        <Search size={16} className="text-muted shrink-0" />
        <Command.Input
          value={query}
          onValueChange={setQuery}
          placeholder="Search repos, machines, feed items, tasks..."
          className="w-full bg-transparent text-primary-text text-sm outline-none placeholder:text-muted"
        />
      </div>

      <Command.List className="max-h-[400px] overflow-y-auto p-1">
        {loading && (
          <Command.Loading className="px-3 py-2 text-xs text-muted">
            Searching...
          </Command.Loading>
        )}

        <Command.Empty className="px-3 py-6 text-center text-sm text-muted">
          No results found.
        </Command.Empty>

        {/* Dynamic search results grouped by type */}
        {groupedResults.map((group) => {
          const Icon = typeIcons[group.type];
          return (
            <Command.Group
              key={group.type}
              heading={group.label}
              className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-muted"
            >
              {group.items.map((item) => (
                <Command.Item
                  key={`${item.type}-${item.id}`}
                  value={`${item.type}-${item.id}`}
                  onSelect={() => handleResultSelect(item)}
                  className="mx-1 flex cursor-pointer items-center gap-2 rounded-sm px-3 py-2 text-sm aria-selected:bg-hover hover:bg-hover"
                >
                  <Icon size={14} className="shrink-0 text-muted" />
                  <span className="truncate text-primary-text">
                    {item.title}
                  </span>
                  {item.subtitle && (
                    <span className="ml-auto shrink-0 text-xs text-muted">
                      {item.subtitle}
                    </span>
                  )}
                </Command.Item>
              ))}
            </Command.Group>
          );
        })}

        {/* Action groups */}
        {actionGroups.map((group) => (
          <Command.Group
            key={group.label}
            heading={group.label}
            className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-muted"
          >
            {group.actions.map((action) => {
              const ActionIcon = action.icon;
              return (
                <Command.Item
                  key={action.id}
                  value={action.id}
                  onSelect={action.onSelect}
                  className="mx-1 flex cursor-pointer items-center gap-2 rounded-sm px-3 py-2 text-sm aria-selected:bg-hover hover:bg-hover"
                >
                  <ActionIcon size={14} className="shrink-0 text-muted" />
                  <span className="truncate text-primary-text">
                    {action.title}
                  </span>
                  {action.subtitle && (
                    <span className="ml-1 truncate text-xs text-muted">
                      {action.subtitle}
                    </span>
                  )}
                  {action.shortcut && (
                    <kbd className="ml-auto shrink-0 rounded border border-border bg-secondary px-1.5 py-0.5 text-[10px] font-mono text-muted">
                      {action.shortcut}
                    </kbd>
                  )}
                </Command.Item>
              );
            })}
          </Command.Group>
        ))}
      </Command.List>
    </Command.Dialog>
  );
}
