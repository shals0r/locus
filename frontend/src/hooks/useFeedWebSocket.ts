import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getWsUrl } from "../api/client";
import { useWebSocket } from "./useWebSocket";
import type { WsStatus } from "./useWebSocket";

/**
 * WebSocket hook for real-time feed updates.
 *
 * Connects to /ws/feed and invalidates TanStack Query feed cache
 * when new/updated/dismissed items arrive from the server.
 */
export function useFeedWebSocket(): { status: WsStatus } {
  const queryClient = useQueryClient();

  const onMessage = useCallback(
    (event: MessageEvent) => {
      try {
        const msg = JSON.parse(event.data as string) as { type: string };
        if (
          msg.type === "new_item" ||
          msg.type === "item_updated" ||
          msg.type === "item_dismissed"
        ) {
          void queryClient.invalidateQueries({ queryKey: ["feed"] });
        }
      } catch {
        // Ignore malformed messages
      }
    },
    [queryClient],
  );

  const url = getWsUrl("/ws/feed");
  const { status } = useWebSocket(url, { onMessage });

  return { status };
}
