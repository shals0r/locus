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

    model_config = {
        "env_prefix": "LOCUS_",
    }


settings = Settings()
