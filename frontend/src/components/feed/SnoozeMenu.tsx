import { useRef, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Clock } from "lucide-react";

interface SnoozeMenuProps {
  onSnooze: (until: string) => void;
  onClose: () => void;
  anchorRef: React.RefObject<HTMLButtonElement | null>;
}

function getSnoozePresets(): { label: string; until: string }[] {
  const now = new Date();

  // 1 hour from now
  const oneHour = new Date(now.getTime() + 60 * 60 * 1000);

  // 4 hours from now
  const fourHours = new Date(now.getTime() + 4 * 60 * 60 * 1000);

  // Tomorrow 9am local time
  const tomorrow9am = new Date(now);
  tomorrow9am.setDate(tomorrow9am.getDate() + 1);
  tomorrow9am.setHours(9, 0, 0, 0);

  // Next Monday 9am local time
  const nextMonday9am = new Date(now);
  const dayOfWeek = nextMonday9am.getDay();
  const daysUntilMonday = dayOfWeek === 0 ? 1 : 8 - dayOfWeek;
  nextMonday9am.setDate(nextMonday9am.getDate() + daysUntilMonday);
  nextMonday9am.setHours(9, 0, 0, 0);

  return [
    { label: "1 hour", until: oneHour.toISOString() },
    { label: "4 hours", until: fourHours.toISOString() },
    { label: "Tomorrow 9am", until: tomorrow9am.toISOString() },
    { label: "Next Monday 9am", until: nextMonday9am.toISOString() },
  ];
}

/**
 * Snooze popover with 4 fixed preset options.
 * Rendered via portal to document.body with fixed positioning so it
 * won't be clipped by overflow:auto on the feed panel.
 */
export function SnoozeMenu({ onSnooze, onClose, anchorRef }: SnoozeMenuProps) {
  const ref = useRef<HTMLDivElement>(null);
  const presets = getSnoozePresets();
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  // Compute position from anchor button's bounding rect
  useEffect(() => {
    if (anchorRef.current) {
      const rect = anchorRef.current.getBoundingClientRect();
      setPos({
        top: rect.bottom + 4,
        left: rect.left,
      });
    }
  }, [anchorRef]);

  // Close on click outside (ignore clicks on the anchor button itself)
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (
        ref.current &&
        !ref.current.contains(e.target as Node) &&
        anchorRef.current &&
        !anchorRef.current.contains(e.target as Node)
      ) {
        onClose();
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [onClose, anchorRef]);

  if (!pos) return null;

  return createPortal(
    <div
      ref={ref}
      className="fixed z-50 min-w-[160px] rounded border border-border bg-dominant shadow-lg"
      style={{ top: pos.top, left: pos.left }}
    >
      <div className="flex items-center gap-1.5 border-b border-border px-2.5 py-1.5">
        <Clock size={12} className="text-muted" />
        <span className="text-[10px] font-medium text-muted">Snooze until</span>
      </div>
      {presets.map((preset) => (
        <button
          key={preset.label}
          className="flex w-full items-center px-2.5 py-1.5 text-xs text-primary-text hover:bg-hover transition-colors"
          onClick={(e) => {
            e.stopPropagation();
            onSnooze(preset.until);
          }}
        >
          {preset.label}
        </button>
      ))}
    </div>,
    document.body,
  );
}
