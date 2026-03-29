"""Integrator service: routes chat messages through Claude Code CLI over SSH.

Manages multi-turn conversations for building integration workers. Uses
Claude Code CLI in print mode (-p) with JSON output and session resumption
(--resume) for conversation continuity.

Credentials are NEVER sent to Claude -- they are stored in the Locus DB
and injected as environment variables when workers are deployed.
"""

import asyncio
import json
import logging
import re
import shlex
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)


INTEGRATOR_SYSTEM_PROMPT = """You are the Locus Integrator, a specialized assistant that helps users build integration workers for Locus.

Your job:
1. Understand what external service the user wants to connect
2. Ask for any configuration details (API endpoints, project IDs, etc.)
3. Write a standalone Python worker script following the Locus worker contract
4. Test the worker by running its poll() function once
5. Help deploy the worker to the Locus runner

Worker contract:
- Standalone Python script with #!/usr/bin/env python3
- Reads config from environment variables: LOCUS_INGEST_URL, LOCUS_WORKER_SECRET, POLL_INTERVAL, plus service-specific vars
- Defines a poll() -> list[dict] function returning items with: source_type, external_id, title, snippet, url, tier_hint, source_icon, metadata
- Main loop calls poll() on POLL_INTERVAL, POSTs results to LOCUS_INGEST_URL with X-Locus-Worker-Secret header
- Uses httpx for HTTP requests
- Prints structured logs to stdout: {ISO_TIMESTAMP} {LEVEL} {message}
- All print statements use flush=True

IMPORTANT:
- NEVER ask for or handle credentials directly. Tell the user credentials are managed by Locus.
- Write worker scripts to /data/workers/user/{worker_id}/worker.py
- If the worker needs extra pip packages, write a requirements.txt alongside it
- When testing, run: python -c "import sys; sys.path.insert(0, '.'); from worker import poll; items = poll(); print(f'Got {len(items)} items'); [print(f'  - {i.get(\\"title\\",\\"?\\")[:60]}') for i in items[:5]]"
"""


@dataclass
class IntegratorConversation:
    """In-memory record of an active Integrator conversation."""

    session_id: str  # Claude Code CLI session ID
    machine_id: str
    worker_id: str | None = None
    created_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))


