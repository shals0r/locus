from pydantic import BaseModel, Field


class SetupRequest(BaseModel):
    """First-run password setup request."""

    password: str = Field(min_length=8)


class LoginRequest(BaseModel):
    """Login request with password."""

    password: str


class TokenResponse(BaseModel):
    """JWT token response."""

    access_token: str
    token_type: str = "bearer"


class AuthStatus(BaseModel):
    """Auth status indicating whether setup has been completed."""

    is_setup: bool
    is_authenticated: bool = False
