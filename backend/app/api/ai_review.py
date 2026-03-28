"""AI review API: diff review and contextual chat endpoints.

Provides AI-powered code review annotation generation and a contextual
chat interface where users can discuss review findings with Claude.
"""

import logging

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.services.auth import get_current_user

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/review", tags=["ai-review"])


# ---------------------------------------------------------------------------
# Request / response schemas
# ---------------------------------------------------------------------------


class AiReviewRequest(BaseModel):
    """Request body for AI diff review."""
    diff_text: str
    custom_prompt: str | None = None


class AnnotationItem(BaseModel):
    id: str
    file: str
    line: int
    severity: str  # error | warning | suggestion | info
    comment: str


class AiReviewResponse(BaseModel):
    annotations: list[AnnotationItem]


class ChatRequest(BaseModel):
    """Request body for contextual review chat."""
    messages: list[dict]
    context: str


class ChatResponse(BaseModel):
    response: str


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@router.post("/ai-review", response_model=AiReviewResponse)
async def ai_review(
    body: AiReviewRequest,
    _user: dict = Depends(get_current_user),
) -> AiReviewResponse:
    """Trigger AI review on a diff.

    Calls ai_review_service.review_diff() to generate structured annotations.
    Returns 503 if LLM key is not configured.
    """
    try:
        from app.services.ai_review_service import review_diff
        annotations = await review_diff(body.diff_text, body.custom_prompt)
        return AiReviewResponse(annotations=annotations)
    except ImportError:
        raise HTTPException(
            status_code=503,
            detail="AI review service not available. Ensure ai_review_service is configured.",
        )
    except Exception as exc:
        logger.error("AI review failed: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc))


@router.post("/chat", response_model=ChatResponse)
async def review_chat(
    body: ChatRequest,
    _user: dict = Depends(get_current_user),
) -> ChatResponse:
    """Contextual chat about a code review.

    Accepts conversation history and a context string that includes
    diff text, annotations, and existing comments. The frontend builds
    the context string from the current review state.

    Returns the assistant's response message.
    """
    try:
        from app.services.ai_review_service import chat_about_review
        response_text = await chat_about_review(body.messages, body.context)
        return ChatResponse(response=response_text)
    except ImportError:
        raise HTTPException(
            status_code=503,
            detail="AI review service not available. Ensure ai_review_service is configured.",
        )
    except Exception as exc:
        logger.error("Review chat failed: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc))
