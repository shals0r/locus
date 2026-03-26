import { Rss, LayoutGrid } from "lucide-react";
import { useFeedStore } from "../../stores/feedStore";
import { FeedPanel } from "../feed/FeedPanel";

/**
 * Right panel with Feed/Board tab toggle.
 * Renders FeedPanel when "feed" tab is active, BoardPanel placeholder for "board".
 */
export function RightPanel() {
  const activeTab = useFeedStore((s) => s.activeTab);
  const setActiveTab = useFeedStore((s) => s.setActiveTab);

  return (
    <div className="flex h-full flex-col bg-secondary border-l border-border">
      {/* Tab header */}
      <div className="flex items-center border-b border-border">
        <button
          className={`flex flex-1 items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium transition-colors ${
            activeTab === "feed"
              ? "text-accent border-b-2 border-accent"
              : "text-muted hover:text-primary-text"
          }`}
          onClick={() => setActiveTab("feed")}
        >
          <Rss size={14} />
          Feed
        </button>
        <button
          className={`flex flex-1 items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium transition-colors ${
            activeTab === "board"
              ? "text-accent border-b-2 border-accent"
              : "text-muted hover:text-primary-text"
          }`}
          onClick={() => setActiveTab("board")}
        >
          <LayoutGrid size={14} />
          Board
        </button>
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-hidden">
        {activeTab === "feed" ? (
          <FeedPanel />
        ) : (
          <div className="flex h-full items-center justify-center">
            <p className="text-xs text-muted">Board coming soon</p>
          </div>
        )}
      </div>
    </div>
  );
}
