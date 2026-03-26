import { create } from "zustand";

type ActiveTab = "feed" | "board";

interface FeedState {
  activeTab: ActiveTab;
  tierCollapsed: Record<string, boolean>;
  setActiveTab: (tab: ActiveTab) => void;
  toggleTierCollapsed: (tier: string) => void;
}

export const useFeedStore = create<FeedState>((set) => ({
  activeTab: "feed",
  tierCollapsed: {
    now: false,
    respond: false,
    review: false,
    prep: true,
    follow_up: true,
  },
  setActiveTab: (tab) => set({ activeTab: tab }),
  toggleTierCollapsed: (tier) =>
    set((s) => ({
      tierCollapsed: {
        ...s.tierCollapsed,
        [tier]: !s.tierCollapsed[tier],
      },
    })),
}));
