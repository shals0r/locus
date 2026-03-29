"""Skills discovery REST API endpoint.

Lists discoverable Claude Code skills for a repo on a machine.
"""

import logging
from urllib.parse import unquote

from fastapi import APIRouter, Depends, HTTPException

from app.schemas.skill import SkillListResponse, SkillResponse
from app.services.auth import get_current_user
from app.services.machine_registry import get_connection_for_machine, get_machine_status
from app.services.skill_service import discover_skills

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/skills", tags=["skills"])


@router.get("/{machine_id}/{repo_path:path}", response_model=SkillListResponse)
async def list_skills(
    machine_id: str,
    repo_path: str,
    _user: dict = Depends(get_current_user),
) -> SkillListResponse:
    """List discoverable skills for a repo on a machine.

    machine_id: UUID of the machine (or "local" for this machine)
    repo_path: URL-encoded absolute path to the repository
    """
    status = get_machine_status(machine_id)
    if status not in ("online",):
        raise HTTPException(
            status_code=409,
            detail=f"Machine is not available (status: {status})",
        )

    decoded_path = unquote(repo_path)
    # Ensure absolute path
    if not decoded_path.startswith("/"):
        decoded_path = "/" + decoded_path

    try:
        conn = await get_connection_for_machine(machine_id)
        skills = await discover_skills(conn, decoded_path, machine_id=machine_id)
        return SkillListResponse(
            skills=[SkillResponse(**s) for s in skills],
            repo_path=decoded_path,
        )
    except Exception as exc:
        logger.error("Skill discovery failed: %s", exc)
        # Return empty rather than error -- skills are optional
        return SkillListResponse(skills=[], repo_path=decoded_path)
