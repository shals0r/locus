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

// Phase 2: Repository & Git types

export interface RepoStatus {
  branch: string;
  is_dirty: boolean;
  changed_count: number;
  ahead: number;
  behind: number;
  last_activity: string | null;
}

export interface RepoDetail {
  machine_id: string;
  repo_path: string;
  name: string;
  status: RepoStatus;
}

export interface CommitEntry {
  sha: string;
  message: string;
  author: string;
  date: string;
}

export interface ChangedFile {
  status: string;
  path: string;
}

export interface BranchInfo {
  name: string;
  is_current: boolean;
}

export interface GitOpResult {
  success: boolean;
  message: string;
}

export interface GsdState {
  has_gsd: boolean;
  current_phase: string | null;
  phase_status: string | null;
  pending_todos: number;
  blockers: number;
  total_phases: number;
  completed_phases: number;
}

// Phase 2: Work Feed types
export type FeedTier = "now" | "respond" | "review" | "prep" | "follow_up";

export interface FeedItem {
  id: string;
  source_type: string;
  external_id: string;
  title: string;
  snippet: string | null;
  url: string | null;
  tier: FeedTier;
  is_read: boolean;
  is_dismissed: boolean;
  source_icon: string | null;
  snoozed_until: string | null;
  raw_payload: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface Task {
  id: string;
  feed_item_id: string | null;
  title: string;
  context: string | null;
  tier: FeedTier;
  status: string;
  machine_id: string | null;
  repo_path: string | null;
  branch: string | null;
  source_links: Record<string, string> | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
}

export interface SearchResult {
  id: string;
  type: string;
  title: string;
  subtitle: string | null;
  icon: string | null;
  action_data: Record<string, unknown> | null;
}
