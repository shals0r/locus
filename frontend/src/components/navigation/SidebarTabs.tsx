import { GitBranch, Search, FolderTree } from "lucide-react";

export type SidebarTabId = "git" | "search" | "files";

interface SidebarTabsProps {
  activeTab: SidebarTabId;
  onTabChange: (tab: SidebarTabId) => void;
}

const tabs: { id: SidebarTabId; label: string; Icon: typeof GitBranch }[] = [
  { id: "git", label: "Git", Icon: GitBranch },
  { id: "search", label: "Search", Icon: Search },
  { id: "files", label: "Files", Icon: FolderTree },
];

export function SidebarTabs({ activeTab, onTabChange }: SidebarTabsProps) {
  return (
    <div className="flex items-center border-b border-border bg-dominant">
      {tabs.map(({ id, label, Icon }) => (
        <button
          key={id}
          onClick={() => onTabChange(id)}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-medium uppercase tracking-wide transition-colors ${
            activeTab === id
              ? "border-b-2 border-accent text-accent"
              : "text-muted hover:text-primary-text"
          }`}
        >
          <Icon size={12} />
          {label}
        </button>
      ))}
    </div>
  );
}
