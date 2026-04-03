from pydantic import AliasChoices, Field
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Application configuration loaded from environment variables."""

    database_url: str = Field(
        default="postgresql+asyncpg://locus:changeme@db:5432/locus",
        validation_alias=AliasChoices("LOCUS_DB_URL", "LOCUS_DATABASE_URL"),
    )
    secret_key: str = "changeme-generate-with-openssl-rand-hex-32"
    encryption_key: str = "changeme-generate-fernet-key"
    access_token_expire_minutes: int = 60
    heartbeat_interval_seconds: int = 30
    reconnect_initial_delay: float = 1.0
    reconnect_max_delay: float = 30.0
    reconnect_max_retries: int = 10

    # Local machine settings (Docker-to-host SSH)
    local_ssh_host: str = "host.docker.internal"
    local_ssh_port: int = 22
    local_ssh_user: str = ""
    local_ssh_key: str = ""
    local_repo_scan_paths_raw: str = Field(
        default="",
        validation_alias=AliasChoices(
            "LOCUS_LOCAL_REPO_SCAN_PATHS_RAW",
            "LOCUS_LOCAL_REPO_SCAN_PATHS",
        ),
    )
    in_docker: bool = False

    # Host agent settings (Docker-to-host via agent instead of SSH)
    agent_url: str = ""  # e.g., http://host.docker.internal:7700
    agent_token_file: str = ""  # e.g., /opt/locus-agent/agent.token

    # Webhook HMAC secret for feed ingest
    webhook_secret: str = ""

    # LLM settings for AI-assisted tier classification
    llm_api_key: str = ""
    llm_api_url: str = "https://api.anthropic.com/v1/messages"
    llm_model: str = "claude-sonnet-4-20250514"

    @property
    def local_repo_scan_paths(self) -> list[str]:
        """Parse comma-separated repo scan paths into a list."""
        if not self.local_repo_scan_paths_raw:
            return []
        return [p.strip() for p in self.local_repo_scan_paths_raw.split(",") if p.strip()]

    model_config = {
        "env_prefix": "LOCUS_",
    }


settings = Settings()


async def get_local_scan_paths_from_db() -> list[str] | None:
    """Read local_repo_scan_paths from DB. Returns None if not set."""
    from app.database import async_session_factory
    from app.models.app_setting import AppSetting

    try:
        async with async_session_factory() as db:
            result = await db.get(AppSetting, "local_repo_scan_paths")
            if result and result.value:
                return [p.strip() for p in result.value.split(",") if p.strip()]
    except Exception:
        pass
    return None
