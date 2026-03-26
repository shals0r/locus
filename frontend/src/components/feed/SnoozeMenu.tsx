import { useRef, useEffect } from "react";
import { Clock } from "lucide-react";

interface SnoozeMenuProps {
  onSnooze: (until: string) => void;
  onClose: () => void;
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
 */
export function SnoozeMenu({ onSnooze, onClose }: SnoozeMenuProps) {
  const ref = useRef<HTMLDivElement>(null);
  const presets = getSnoozePresets();

  // Close on click outside
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [onClose]);

  return (
    <div
      ref={ref}
      className="absolute right-0 top-full z-50 mt-1 min-w-[160px] rounded border border-border bg-dominant shadow-lg"
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
    </div>
  );
}
