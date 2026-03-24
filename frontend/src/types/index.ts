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
}

export type MachineStatus = "online" | "offline" | "reconnecting";
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
