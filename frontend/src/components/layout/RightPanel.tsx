import { Rss, LayoutGrid } from "lucide-react";
import { useFeedStore } from "../../stores/feedStore";
import { useFeedItems } from "../../hooks/useFeedQueries";
import { useTasks } from "../../hooks/useTaskQueries";
import { FeedPanel } from "../feed/FeedPanel";
import { BoardPanel } from "../board/BoardPanel";

/**
 * Right panel with Feed/Board tab toggle.
 * Renders FeedPanel when "feed" tab is active, BoardPanel placeholder for "board".
 */
export function RightPanel() {
  const activeTab = useFeedStore((s) => s.activeTab);
  const setActiveTab = useFeedStore((s) => s.setActiveTab);

  // Counts for tab badges
  const { data: feedItems } = useFeedItems();
  const feedCount = feedItems?.filter((i) => !i.is_dismissed).length ?? 0;

  const { data: tasks } = useTasks();
  const boardCount = tasks?.filter((t) => t.status !== "done").length ?? 0;

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
          {feedCount > 0 && (
            <span className="ml-1 rounded-full bg-accent/20 px-1.5 text-[10px] font-medium text-accent">
              {feedCount}
            </span>
          )}
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
          {boardCount > 0 && (
            <span className="ml-1 rounded-full bg-accent/20 px-1.5 text-[10px] font-medium text-accent">
              {boardCount}
            </span>
          )}
        </button>
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-hidden">
        {activeTab === "feed" ? <FeedPanel /> : <BoardPanel />}
      </div>
    </div>
  );
}
