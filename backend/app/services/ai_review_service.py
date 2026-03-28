"""AI review service: diff review and contextual chat via LLM.

Provides review_diff() for generating structured annotations from diffs,
and chat_about_review() for contextual conversation about review findings.
"""

import logging
import os
import uuid

logger = logging.getLogger(__name__)


async def review_diff(
    diff_text: str,
    custom_prompt: str | None = None,
) -> list[dict]:
    """Review a diff using Claude and return structured annotations.

    Returns a list of annotation dicts with: id, file, line, severity, comment.
    Raises if LLM key is not configured.
    """
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        raise RuntimeError("ANTHROPIC_API_KEY not set. Configure it to enable AI review.")

    # Build the review prompt
    system_prompt = (
        "You are a senior code reviewer. Analyze the following diff and return "
        "structured annotations. For each finding, provide:\n"
        "- file: the file path\n"
        "- line: the line number in the new file\n"
        "- severity: one of error, warning, suggestion, info\n"
        "- comment: a clear, actionable review comment\n\n"
        "Return ONLY a JSON array of annotation objects."
    )
    if custom_prompt:
        system_prompt += f"\n\nAdditional instructions: {custom_prompt}"

    try:
        import httpx

        async with httpx.AsyncClient(timeout=120.0) as client:
            resp = await client.post(
                "https://api.anthropic.com/v1/messages",
                headers={
                    "x-api-key": api_key,
                    "anthropic-version": "2023-06-01",
                    "content-type": "application/json",
                },
                json={
                    "model": "claude-sonnet-4-20250514",
                    "max_tokens": 4096,
                    "system": system_prompt,
                    "messages": [{"role": "user", "content": diff_text}],
                },
            )
            resp.raise_for_status()
            data = resp.json()

            # Parse the response text as JSON annotations
            import json
            content_text = data["content"][0]["text"]
            # Strip markdown code fences if present
            if content_text.strip().startswith("```"):
                lines = content_text.strip().split("\n")
                lines = [l for l in lines if not l.strip().startswith("```")]
                content_text = "\n".join(lines)

            raw_annotations = json.loads(content_text)
            annotations = []
            for ann in raw_annotations:
                annotations.append({
                    "id": str(uuid.uuid4()),
                    "file": ann.get("file", "unknown"),
                    "line": ann.get("line", 1),
                    "severity": ann.get("severity", "info"),
                    "comment": ann.get("comment", ""),
                })
            return annotations
    except Exception as exc:
        logger.error("AI review LLM call failed: %s", exc)
        raise


async def chat_about_review(
    messages: list[dict],
    context: str,
) -> str:
    """Chat about a code review with full context.

    Args:
        messages: Conversation history as list of {role, content} dicts.
        context: Context string containing diff text, annotations, and comments.

    Returns:
        The assistant's response text.
    """
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        raise RuntimeError("ANTHROPIC_API_KEY not set. Configure it to enable review chat.")

    system_prompt = (
        "You are a helpful code review assistant. You have full context of "
        "the code review including the diff, annotations, and existing comments. "
        "Answer questions about the code, explain findings, suggest improvements, "
        "and help draft responses to review comments.\n\n"
        f"Review Context:\n{context}"
    )

    # Build messages for the API
    api_messages = []
    for msg in messages:
        api_messages.append({
            "role": msg.get("role", "user"),
            "content": msg.get("content", ""),
        })

    try:
        import httpx

        async with httpx.AsyncClient(timeout=60.0) as client:
            resp = await client.post(
                "https://api.anthropic.com/v1/messages",
                headers={
                    "x-api-key": api_key,
                    "anthropic-version": "2023-06-01",
                    "content-type": "application/json",
                },
                json={
                    "model": "claude-sonnet-4-20250514",
                    "max_tokens": 2048,
                    "system": system_prompt,
                    "messages": api_messages,
                },
            )
            resp.raise_for_status()
            data = resp.json()
            return data["content"][0]["text"]
    except Exception as exc:
        logger.error("Review chat LLM call failed: %s", exc)
        raise
