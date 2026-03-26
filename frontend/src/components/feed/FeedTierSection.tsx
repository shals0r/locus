import { ChevronDown, ChevronRight } from "lucide-react";
import type { FeedItem, FeedTier } from "../../types";
import { FeedCard } from "./FeedCard";

const TIER_LABELS: Record<FeedTier, string> = {
  now: "Now",
  respond: "Respond",
  review: "Review",
  prep: "Prep",
  follow_up: "Follow up",
};

const TIER_HEADER_COLORS: Record<FeedTier, string> = {
  now: "text-red-400",
  respond: "text-orange-400",
  review: "text-blue-400",
  prep: "text-yellow-400",
  follow_up: "text-gray-400",
};

const TIER_BADGE_COLORS: Record<FeedTier, string> = {
  now: "bg-red-500/20 text-red-400",
  respond: "bg-orange-500/20 text-orange-400",
  review: "bg-blue-500/20 text-blue-400",
  prep: "bg-yellow-500/20 text-yellow-400",
  follow_up: "bg-gray-500/20 text-gray-400",
};

interface FeedTierSectionProps {
  tier: FeedTier;
  items: FeedItem[];
  isCollapsed: boolean;
  onToggle: () => void;
}

/**
 * Collapsible tier section with sticky header and tier color accent.
 */
export function FeedTierSection({
  tier,
  items,
  isCollapsed,
  onToggle,
}: FeedTierSectionProps) {
  const label = TIER_LABELS[tier];
  const headerColor = TIER_HEADER_COLORS[tier];
  const badgeColor = TIER_BADGE_COLORS[tier];

  return (
    <div>
      {/* Sticky header */}
      <button
        className="sticky top-0 z-10 flex w-full items-center gap-2 bg-secondary/95 backdrop-blur-sm px-2 py-1.5 border-b border-border transition-colors hover:bg-hover"
        onClick={onToggle}
      >
        {isCollapsed ? (
          <ChevronRight size={14} className="text-muted" />
        ) : (
          <ChevronDown size={14} className="text-muted" />
        )}
        <span className={`text-xs font-semibold ${headerColor}`}>
          {label}
        </span>
        {items.length > 0 && (
          <span
            className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium leading-none ${badgeColor}`}
          >
            {items.length}
          </span>
        )}
      </button>

      {/* Collapsible items list with smooth animation */}
      <div
        className={`overflow-hidden transition-[max-height] duration-200 ease-in-out ${
          isCollapsed ? "max-h-0" : "max-h-[2000px]"
        }`}
      >
        {items.length === 0 ? (
          <p className="px-3 py-2 text-[10px] text-muted">No items</p>
        ) : (
          <div className="divide-y divide-border/50">
            {items.map((item) => (
              <FeedCard key={item.id} item={item} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
