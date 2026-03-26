"""Pydantic schemas for command palette search."""

from pydantic import BaseModel


class SearchResult(BaseModel):
    """A single result in the command palette."""

    id: str
    type: str  # "repo" | "machine" | "feed_item" | "task" | "action"
    title: str
    subtitle: str | None = None
    icon: str | None = None
    action_data: dict | None = None


class SearchResponse(BaseModel):
    """Response from the command palette search endpoint."""

    results: list[SearchResult]