class IntegratorService:
    """Routes chat messages to Claude Code CLI and parses structured responses."""

    def __init__(self) -> None:
        self._conversations: dict[str, IntegratorConversation] = {}

    async def send_message(
        self,
        conn: Any,  # asyncssh connection
        message: str,
        session_id: str | None = None,
        cwd: str = "~",
    ) -> dict:
        """Send a message to Claude Code CLI and get a structured response.

        Uses -p (print mode) with --output-format json for structured output.
        Uses --resume to maintain conversation context across messages.

        Args:
            conn: AsyncSSH connection to the target machine.
            message: User's chat message text.
            session_id: Existing session ID for conversation continuation.
            cwd: Working directory on the remote machine.

        Returns:
            Dict matching IntegratorResponse schema.
        """
        # Build the claude CLI command
        escaped_prompt = shlex.quote(INTEGRATOR_SYSTEM_PROMPT)
        cmd_parts = [
            "claude", "-p",
            "--output-format", "json",
            "--append-system-prompt", escaped_prompt,
            "--allowedTools", "'Read,Edit,Bash,Write'",
        ]

        if session_id:
            cmd_parts.extend(["--resume", shlex.quote(session_id)])

        cmd = " ".join(cmd_parts)

        # Pipe the user message via stdin
        escaped_message = message.replace("'", "'\\''")
        full_cmd = f"cd {shlex.quote(cwd)} && echo '{escaped_message}' | {cmd}"

        logger.info(
            "Integrator sending message (session=%s, cwd=%s)",
            session_id or "new",
            cwd,
        )

        try:
            result = await asyncio.wait_for(
                conn.run(full_cmd, check=False),
                timeout=120,
            )
        except asyncio.TimeoutError:
            logger.error("Claude Code CLI timed out after 120s")
            return {
                "content": "The request timed out. Claude Code may be busy -- please try again.",
                "session_id": session_id or "",
                "structured_cards": [],
                "worker_ready": False,
            }

        stdout = result.stdout or ""
        stderr = result.stderr or ""

        if result.returncode != 0 and not stdout.strip():
            logger.error("Claude Code CLI error (rc=%d): %s", result.returncode, stderr)
            return {
                "content": f"Claude Code returned an error: {stderr.strip() or 'Unknown error'}",
                "session_id": session_id or "",
                "structured_cards": [],
                "worker_ready": False,
            }

        # Parse JSON response from stdout
        response_text = ""
        new_session_id = session_id or ""
        try:
            data = json.loads(stdout.strip())
            response_text = data.get("result", data.get("text", stdout.strip()))
            new_session_id = data.get("session_id", session_id or str(uuid.uuid4()))
        except json.JSONDecodeError:
            # Fallback: treat stdout as plain text response
            response_text = stdout.strip()
            if not new_session_id:
                new_session_id = str(uuid.uuid4())

        # Extract structured cards from the response text
        structured_cards = self._extract_structured_cards(response_text)

        # Determine if worker is ready to deploy
        worker_ready = any(c.get("type") == "deploy_ready" for c in structured_cards)

        # Track conversation
        self._conversations[new_session_id] = IntegratorConversation(
            session_id=new_session_id,
            machine_id="unknown",  # Caller can update
        )

        return {
            "content": response_text,
            "session_id": new_session_id,
            "structured_cards": structured_cards,
            "worker_ready": worker_ready,
        }

    def _extract_structured_cards(self, text: str) -> list[dict]:
        """Parse response text for structured card indicators.

        Heuristic matching on common Claude Code response patterns:
        - Credential references -> credential_prompt card
        - Test/dry-run results -> test_result card
        - Worker ready/deploy -> deploy_ready card
        """
        cards: list[dict] = []

        lower = text.lower()

        # Credential prompt detection
        cred_patterns = [
            r"need(?:s|ed)?\s+(?:a\s+)?credentials?",
            r"requires?\s+(?:an?\s+)?(?:api[_ ]?key|token|secret)",
            r"store\s+(?:your\s+)?credentials?\s+in\s+locus",
            r"add\s+(?:your\s+)?credentials?\s+(?:in|through|via)\s+(?:the\s+)?(?:locus|settings)",
        ]
        for pattern in cred_patterns:
            match = re.search(pattern, lower)
            if match:
                # Try to infer the service name
                service = "unknown"
                service_match = re.search(
                    r"(gitlab|github|jira|google|slack|calendar|bitbucket)\b",
                    lower,
                )
                if service_match:
                    service = service_match.group(1)
                cards.append({
                    "type": "credential_prompt",
                    "service": service,
                })
                break

        # Test result detection
        test_patterns = [
            r"got\s+(\d+)\s+items?",
            r"returned?\s+(\d+)\s+items?",
            r"poll\(\)\s+returned?\s+(\d+)",
            r"successfully\s+(?:fetched|retrieved|polled)\s+(\d+)",
        ]
        for pattern in test_patterns:
            match = re.search(pattern, lower)
            if match:
                count = int(match.group(1))
                cards.append({
                    "type": "test_result",
                    "success": count > 0,
                    "item_count": count,
                    "items": [],  # Preview items extracted separately if present
                })
                break

        # Test failure detection
        if any(p in lower for p in ["test failed", "error:", "traceback", "exception"]):
            if not any(c.get("type") == "test_result" for c in cards):
                cards.append({
                    "type": "test_result",
                    "success": False,
                    "item_count": 0,
                    "error": "See Claude's response for details.",
                })

        # Deploy ready detection
        deploy_patterns = [
            r"ready\s+to\s+deploy",
            r"worker\s+is\s+(?:ready|complete)",
            r"deploy\s+(?:the\s+)?worker",
            r"click\s+deploy",
        ]
        for pattern in deploy_patterns:
            match = re.search(pattern, lower)
            if match:
                # Try to extract script path
                path_match = re.search(
                    r"/data/workers/[^\s\"']+\.py",
                    text,
                )
                script_path = path_match.group(0) if path_match else ""
                cards.append({
                    "type": "deploy_ready",
                    "script_path": script_path,
                })
                break

        return cards

    async def deploy_worker(
        self,
        db: AsyncSession,
        worker_id: str,
        script_path: str,
        name: str,
        source_type: str,
        supervisor: Any,
    ) -> dict:
        """Deploy a worker script: create DB entry, setup venv if needed, start via supervisor.

        Args:
            db: Database session.
            worker_id: UUID for the new worker.
            script_path: Path to the worker.py file on the machine.
            name: Human-friendly name for the worker.
            source_type: The integration source type (e.g. "gitlab_mrs").
            supervisor: WorkerSupervisor instance.

        Returns:
            Dict with worker_id and status.
        """
        from app.models.integration_source import IntegrationSource

        logger.info("Deploying worker %s (%s) from %s", name, source_type, script_path)

        # 1. Create IntegrationSource record
        source = IntegrationSource(
            source_type=source_type,
            config={"script_path": script_path, "name": name},
            is_enabled=True,
            poll_interval_seconds=300,
        )
        db.add(source)
        await db.flush()

        actual_worker_id = str(source.id)

        # 2. Check for requirements.txt alongside worker.py
        import os
        requirements_path = os.path.join(
            os.path.dirname(script_path), "requirements.txt"
        )
        venv_python = None
        try:
            venv_python = await supervisor.setup_venv(actual_worker_id, requirements_path)
            logger.info("Venv set up for worker %s", actual_worker_id)
        except Exception as exc:
            logger.warning(
                "No venv setup for worker %s (may not need one): %s",
                actual_worker_id,
                exc,
            )

        # 3. Build env via supervisor
        try:
            env = await supervisor.build_worker_env(actual_worker_id)
        except Exception:
            env = {}

        # 4. Start worker via supervisor
        try:
            await supervisor.start_worker(
                worker_id=actual_worker_id,
                script_path=script_path,
                env=env,
                venv_python=venv_python,
            )
        except Exception as exc:
            logger.error("Failed to start worker %s: %s", actual_worker_id, exc)
            return {
                "worker_id": actual_worker_id,
                "status": "error",
                "error": str(exc),
            }

        return {
            "worker_id": actual_worker_id,
            "status": "running",
        }

    async def get_machines_with_claude(self, machine_registry_module: Any) -> list[dict]:
        """Return the local/host machine as the only Integrator target.

        The Integrator always runs on the machine Locus is hosted on.
        No machine selector needed — this is a cemented design decision.
        """
        from app.local.manager import LOCAL_MACHINE_ID

        return [{"id": LOCAL_MACHINE_ID, "name": "This Machine"}]


# Module-level singleton
integrator_service = IntegratorService()
