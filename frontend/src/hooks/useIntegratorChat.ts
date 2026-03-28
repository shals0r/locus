import { useCallback, useRef } from "react";
import { useIntegratorStore } from "../stores/integratorStore";

/**
 * Wrapper hook for Integrator chat with auto-scroll and error handling.
 */
export function useIntegratorChat() {
  const sendMessage = useIntegratorStore((s) => s.sendMessage);
  const loading = useIntegratorStore((s) => s.loading);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const send = useCallback(
    async (content: string) => {
      await sendMessage(content);
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    },
    [sendMessage],
  );

  return { send, loading, messagesEndRef };
}
