"""AI review service for code review using the Anthropic API.

Sends diffs to Claude for structured annotation responses, and supports
contextual chat about review findings. Follows the same httpx + Anthropic
API pattern used in feed_service.py.
"""

from __future__ import annotations

import json
import logging
import uuid
from typing import Any

import httpx

from app.config import settings

logger = logging.getLogger(__name__)

_REVIEW_SYSTEM_PROMPT = (
    "You are a senior code reviewer. Analyze the following git diff and provide "
    "specific, actionable review comments. For each issue found, respond with a "
    "JSON array of objects with these fields: file (the file path), line (the line "
    "number in the new file), severity (one of: error, warning, suggestion, info), "
    "comment (your review comment). Focus on bugs, security issues, performance "
    "problems, and code quality. Respond ONLY with the JSON array, no other text."
)

_CHAT_SYSTEM_PROMPT = (
    "You are a code review assistant. You have context of a code review including "
    "the diff, existing annotations, and comments. Help the user understand the "
    "code, draft responses to comments, and discuss review findings."
)


async def review_diff(
    diff_text: str, custom_prompt: str | None = None
) -> list[dict[str, Any]]:
    """Send a diff to Claude and get structured review annotations back.

    Args:
        diff_text: The unified diff text to review.
        custom_prompt: Optional additional reviewer instructions appended
                       to the system prompt.

    Returns:
        List of annotation dicts with keys: id, file, line, severity, comment.
        Returns empty list if parsing fails (logged as warning).

    Raises:
        ValueError: If LLM API key is not configured.
    """
    if not settings.llm_api_key:
        raise ValueError("LLM API key not configured")

    system_prompt = _REVIEW_SYSTEM_PROMPT
    if custom_prompt:
        system_prompt += f"\n\nAdditional reviewer instructions: {custom_prompt}"

    async with httpx.AsyncClient(timeout=120.0) as client:
        response = await client.post(
            settings.llm_api_url,
            headers={
                "x-api-key": settings.llm_api_key,
                "anthropic-version": "2023-06-01",
                "content-type": "application/json",
            },
            json={
                "model": settings.llm_model,
                "max_tokens": 4096,
                "system": system_prompt,
                "messages": [{"role": "user", "content": diff_text}],
            },
        )
        response.raise_for_status()
        data = response.json()

    # Extract text from Anthropic API response format
    raw_text = data["content"][0]["text"].strip()

    try:
        annotations = json.loads(raw_text)
    except json.JSONDecodeError as exc:
        logger.warning(
            "Failed to parse AI review response as JSON: %s. Raw: %.200s",
            exc,
            raw_text,
        )
        return []

    if not isinstance(annotations, list):
        logger.warning(
            "AI review response is not a list: %s", type(annotations).__name__
        )
        return []

    # Add UUID id to each annotation if not present
    for annotation in annotations:
        if "id" not in annotation:
            annotation["id"] = str(uuid.uuid4())

    return annotations


async def chat_about_review(
    messages: list[dict[str, Any]], context: str
) -> str:
    """Contextual chat about a code review.

    Takes conversation messages and review context (diff + annotations +
    comments) to enable discussion about review findings.

    Args:
        messages: List of conversation messages [{"role": "user"|"assistant", "content": str}]
        context: Review context string (diff text, annotations, existing comments).

    Returns:
        The assistant's text response.

    Raises:
        ValueError: If LLM API key is not configured.
    """
    if not settings.llm_api_key:
        raise ValueError("LLM API key not configured")

    system_prompt = f"{_CHAT_SYSTEM_PROMPT}\n\n--- Review Context ---\n{context}"

    async with httpx.AsyncClient(timeout=120.0) as client:
        response = await client.post(
            settings.llm_api_url,
            headers={
                "x-api-key": settings.llm_api_key,
                "anthropic-version": "2023-06-01",
                "content-type": "application/json",
            },
            json={
                "model": settings.llm_model,
                "max_tokens": 4096,
                "system": system_prompt,
                "messages": messages,
            },
        )
        response.raise_for_status()
        data = response.json()

    return data["content"][0]["text"].strip()
