import type { ChatMessage } from "../../stores/integratorStore";
import { IntegratorCard } from "./IntegratorCard";

interface IntegratorMessageProps {
  message: ChatMessage;
}

/**
 * Single chat bubble in the Integrator panel.
 * User messages: right-aligned, accent bg.
 * Assistant messages: left-aligned, secondary bg.
 * Code blocks rendered in JetBrains Mono.
 */
export function IntegratorMessage({ message }: IntegratorMessageProps) {
  const isUser = message.role === "user";

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div className="max-w-[85%]">
        <div
          className={`rounded-lg p-3 text-sm ${
            isUser
              ? "bg-accent text-white"
              : "bg-secondary text-primary-text"
          }`}
        >
          <MessageContent content={message.content} />
        </div>

        {/* Structured cards after the message */}
        {message.structured_cards?.map((card, i) => (
          <IntegratorCard key={`${message.id}-card-${i}`} card={card} />
        ))}
      </div>
    </div>
  );
}

/**
 * Renders message content with markdown code blocks.
 */
function MessageContent({ content }: { content: string }) {
  const parts = content.split(/(```[\s\S]*?```)/g);

  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith("```") && part.endsWith("```")) {
          const lines = part.split("\n");
          const code = lines.slice(1, -1).join("\n");
          return (
            <pre
              key={i}
              className="my-1 overflow-x-auto rounded bg-dominant p-2 text-xs"
              style={{ fontFamily: "JetBrains Mono, monospace" }}
            >
              {code}
            </pre>
          );
        }
        // Regular text with inline code
        const inlineParts = part.split(/(`[^`]+`)/g);
        return (
          <span key={i}>
            {inlineParts.map((ip, j) => {
              if (ip.startsWith("`") && ip.endsWith("`")) {
                return (
                  <code
                    key={j}
                    className="rounded bg-dominant/50 px-1 py-0.5 text-xs"
                    style={{ fontFamily: "JetBrains Mono, monospace" }}
                  >
                    {ip.slice(1, -1)}
                  </code>
                );
              }
              return <span key={j}>{ip}</span>;
            })}
          </span>
        );
      })}
    </>
  );
}
