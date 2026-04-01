import os

from pydantic_settings import BaseSettings


class AgentSettings(BaseSettings):
    """Agent configuration loaded from environment variables."""

    port: int = 7700
    host: str = "0.0.0.0"
    token: str = ""
    agent_dir: str = os.path.expanduser("~/.locus-agent")
    log_level: str = "info"

    model_config = {
        "env_prefix": "LOCUS_AGENT_",
    }


settings = AgentSettings()
