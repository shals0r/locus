"""Settings and credential management API with Fernet encryption."""

import json
import logging
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.models.app_setting import AppSetting
from app.models.credential import Credential
from app.services.auth import get_current_user
from app.services.crypto import decrypt_value, encrypt_value
from app.ssh.manager import ssh_manager

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/settings", tags=["settings"])


# --- Schemas ---


class CredentialCreate(BaseModel):
    """Schema for creating a new credential."""

    service_type: str
    service_name: str
    data: dict


class CredentialUpdate(BaseModel):
    """Schema for updating a credential."""

    service_name: str | None = None
    data: dict | None = None


class CredentialListItem(BaseModel):
    """Schema for credential list (no sensitive data)."""

    id: str
    service_type: str
    service_name: str


class CredentialDetail(BaseModel):
    """Schema for single credential with decrypted data."""

    id: str
    service_type: str
    service_name: str
    data: dict


class CredentialTestResponse(BaseModel):
    """Schema for credential test result."""

    success: bool
    message: str


class ClaudeCodeConfig(BaseModel):
    """Schema for Claude Code configuration."""

    auth_type: str | None = None  # "api_key" or "oauth"
    masked_key: str | None = None
    configured: bool = False


class ClaudeCodeUpdate(BaseModel):
    """Schema for updating Claude Code credential."""

    auth_type: str  # "api_key" or "oauth"
    data: dict


class StatusResponse(BaseModel):
    """Schema for service status endpoint."""

    database: str
    ssh_machines: dict[str, str]
    claude_code: str


class GeneralSettingsResponse(BaseModel):
    """Schema for general settings response."""

    local_repo_scan_paths: list[str]


class GeneralSettingsUpdate(BaseModel):
    """Schema for updating general settings."""

    local_repo_scan_paths: list[str]


# --- General settings endpoints ---


