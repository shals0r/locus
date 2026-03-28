"""AI review API endpoint.

Exposes the AI review service for triggering code reviews from the frontend.
Returns structured annotations that the frontend renders as gutter icons and
inline previews in the diff viewer.
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.services import ai_review_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/review", tags=["ai-review"])


# ---------------------------------------------------------------------------
# Request / Response schemas
# ---------------------------------------------------------------------------

class AiReviewRequest(BaseModel):
    """Request body for triggering an AI code review."""
    diff_text: str = Field(..., description="The unified diff text to review")
    custom_prompt: str | None = Field(
        default=None,
        description="Optional custom instructions to focus the review",
    )


class AnnotationItem(BaseModel):
    """A single review annotation returned by the AI."""
    id: str
    file: str
    line: int
    severity: str = Field(description="One of: error, warning, suggestion, info")
    comment: str


class AiReviewResponse(BaseModel):
    """Response from the AI review endpoint."""
    annotations: list[AnnotationItem]


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.post("/ai-review", response_model=AiReviewResponse)
async def ai_review(request: AiReviewRequest) -> AiReviewResponse:
    """Trigger an AI code review on the provided diff text.

    Sends the diff to Claude for analysis and returns structured annotations
    with file, line, severity, and comment for each finding.

    Returns 503 if the LLM API key is not configured.
    Timeout: 120s for large diffs.
    """
    try:
        annotations = await ai_review_service.review_diff(
            diff_text=request.diff_text,
            custom_prompt=request.custom_prompt,
        )
    except ValueError as exc:
        # LLM key not configured
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except Exception as exc:
        logger.error("AI review failed: %s", exc)
        raise HTTPException(
            status_code=500,
            detail=f"AI review failed: {exc}",
        ) from exc

    return AiReviewResponse(
        annotations=[
            AnnotationItem(
                id=a.get("id", ""),
                file=a.get("file", ""),
                line=a.get("line", 0),
                severity=a.get("severity", "info"),
                comment=a.get("comment", ""),
            )
            for a in annotations
        ]
    )
