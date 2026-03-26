export const LOCAL_MACHINE_ID = "local";

export function isLocalMachine(machineId: string): boolean {
  return machineId === LOCAL_MACHINE_ID;
}

export interface User {
  id: string;
  setup_completed: boolean;
}

export interface Machine {
  id: string;
  name: string;
  host: string;
  port: number;
  username: string;
  ssh_key_path: string;
  ssh_key_passphrase?: string;
  repo_scan_paths: string[];
  status: MachineStatus;
}

export interface Credential {
  id: string;
  service_type: string;
  service_name: string;
}

export interface TerminalSession {
  id: string;
  machine_id: string;
  session_type: "shell" | "claude";
  tmux_session_name: string | null;
  repo_path: string | null;
  is_active: boolean;
  display_name?: string | null;
}

export type MachineStatus = "online" | "offline" | "reconnecting" | "needs_setup";
export type ClaudeStatus = "idle" | "running" | "waiting";

export interface ClaudeSession {
  machine_id: string;
  machine_name: string;
  tmux_session: string;
  window_index: number;
  window_name: string;
  repo_path: string | null;
  status: ClaudeStatus;
  last_activity: number;
}

// Feed types
export type FeedTier = "now" | "respond" | "review" | "prep" | "follow_up";

export interface FeedItem {
  id: string;
  source_type: string;
  source_id: string | null;
  title: string;
  snippet: string | null;
  url: string | null;
  tier: FeedTier;
  is_read: boolean;
  is_dismissed: boolean;
  snoozed_until: string | null;
  raw_payload: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}
