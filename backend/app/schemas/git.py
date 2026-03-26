"""Pydantic schemas for git operations and repository state."""

from pydantic import BaseModel


class RepoStatus(BaseModel):
    """Current status of a git repository."""

    branch: str
    is_dirty: bool
    changed_count: int
    ahead: int
    behind: int
    last_activity: str | None = None


class CommitEntry(BaseModel):
    """A single git commit."""

    sha: str
    message: str
    author: str
    date: str


class ChangedFile(BaseModel):
    """A file changed in a git repo (staged or unstaged)."""

    status: str
    path: str


class BranchInfo(BaseModel):
    """A git branch."""

    name: str
    is_current: bool


class GitOpResult(BaseModel):
    """Result of a git operation (fetch, pull, push, checkout, etc.)."""

    success: bool
    message: str


class RepoDetail(BaseModel):
    """Full detail of a repository on a machine."""

    machine_id: str
    repo_path: str
    name: str
    status: RepoStatus


class GsdState(BaseModel):
    """GSD framework state for a repo (GIT-05)."""

    has_gsd: bool
    current_phase: str | None = None
    phase_status: str | None = None
    pending_todos: int = 0
    blockers: int = 0
    total_phases: int = 0
    completed_phases: int = 0
