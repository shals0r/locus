"""Pydantic schemas for code review operations."""

from pydantic import BaseModel


class MrMetadata(BaseModel):
    """Merge/Pull request metadata."""

    mr_id: str
    title: str
    description: str | None = None
    author: str
    status: str  # open, merged, closed
    source_branch: str
    target_branch: str
    reviewers: list[str] = []
    pipeline_status: str | None = None
    url: str | None = None
    provider: str  # "github" or "gitlab"


class CommentNote(BaseModel):
    """A single comment/note within a thread."""

    id: str
    author: str
    body: str
    created_at: str
    updated_at: str | None = None


class CommentThread(BaseModel):
    """A discussion thread on a merge/pull request."""

    id: str
    file_path: str | None = None
    line: int | None = None
    side: str = "RIGHT"  # LEFT or RIGHT
    resolved: bool = False
    comments: list[CommentNote] = []


class ReviewComment(BaseModel):
    """A review comment to be posted."""

    file_path: str
    line: int
    body: str
    side: str = "RIGHT"


class ReviewSubmission(BaseModel):
    """Submit a full review with comments and event."""

    task_id: str
    comments: list[ReviewComment] = []
    event: str = "COMMENT"  # COMMENT, APPROVE, REQUEST_CHANGES
    body: str = ""


class ReplyRequest(BaseModel):
    """Reply to an existing comment thread."""

    task_id: str
    thread_id: str
    body: str
