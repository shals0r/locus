import { useState, useCallback } from "react";
import {
  ArrowUp,
  Sparkles,
  Clock,
  X,
  Github,
  Ticket,
  Calendar,
  Globe,
} from "lucide-react";
import type { FeedItem, FeedTier } from "../../types";
import { useDismissItem, useSnoozeItem, usePromoteItem, useMarkRead } from "../../hooks/useFeedQueries";
import { SnoozeMenu } from "./SnoozeMenu";

const TIER_COLORS: Record<FeedTier, string> = {
  now: "border-l-red-500",
  respond: "border-l-orange-500",
  review: "border-l-blue-500",
  prep: "border-l-yellow-500",
  follow_up: "border-l-gray-500",
};

function SourceIcon({ sourceType }: { sourceType: string }) {
  const size = 14;
  const className = "text-muted shrink-0";

  switch (sourceType) {
    case "github":
      return <Github size={size} className={className} />;
    case "jira":
      return <Ticket size={size} className={className} />;
    case "calendar":
    case "google_calendar":
      return <Calendar size={size} className={className} />;
    default:
      return <Globe size={size} className={className} />;
  }
}

function relativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = now - then;

  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return "just now";

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;

  return new Date(dateStr).toLocaleDateString();
}

interface FeedCardProps {
  item: FeedItem;
}

/**
 * Feed item card with hover triage actions.
 *
 * Default state: source icon, title, timestamp, unread dot, snippet.
 * Hover state: action buttons replace snippet row.
 */
export function FeedCard({ item }: FeedCardProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [showSnooze, setShowSnooze] = useState(false);
  const [showPromoteModal, setShowPromoteModal] = useState(false);
  const [promoteTitle, setPromoteTitle] = useState(item.title);
  const [promoteContext, setPromoteContext] = useState(item.snippet ?? "");
  const [isDismissing, setIsDismissing] = useState(false);

  const dismissMutation = useDismissItem();
  const snoozeMutation = useSnoozeItem();
  const promoteMutation = usePromoteItem();
  const markReadMutation = useMarkRead();

  const tierColor = TIER_COLORS[item.tier] ?? "border-l-gray-500";

  const handleCardClick = useCallback(() => {
    if (!item.is_read) {
      markReadMutation.mutate(item.id);
    }
    // Toggle actions on tap (touch devices have no hover)
    setIsHovered((prev) => !prev);
  }, [item.id, item.is_read, markReadMutation]);

  const handleQuickPromote = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      promoteMutation.mutate({
        feedItemId: item.id,
        title: item.title,
        context: item.snippet ?? undefined,
      });
    },
    [item, promoteMutation],
  );

  const handleDeepPromote = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      setPromoteTitle(item.title);
      setPromoteContext(item.snippet ?? "");
      setShowPromoteModal(true);
    },
    [item],
  );

  const handlePromoteConfirm = useCallback(() => {
    promoteMutation.mutate({
      feedItemId: item.id,
      title: promoteTitle,
      context: promoteContext || undefined,
    });
    setShowPromoteModal(false);
  }, [item.id, promoteTitle, promoteContext, promoteMutation]);

  const handleDismiss = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      setIsDismissing(true);
      dismissMutation.mutate(item.id);
    },
    [item.id, dismissMutation],
  );

  const handleSnooze = useCallback(
    (until: string) => {
      snoozeMutation.mutate({ id: item.id, until });
      setShowSnooze(false);
    },
    [item.id, snoozeMutation],
  );

  return (
    <>
      <div
        className={`relative border-l-4 ${tierColor} px-2 py-1.5 hover:bg-hover transition-all cursor-pointer ${
          isDismissing ? "opacity-0 transition-opacity duration-300" : ""
        }`}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => {
          setIsHovered(false);
          setShowSnooze(false);
        }}
        onClick={handleCardClick}
      >
        {/* Top row: icon + title + timestamp + unread dot */}
        <div className="flex items-center gap-1.5">
          <SourceIcon sourceType={item.source_type} />
          <span className="flex-1 truncate text-sm font-medium text-primary-text">
            {item.title}
          </span>
          <span className="shrink-0 text-[10px] text-muted">
            {relativeTime(item.created_at)}
          </span>
          {!item.is_read && (
            <span className="ml-0.5 h-2 w-2 shrink-0 rounded-full bg-accent" />
          )}
        </div>

        {/* Bottom row: snippet or action buttons on hover */}
        <div className="mt-0.5 min-h-[20px]">
          {isHovered ? (
            <div className="flex items-center gap-1">
              <button
                title="Quick Promote"
                className="rounded p-1 text-muted hover:bg-accent/20 hover:text-accent transition-colors"
                onClick={handleQuickPromote}
              >
                <ArrowUp size={14} />
              </button>
              <button
                title="Deep Promote"
                className="rounded p-1 text-muted hover:bg-accent/20 hover:text-accent transition-colors"
                onClick={handleDeepPromote}
              >
                <Sparkles size={14} />
              </button>
              <div className="relative">
                <button
                  title="Snooze"
                  className="rounded p-1 text-muted hover:bg-warning/20 hover:text-warning transition-colors"
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowSnooze(!showSnooze);
                  }}
                >
                  <Clock size={14} />
                </button>
                {showSnooze && (
                  <SnoozeMenu
                    onSnooze={handleSnooze}
                    onClose={() => setShowSnooze(false)}
                  />
                )}
              </div>
              <button
                title="Dismiss"
                className="rounded p-1 text-muted hover:bg-destructive/20 hover:text-destructive transition-colors"
                onClick={handleDismiss}
              >
                <X size={14} />
              </button>
            </div>
          ) : (
            <p className="truncate text-xs text-muted">
              {item.snippet ?? "\u00A0"}
            </p>
          )}
        </div>
      </div>

      {/* Deep Promote Modal */}
      {showPromoteModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={() => setShowPromoteModal(false)}
        >
          <div
            className="w-[400px] rounded-lg border border-border bg-dominant p-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="mb-3 text-sm font-semibold text-primary-text">
              Promote to Task
            </h3>
            <label className="mb-1 block text-xs text-muted">Title</label>
            <input
              type="text"
              value={promoteTitle}
              onChange={(e) => setPromoteTitle(e.target.value)}
              className="mb-3 w-full rounded border border-border bg-secondary px-2 py-1.5 text-sm text-primary-text outline-none focus:border-accent"
            />
            <label className="mb-1 block text-xs text-muted">Context</label>
            <textarea
              value={promoteContext}
              onChange={(e) => setPromoteContext(e.target.value)}
              rows={3}
              className="mb-3 w-full resize-none rounded border border-border bg-secondary px-2 py-1.5 text-sm text-primary-text outline-none focus:border-accent"
            />
            <div className="flex justify-end gap-2">
              <button
                className="rounded px-3 py-1.5 text-xs text-muted hover:text-primary-text transition-colors"
                onClick={() => setShowPromoteModal(false)}
              >
                Cancel
              </button>
              <button
                className="rounded bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent/90 transition-colors"
                onClick={handlePromoteConfirm}
              >
                Promote
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
