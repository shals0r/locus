import { useEffect } from "react";
import { Terminal } from "lucide-react";
import { useSkillStore } from "../../stores/skillStore";
import { useSessionStore } from "../../stores/sessionStore";
import { apiPost } from "../../hooks/useApi";
import type { TerminalSession } from "../../types";

interface Skill {
  name: string;
  description: string;
  path: string;
}

interface SkillBarProps {
  machineId: string;
  repoPath: string;
}

function SkillChip({
  skill,
  active,
  onClick,
}: {
  skill: Skill;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={`${skill.name}: ${skill.description}`}
      className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs transition-colors ${
        active
          ? "border-accent bg-accent/10 text-accent"
          : "border-border bg-secondary text-primary-text hover:border-muted hover:bg-hover"
      }`}
    >
      {active && <Terminal size={12} />}
      {skill.name}
    </button>
  );
}

export function SkillBar({ machineId, repoPath }: SkillBarProps) {
  const { skillsByRepo, loadingRepos, fetchSkills, activeSkills } =
    useSkillStore();
  const { addSession } = useSessionStore();
  const setActiveSkill = useSkillStore((s) => s.setActiveSkill);

  const cacheKey = `${machineId}:${repoPath}`;
  const skills = skillsByRepo[cacheKey];
  const loading = loadingRepos.has(cacheKey);

  // Fetch on mount if not cached
  useEffect(() => {
    if (skills === undefined && !loading) {
      fetchSkills(machineId, repoPath);
    }
  }, [machineId, repoPath, skills, loading, fetchSkills]);

  // Don't render if no skills found (D-24)
  if (skills !== undefined && skills.length === 0) return null;

  // Loading state: single skeleton chip
  if (loading || skills === undefined) {
    return (
      <div className="mt-2 px-2 pb-1">
        <div className="mb-1 text-xs text-muted">Skills</div>
        <div className="h-6 w-16 animate-pulse rounded-md bg-secondary" />
      </div>
    );
  }

  async function handleSkillClick(skill: Skill) {
    try {
      // Create a Claude Code session pre-loaded with the skill command
      const session = await apiPost<TerminalSession>("/api/sessions", {
        machine_id: machineId,
        session_type: "claude",
        repo_path: repoPath,
      });
      addSession(session);
      setActiveSkill(skill.name, session.id);
    } catch (err) {
      console.error("Failed to create skill session:", err);
    }
  }

  return (
    <div className="mt-2 px-2 pb-1">
      <div className="mb-1 text-xs text-muted">Skills</div>
      <div className="flex flex-wrap gap-2">
        {skills.map((skill) => (
          <SkillChip
            key={skill.name}
            skill={skill}
            active={!!activeSkills[skill.name]}
            onClick={() => handleSkillClick(skill)}
          />
        ))}
      </div>
    </div>
  );
}
