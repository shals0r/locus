"""Pydantic schemas for code review operations."""

from typing import Literal
from uuid import uuid4

from pydantic import BaseModel, Field


class ReviewAnnotation(BaseModel):
    """An AI-generated review annotation on a specific file and line."""

    file: str
    line: int
    severity: Literal["error", "warning", "suggestion", "info"]
    comment: str
    id: str = Field(default_factory=lambda: str(uuid4()))


class ReviewComment(BaseModel):
    """A review comment for posting to a merge/pull request."""

    file: str
    line: int
    body: str
    side: Literal["LEFT", "RIGHT"] = "RIGHT"


class CommentReply(BaseModel):
    """A reply within a comment thread."""

    id: str
    author: str
    body: str
    created_at: str


class CommentThread(BaseModel):
    """A threaded discussion on a specific file and line."""

    id: str
    file: str
    line: int
    author: str
    body: str
    replies: list[CommentReply]
    created_at: str


class ReviewSubmission(BaseModel):
    """A review submission to a merge/pull request."""

    mr_id: str
    source_type: str
    comments: list[ReviewComment]
    event: Literal["APPROVE", "REQUEST_CHANGES", "COMMENT"]
    body: str = ""


class MrMetadata(BaseModel):
    """Metadata for a merge/pull request."""

    id: str
    title: str
    description: str
    author: str
    status: str
    source_branch: str
    target_branch: str
    reviewers: list[str]
    pipeline_status: str | None
    url: str
    source_type: str
    project_id: str
    diff_refs: dict | None = None


class AiReviewRequest(BaseModel):
    """Request for AI-assisted code review."""

    diff_text: str
    custom_prompt: str | None = None


class AiReviewResponse(BaseModel):
    """Response from AI-assisted code review."""

    annotations: list[ReviewAnnotation]
