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
} from "lucide-react";
import { useCommandPaletteStore } from "../../stores/commandPaletteStore";
import { usePanelStore } from "../../stores/panelStore";
import { useMachineStore } from "../../stores/machineStore";
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
  onSelect: () => void;
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

  const toggleSidebar = usePanelStore((s) => s.toggleSidebar);
  const setRightPanelCollapsed = usePanelStore(
    (s) => s.setRightPanelCollapsed,
  );
  const rightPanelCollapsed = usePanelStore((s) => s.rightPanelCollapsed);
  const setActiveMachine = useMachineStore((s) => s.setActiveMachine);

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
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
  // Debounced server-side search
  // ------------------------------------------------------------------
  useEffect(() => {
    if (!isOpen) {
      setQuery("");
      setResults([]);
      return;
    }
  }, [isOpen]);

  useEffect(() => {
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
  }, [query]);

  // ------------------------------------------------------------------
  // Navigation handlers for search results
  // ------------------------------------------------------------------
  const handleResultSelect = useCallback(
    (result: SearchResult) => {
      close();
      switch (result.type) {
        case "repo":
          // When repo stores exist (02-06), this will set selectedRepo
          // For now, expand sidebar so user can find the repo
          usePanelStore.getState().setSidebarCollapsed(false);
          break;
        case "machine":
          setActiveMachine(result.id);
          break;
        case "feed_item":
          // When feed store exists (02-07), this will switch to Feed tab
          setRightPanelCollapsed(false);
          break;
        case "task":
          // When task store exists (02-08), this will switch to Board tab
          setRightPanelCollapsed(false);
          break;
      }
    },
    [close, setActiveMachine, setRightPanelCollapsed],
  );

  // ------------------------------------------------------------------
  // Static actions -- always visible
  // ------------------------------------------------------------------
  const staticActions: StaticAction[] = [
    {
      id: "action-toggle-sidebar",
      title: "Toggle Sidebar",
      shortcut: "Ctrl+B",
      onSelect: () => {
        close();
        toggleSidebar();
      },
    },
    {
      id: "action-toggle-feed",
      title: "Toggle Feed Panel",
      shortcut: "Ctrl+J",
      onSelect: () => {
        close();
        setRightPanelCollapsed(!rightPanelCollapsed);
      },
    },
    {
      id: "action-new-task",
      title: "New Task",
      onSelect: () => {
        close();
        // Task creation flow will be wired when task store is available (02-08)
      },
    },
    {
      id: "action-open-terminal",
      title: "Open Terminal",
      shortcut: "Ctrl+`",
      onSelect: () => {
        close();
        // Focus terminal -- dispatches to center panel focus
      },
    },
  ];

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

        {/* Static actions */}
        <Command.Group
          heading="Actions"
          className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-muted"
        >
          {staticActions.map((action) => (
            <Command.Item
              key={action.id}
              value={action.id}
              onSelect={action.onSelect}
              className="mx-1 flex cursor-pointer items-center gap-2 rounded-sm px-3 py-2 text-sm aria-selected:bg-hover hover:bg-hover"
            >
              {action.id === "action-toggle-sidebar" && (
                <PanelLeft size={14} className="shrink-0 text-muted" />
              )}
              {action.id === "action-toggle-feed" && (
                <PanelRight size={14} className="shrink-0 text-muted" />
              )}
              {action.id === "action-new-task" && (
                <Plus size={14} className="shrink-0 text-muted" />
              )}
              {action.id === "action-open-terminal" && (
                <Terminal size={14} className="shrink-0 text-muted" />
              )}
              <span className="truncate text-primary-text">
                {action.title}
              </span>
              {action.shortcut && (
                <kbd className="ml-auto shrink-0 rounded border border-border bg-secondary px-1.5 py-0.5 text-[10px] font-mono text-muted">
                  {action.shortcut}
                </kbd>
              )}
            </Command.Item>
          ))}
        </Command.Group>
      </Command.List>
    </Command.Dialog>
  );
}
