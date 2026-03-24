from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.user import User
from app.schemas.auth import AuthStatus, LoginRequest, SetupRequest, TokenResponse
from app.services.auth import (
    create_access_token,
    get_current_user,
    hash_password,
    verify_password,
)

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.get("/status", response_model=AuthStatus)
async def auth_status(db: AsyncSession = Depends(get_db)):
    """Check if initial setup has been completed (first-run detection)."""
    result = await db.execute(select(User).limit(1))
    user = result.scalar_one_or_none()
    return AuthStatus(is_setup=user is not None)


@router.post("/setup", response_model=TokenResponse)
async def setup(request: SetupRequest, db: AsyncSession = Depends(get_db)):
    """First-run setup: create user with password."""
    result = await db.execute(select(User).limit(1))
    existing = result.scalar_one_or_none()
    if existing is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Setup already completed",
        )

    user = User(
        password_hash=hash_password(request.password),
        setup_completed=True,
    )
    db.add(user)
    await db.flush()

    token = create_access_token({"sub": str(user.id)})
    return TokenResponse(access_token=token)


@router.post("/login", response_model=TokenResponse)
async def login(request: LoginRequest, db: AsyncSession = Depends(get_db)):
    """Authenticate with password and receive a JWT."""
    result = await db.execute(select(User).limit(1))
    user = result.scalar_one_or_none()

    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="No user configured. Complete setup first.",
        )

    if not verify_password(request.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect password. Try again.",
        )

    token = create_access_token({"sub": str(user.id)})
    return TokenResponse(access_token=token)


@router.get("/me")
async def me(current_user: dict = Depends(get_current_user)):
    """Return current authenticated user info from JWT payload."""
    return current_user
