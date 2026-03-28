"""Pydantic schemas for per-repo skills."""

from pydantic import BaseModel


class SkillResponse(BaseModel):
    """A single skill entry from a repo."""

    name: str
    description: str
    path: str


class SkillListResponse(BaseModel):
    """List of skills discovered in a repo."""

    skills: list[SkillResponse]
    repo_path: str
