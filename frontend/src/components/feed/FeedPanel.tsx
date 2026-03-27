import { useMemo } from "react";
import { Inbox } from "lucide-react";
import { useFeedStore } from "../../stores/feedStore";
import { useFeedItems } from "../../hooks/useFeedQueries";
import { useFeedWebSocket } from "../../hooks/useFeedWebSocket";
import { FeedTierSection } from "./FeedTierSection";
import type { FeedItem, FeedTier } from "../../types";

const TIER_ORDER: FeedTier[] = ["now", "respond", "review", "prep", "follow_up"];

/**
 * Feed panel displaying items grouped into 5 urgency tiers.
 * Activates WebSocket for real-time updates.
 */
export function FeedPanel() {
  const tierCollapsed = useFeedStore((s) => s.tierCollapsed);
  const toggleTierCollapsed = useFeedStore((s) => s.toggleTierCollapsed);

  // Activate WebSocket for real-time feed updates
  useFeedWebSocket();

  // Fetch all feed items
  const { data: items, isLoading, error } = useFeedItems();

  // Group items by tier, separating snoozed items into their own group
  const { groupedItems, snoozedItems } = useMemo(() => {
    const groups: Record<FeedTier, FeedItem[]> = {
      now: [],
      respond: [],
      review: [],
      prep: [],
      follow_up: [],
    };
    const snoozed: FeedItem[] = [];

    if (!items) return { groupedItems: groups, snoozedItems: snoozed };

    const now = Date.now();

    for (const item of items) {
      if (!item.is_dismissed) {
        // Check if item is currently snoozed
        if (item.snoozed_until && new Date(item.snoozed_until).getTime() > now) {
          snoozed.push(item);
        } else {
          const tier = item.tier as FeedTier;
          if (groups[tier]) {
            groups[tier].push(item);
          }
        }
      }
    }

    // Sort snoozed items by snoozed_until ascending (earliest unsnooze first)
    snoozed.sort(
      (a, b) =>
        new Date(a.snoozed_until!).getTime() - new Date(b.snoozed_until!).getTime(),
    );

    return { groupedItems: groups, snoozedItems: snoozed };
  }, [items]);

  const totalItems =
    (items?.filter((i) => !i.is_dismissed).length ?? 0);

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-xs text-muted">Loading feed...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full items-center justify-center px-4">
        <p className="text-xs text-destructive">
          Failed to load feed. Check connection.
        </p>
      </div>
    );
  }

  if (totalItems === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 px-4">
        <Inbox size={32} className="text-muted" />
        <p className="text-sm text-muted">All clear</p>
        <p className="text-center text-xs text-muted">
          Nothing needs attention right now. Configure integration sources to start receiving work items.
        </p>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      {TIER_ORDER.map((tier) => (
        <FeedTierSection
          key={tier}
          tier={tier}
          items={groupedItems[tier]}
          isCollapsed={tierCollapsed[tier] ?? false}
          onToggle={() => toggleTierCollapsed(tier)}
        />
      ))}
      {/* Snoozed section — 6th tier, collapsed by default */}
      <FeedTierSection
        key="snoozed"
        tier="snoozed"
        items={snoozedItems}
        isCollapsed={tierCollapsed.snoozed ?? true}
        onToggle={() => toggleTierCollapsed("snoozed")}
        isSnoozedSection
      />
    </div>
  );
}
