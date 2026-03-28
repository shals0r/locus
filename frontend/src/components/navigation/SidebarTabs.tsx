import { useState } from "react";
import { GitBranch, FolderTree, Search } from "lucide-react";

export type SidebarTabId = "git" | "files" | "search";

const sidebarTabConfig: { id: SidebarTabId; label: string; Icon: typeof GitBranch }[] = [
  { id: "git", label: "Git", Icon: GitBranch },
  { id: "files", label: "Files", Icon: FolderTree },
  { id: "search", label: "Search", Icon: Search },
];

export function SidebarTabs({
  activeTab,
  onTabChange,
}: {
  activeTab: SidebarTabId;
  onTabChange: (tab: SidebarTabId) => void;
}) {
  return (
    <div className="flex items-stretch border-b border-border bg-secondary">
      {sidebarTabConfig.map(({ id, label, Icon }) => {
        const isActive = activeTab === id;
        return (
          <button
            key={id}
            onClick={() => onTabChange(id)}
            className={`flex flex-1 items-center justify-center gap-1 py-1.5 text-[10px] font-medium uppercase tracking-wide transition-colors ${
              isActive
                ? "border-b-2 border-accent text-accent"
                : "border-b-2 border-transparent text-muted hover:text-primary-text"
            }`}
          >
            <Icon size={11} />
            {label}
          </button>
        );
      })}
    </div>
  );
}

/** Placeholder content for sidebar tabs not yet implemented */
export function SidebarTabPlaceholder({ tab }: { tab: SidebarTabId }) {
  const messages: Record<SidebarTabId, string> = {
    git: "", // never shown -- git tab renders real content
    files: "File tree coming in Plan 07",
    search: "Search coming in Plan 07",
  };

  return (
    <div className="flex flex-1 items-center justify-center px-4 py-8 text-center">
      <p className="text-[10px] text-muted">{messages[tab]}</p>
    </div>
  );
}
