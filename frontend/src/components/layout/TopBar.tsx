import { useState, useRef, useEffect } from "react";
import { Settings, LogOut, User, Wifi, Database, Bot } from "lucide-react";
import { useAuthStore } from "../../stores/authStore";

function StatusDot({ status }: { status: "connected" | "disconnected" | "connecting" }) {
  const colors: Record<string, string> = {
    connected: "bg-success",
    disconnected: "bg-error",
    connecting: "bg-warning animate-pulse",
  };
  return <span className={`inline-block h-2 w-2 rounded-full ${colors[status]}`} />;
}

function StatusIndicator({
  icon: Icon,
  label,
  status,
}: {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  label: string;
  status: "connected" | "disconnected" | "connecting";
}) {
  return (
    <div className="flex items-center gap-1.5">
      <Icon size={14} className="text-muted" />
      <StatusDot status={status} />
      <span className="text-xs text-muted">{label}</span>
    </div>
  );
}

export function TopBar() {
  const clearToken = useAuthStore((s) => s.clearToken);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <header className="flex h-12 shrink-0 items-center justify-between bg-secondary px-4">
      {/* Left: Logo */}
      <div className="flex items-center gap-2">
        <span className="text-lg font-semibold text-primary-text">Locus</span>
      </div>

      {/* Center: Status indicators */}
      <div className="flex items-center gap-4">
        <StatusIndicator icon={Wifi} label="SSH" status="disconnected" />
        <StatusIndicator icon={Database} label="DB" status="connected" />
        <StatusIndicator icon={Bot} label="Claude" status="disconnected" />
      </div>

      {/* Right: User menu */}
      <div className="relative" ref={menuRef}>
        <button
          onClick={() => setMenuOpen(!menuOpen)}
          className="flex h-8 w-8 items-center justify-center rounded-full bg-hover text-muted hover:text-primary-text transition-colors"
          aria-label="User menu"
        >
          <User size={16} />
        </button>
        {menuOpen && (
          <div className="absolute right-0 top-10 z-50 w-40 rounded border border-border bg-secondary py-1 shadow-lg">
            <button
              className="flex w-full items-center gap-2 px-3 py-2 text-sm text-primary-text hover:bg-hover"
              onClick={() => setMenuOpen(false)}
            >
              <Settings size={14} />
              Settings
            </button>
            <button
              className="flex w-full items-center gap-2 px-3 py-2 text-sm text-primary-text hover:bg-hover"
              onClick={() => {
                clearToken();
                setMenuOpen(false);
              }}
            >
              <LogOut size={14} />
              Logout
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