@router.get("/general", response_model=GeneralSettingsResponse)
async def get_general_settings(
    _user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> GeneralSettingsResponse:
    """Get general application settings.

    Returns local_repo_scan_paths from DB if set, otherwise falls back
    to the LOCUS_LOCAL_REPO_SCAN_PATHS env var.
    """
    result = await db.get(AppSetting, "local_repo_scan_paths")
    if result and result.value:
        paths = [p.strip() for p in result.value.split(",") if p.strip()]
    else:
        paths = settings.local_repo_scan_paths
    return GeneralSettingsResponse(local_repo_scan_paths=paths)


@router.put("/general", response_model=GeneralSettingsResponse)
async def update_general_settings(
    body: GeneralSettingsUpdate,
    _user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> GeneralSettingsResponse:
    """Update general application settings.

    Persists local_repo_scan_paths to the database so they survive
    container restarts without requiring env var changes.
    """
    value = ",".join(body.local_repo_scan_paths)
    await db.merge(AppSetting(key="local_repo_scan_paths", value=value))
    await db.flush()
    return GeneralSettingsResponse(local_repo_scan_paths=body.local_repo_scan_paths)


# --- Credential endpoints ---


@router.get("/credentials", response_model=list[CredentialListItem])
async def list_credentials(
    _user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[CredentialListItem]:
    """List all credentials without exposing encrypted data."""
    result = await db.execute(select(Credential))
    credentials = result.scalars().all()
    return [
        CredentialListItem(
            id=str(c.id),
            service_type=c.service_type,
            service_name=c.service_name,
        )
        for c in credentials
    ]


@router.post(
    "/credentials",
    response_model=CredentialListItem,
    status_code=status.HTTP_201_CREATED,
)
async def create_credential(
    body: CredentialCreate,
    _user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> CredentialListItem:
    """Create a new encrypted credential."""
    encrypted = encrypt_value(json.dumps(body.data))
    credential = Credential(
        service_type=body.service_type,
        service_name=body.service_name,
        encrypted_data=encrypted,
    )
    db.add(credential)
    await db.flush()

    return CredentialListItem(
        id=str(credential.id),
        service_type=credential.service_type,
        service_name=credential.service_name,
    )


@router.get("/credentials/{credential_id}", response_model=CredentialDetail)
async def get_credential(
    credential_id: UUID,
    _user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> CredentialDetail:
    """Get a single credential with decrypted data for editing."""
    credential = await db.get(Credential, credential_id)
    if credential is None:
        raise HTTPException(status_code=404, detail="Credential not found")

    decrypted = json.loads(decrypt_value(credential.encrypted_data))
    return CredentialDetail(
        id=str(credential.id),
        service_type=credential.service_type,
        service_name=credential.service_name,
        data=decrypted,
    )


@router.put("/credentials/{credential_id}", response_model=CredentialListItem)
async def update_credential(
    credential_id: UUID,
    body: CredentialUpdate,
    _user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> CredentialListItem:
    """Update a credential, re-encrypting new data."""
    credential = await db.get(Credential, credential_id)
    if credential is None:
        raise HTTPException(status_code=404, detail="Credential not found")

    if body.service_name is not None:
        credential.service_name = body.service_name
    if body.data is not None:
        credential.encrypted_data = encrypt_value(json.dumps(body.data))

    await db.flush()

    return CredentialListItem(
        id=str(credential.id),
        service_type=credential.service_type,
        service_name=credential.service_name,
    )


@router.delete("/credentials/{credential_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_credential(
    credential_id: UUID,
    _user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    """Delete a credential."""
    credential = await db.get(Credential, credential_id)
    if credential is None:
        raise HTTPException(status_code=404, detail="Credential not found")
    await db.delete(credential)
    await db.flush()


@router.post(
    "/credentials/{credential_id}/test",
    response_model=CredentialTestResponse,
)
async def test_credential(
    credential_id: UUID,
    _user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> CredentialTestResponse:
    """Test connectivity for a credential.

    Currently returns a placeholder response. Per-service testing
    will be implemented in Phase 4 (integrations).
    """
    credential = await db.get(Credential, credential_id)
    if credential is None:
        raise HTTPException(status_code=404, detail="Credential not found")

    return CredentialTestResponse(
        success=True,
        message=f"Test not implemented for this service type",
    )


# --- Claude Code config endpoints ---


@router.get("/claude-code", response_model=ClaudeCodeConfig)
async def get_claude_code_config(
    _user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ClaudeCodeConfig:
    """Get Claude Code credential configuration (masked)."""
    result = await db.execute(
        select(Credential).where(Credential.service_type == "claude_code")
    )
    credential = result.scalars().first()

    if credential is None:
        return ClaudeCodeConfig(configured=False)

    decrypted = json.loads(decrypt_value(credential.encrypted_data))
    auth_type = decrypted.get("auth_type", "api_key")

    # Mask the key for display
    key = decrypted.get("api_key", decrypted.get("token", ""))
    if key:
        masked = key[:8] + "..." + key[-4:] if len(key) > 12 else "***"
    else:
        masked = None

    return ClaudeCodeConfig(
        auth_type=auth_type,
        masked_key=masked,
        configured=True,
    )


@router.put("/claude-code", response_model=ClaudeCodeConfig)
async def update_claude_code_config(
    body: ClaudeCodeUpdate,
    _user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ClaudeCodeConfig:
    """Save or update Claude Code credential."""
    result = await db.execute(
        select(Credential).where(Credential.service_type == "claude_code")
    )
    credential = result.scalars().first()

    data_with_type = {**body.data, "auth_type": body.auth_type}
    encrypted = encrypt_value(json.dumps(data_with_type))

    if credential is None:
        credential = Credential(
            service_type="claude_code",
            service_name="Claude Code",
            encrypted_data=encrypted,
        )
        db.add(credential)
    else:
        credential.encrypted_data = encrypted

    await db.flush()

    # Return masked config
    key = body.data.get("api_key", body.data.get("token", ""))
    if key:
        masked = key[:8] + "..." + key[-4:] if len(key) > 12 else "***"
    else:
        masked = None

    return ClaudeCodeConfig(
        auth_type=body.auth_type,
        masked_key=masked,
        configured=True,
    )


@router.post("/claude-code/push/{machine_id}")
async def push_claude_code_to_machine(
    machine_id: UUID,
    _user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Push Claude Code auth to a remote machine via SSH.

    Connects to the machine and writes the Claude Code configuration
    to ~/.claude/ or sets environment variables, enabling AUTH-04.
    """
    # Get Claude Code credential
    result = await db.execute(
        select(Credential).where(Credential.service_type == "claude_code")
    )
    credential = result.scalars().first()
    if credential is None:
        raise HTTPException(
            status_code=404,
            detail="Claude Code credential not configured",
        )

    # Get machine connection
    conn = await ssh_manager.get_connection(str(machine_id))
    if conn is None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Machine is not connected",
        )

    decrypted = json.loads(decrypt_value(credential.encrypted_data))
    auth_type = decrypted.get("auth_type", "api_key")

    try:
        # Ensure ~/.claude directory exists
        await conn.run("mkdir -p ~/.claude", check=True)

        if auth_type == "api_key":
            api_key = decrypted.get("api_key", "")
            # Write API key to environment file (heredoc avoids shell injection)
            await conn.run(
                f"cat > ~/.claude/env << 'LOCUS_ENV_EOF'\nexport ANTHROPIC_API_KEY={api_key}\nLOCUS_ENV_EOF",
                check=True,
            )
            await conn.run("chmod 600 ~/.claude/env", check=True)
        elif auth_type == "oauth":
            token = decrypted.get("token", "")
            # Write OAuth token (heredoc avoids shell injection)
            import json as json_mod
            cred_json = json_mod.dumps({"token": token})
            await conn.run(
                f"cat > ~/.claude/credentials.json << 'LOCUS_CRED_EOF'\n{cred_json}\nLOCUS_CRED_EOF",
                check=True,
            )
            await conn.run("chmod 600 ~/.claude/credentials.json", check=True)

        # Push Locus status hooks into Claude Code settings
        await _push_locus_hooks(conn)

        return {"success": True, "message": f"Claude Code {auth_type} pushed to machine"}
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Failed to push Claude Code config: {exc}",
        )


# Locus hooks injected into Claude Code settings for status detection
_LOCUS_HOOKS = {
    "Stop": [
        {
            "matcher": "",
            "hooks": [
                {
                    "type": "command",
                    "command": "echo '{\"status\":\"waiting\",\"ts\":'$(date +%s)'}' > /tmp/.locus-claude-status",
                }
            ],
        }
    ],
    "PreToolUse": [
        {
            "matcher": "",
            "hooks": [
                {
                    "type": "command",
                    "command": "echo '{\"status\":\"running\",\"ts\":'$(date +%s)'}' > /tmp/.locus-claude-status",
                }
            ],
        }
    ],
}


async def _push_locus_hooks(conn: object) -> None:
    """Merge Locus status hooks into Claude Code settings on remote machine."""
    settings_path = "~/.claude/settings.json"
    existing: dict = {}

    try:
        result = await conn.run(f"cat {settings_path} 2>/dev/null", check=True)  # type: ignore[union-attr]
        existing = json.loads(result.stdout.strip())
    except Exception:
        pass  # File doesn't exist or invalid JSON — start fresh

    # Merge hooks: preserve user hooks, add/replace Locus hooks
    hooks = existing.get("hooks", {})
    for event, rules in _LOCUS_HOOKS.items():
        event_hooks = hooks.get(event, [])
        # Remove any existing Locus-managed hooks (identified by marker file path)
        event_hooks = [
            h for h in event_hooks
            if not any(
                "/tmp/.locus-claude-status" in (hook.get("command", ""))
                for hook in h.get("hooks", [])
            )
        ]
        event_hooks.extend(rules)
        hooks[event] = event_hooks

    existing["hooks"] = hooks
    settings_json = json.dumps(existing, indent=2)

    await conn.run(  # type: ignore[union-attr]
        f"cat > {settings_path} << 'LOCUS_EOF'\n{settings_json}\nLOCUS_EOF",
        check=True,
    )
    await conn.run(f"chmod 600 {settings_path}", check=True)  # type: ignore[union-attr]
    logger.info("Pushed Locus status hooks to remote Claude Code settings")


# --- Status endpoint ---


@router.get("/status", response_model=StatusResponse)
async def get_status(
    _user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> StatusResponse:
    """Return connected service statuses for top bar indicators.

    Aggregates database connectivity, SSH machine statuses, and
    Claude Code configuration state.
    """
    # Database: if we got here, it's connected
    db_status = "connected"

    # SSH machines: get status for all known machines
    from app.models.machine import Machine

    result = await db.execute(select(Machine))
    machines = result.scalars().all()
    ssh_statuses = {
        str(m.id): ssh_manager.get_status(str(m.id))
        for m in machines
    }

    # Claude Code: check if configured
    cc_result = await db.execute(
        select(Credential).where(Credential.service_type == "claude_code")
    )
    cc_credential = cc_result.scalars().first()
    claude_status = "configured" if cc_credential is not None else "unconfigured"

    return StatusResponse(
        database=db_status,
        ssh_machines=ssh_statuses,
        claude_code=claude_status,
    )
