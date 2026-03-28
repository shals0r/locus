import { useState } from "react";
import type { RepoDetail } from "../../types";
import { useRepoStore } from "../../stores/repoStore";
import { BranchDropdown } from "./BranchDropdown";
import { GitOperations } from "./GitOperations";
import { GsdStateDisplay } from "./GsdState";
import { GsdActions } from "./GsdActions";
import { SkillBar } from "../skills/SkillBar";

interface RepoRowProps {
  repo: RepoDetail;
}

export function RepoRow({ repo }: RepoRowProps) {
  const selectedRepoPath = useRepoStore((s) => s.selectedRepoPath);
  const selectedMachineId = useRepoStore((s) => s.selectedMachineId);
  const setSelectedRepo = useRepoStore((s) => s.setSelectedRepo);
  const gsdStates = useRepoStore((s) => s.gsdStates);
  const [gsdExpanded, setGsdExpanded] = useState(false);

  const isSelected =
    selectedRepoPath === repo.repo_path &&
    selectedMachineId === repo.machine_id;
  const gsdKey = `${repo.machine_id}:${repo.repo_path}`;
  const gsdState = gsdStates.get(gsdKey);

  return (
    <div
      className={`rounded transition-colors ${
        isSelected ? "bg-hover" : "hover:bg-hover/50"
      }`}
    >
      {/* Main row */}
      <button
        onClick={() => setSelectedRepo(repo.machine_id, repo.repo_path)}
        className="flex w-full items-center gap-1.5 px-2 py-1 text-left"
      >
        {/* Dirty indicator dot */}
        <span
          className={`h-1.5 w-1.5 shrink-0 rounded-full ${
            repo.status.is_dirty ? "bg-warning" : "bg-success"
          }`}
          title={repo.status.is_dirty ? "Uncommitted changes" : "Clean"}
        />

        {/* Repo name */}
        <span className="flex-1 truncate text-xs text-primary-text">
          {repo.name}
        </span>

        {/* Changed count */}
        {repo.status.changed_count > 0 && (
          <span className="text-[10px] text-warning">
            {repo.status.changed_count}
          </span>
        )}

        {/* Ahead/behind */}
        {repo.status.ahead > 0 && (
          <span className="text-[10px] text-success" title="Commits ahead">
            +{repo.status.ahead}
          </span>
        )}
        {repo.status.behind > 0 && (
          <span className="text-[10px] text-error" title="Commits behind">
            -{repo.status.behind}
          </span>
        )}
      </button>

      {/* Branch + git ops row */}
      <div className="flex items-center justify-between px-2 pb-1">
        <BranchDropdown
          machineId={repo.machine_id}
          repoPath={repo.repo_path}
          currentBranch={repo.status.branch}
        />
        <div className="flex items-center gap-1">
          <GsdStateDisplay
            machineId={repo.machine_id}
            repoPath={repo.repo_path}
            expanded={gsdExpanded}
            onToggle={() => setGsdExpanded(!gsdExpanded)}
          />
          <GitOperations
            machineId={repo.machine_id}
            repoPath={repo.repo_path}
          />
        </div>
      </div>

      {/* GSD Actions expandable area */}
      {gsdExpanded && gsdState && gsdState.has_gsd && (
        <div className="border-t border-border/50 px-1">
          <GsdActions
            gsdState={gsdState}
            machineId={repo.machine_id}
            repoPath={repo.repo_path}
          />
        </div>
      )}

      {/* Skill chips (only when repo is selected, auto-hides when empty) */}
      {isSelected && (
        <SkillBar machineId={repo.machine_id} repoPath={repo.repo_path} />
      )}
    </div>
  );
}
