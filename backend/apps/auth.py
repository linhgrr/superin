"""Auth routes — login, register, refresh, logout."""

import logging
from datetime import UTC, datetime

from fastapi import APIRouter, Cookie, Depends, HTTPException, Response, status

from apps.auth_schemas import LoginRequest, RegisterRequest, UpdateUserSettingsRequest
from core.auth import create_access_token, create_refresh_token, decode_token, get_current_user
from core.constants import AUTH_COOKIE_MAX_AGE_SECONDS, AUTH_COOKIE_NAME
from core.logging_middleware import login_limiter
from core.models import TokenBlacklist, User
from core.security import get_password_hash, verify_password
from shared.schemas import TokenResponse, UserPublic

router = APIRouter()
logger = logging.getLogger(__name__)


def _token_response(user: User) -> TokenResponse:
    return TokenResponse(
        access_token=create_access_token({"sub": str(user.id)}),
        refresh_token=create_refresh_token({"sub": str(user.id)}),
        token_type="bearer",
        user=UserPublic(id=str(user.id), email=user.email, name=user.name, role=user.role),
    )


def _set_refresh_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        key=AUTH_COOKIE_NAME,
        value=token,
        max_age=AUTH_COOKIE_MAX_AGE_SECONDS,
        httponly=True,
        samesite="lax",
        secure=True,
    )


def _blacklist_token(payload: dict) -> TokenBlacklist | None:
    """Create a TokenBlacklist entry from a decoded token payload."""
    jti = payload.get("jti")
    if not jti:
        return None
    return TokenBlacklist(
        jti=jti,
        expires_at=datetime.fromtimestamp(payload["exp"], tz=UTC),
    )


@router.post("/register", status_code=status.HTTP_201_CREATED)
async def register(request: RegisterRequest, response: Response) -> TokenResponse:
    existing = await User.find_one(User.email == request.email)
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered",
        )

    user = User(
        email=request.email,
        name=request.name,
        hashed_password=await get_password_hash(request.password),
    )
    await user.insert()

    resp = _token_response(user)
    _set_refresh_cookie(response, resp.refresh_token)
    return resp


@router.post("/login")
async def login(request: LoginRequest, response: Response) -> TokenResponse:
    if not login_limiter.allow(request.email):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many login attempts. Try again in a minute.",
        )

    user = await User.find_one(User.email == request.email)
    if not user or not await verify_password(request.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Username or password incorrect",
        )

    resp = _token_response(user)
    _set_refresh_cookie(response, resp.refresh_token)
    return resp


@router.post("/refresh")
async def refresh_tokens(
    response: Response,
    refresh_token: str | None = Cookie(None, alias=AUTH_COOKIE_NAME),
) -> TokenResponse:
    if not refresh_token:
        raise HTTPException(status_code=401, detail="Refresh token missing")

    try:
        payload = decode_token(refresh_token)
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid refresh token")

    if payload.get("type") != "refresh":
        raise HTTPException(status_code=401, detail="Not a refresh token")

    jti = payload.get("jti")
    if jti and await TokenBlacklist.find_one(TokenBlacklist.jti == jti):
        raise HTTPException(status_code=401, detail="Refresh token has been revoked")

    user_id: str | None = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid token payload")

    user = await User.get(user_id)
    if not user:
        raise HTTPException(status_code=401, detail="User not found")

    # Rotate: blacklist old refresh token
    if jti:
        blacklist_entry = _blacklist_token(payload)
        if blacklist_entry:
            await blacklist_entry.insert()

    resp = _token_response(user)
    _set_refresh_cookie(response, resp.refresh_token)
    return resp


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(
    response: Response,
    refresh_token: str | None = Cookie(None, alias=AUTH_COOKIE_NAME),
) -> None:
    # Blacklist the refresh token to prevent reuse after logout
    if refresh_token:
        try:
            payload = decode_token(refresh_token)
            blacklist_entry = _blacklist_token(payload)
            if blacklist_entry:
                await blacklist_entry.insert()
        except Exception:
            logger.debug(
                "Token invalid or expired during logout blacklist",
                exc_info=True,
            )

    response.delete_cookie(key=AUTH_COOKIE_NAME, secure=True)


@router.get("/me")
async def get_me(user_id: str = Depends(get_current_user)) -> UserPublic:
    user = await User.get(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return UserPublic(id=str(user.id), email=user.email, name=user.name, role=user.role, settings=user.settings or {})


@router.patch("/me/settings")
async def update_settings(
    request: UpdateUserSettingsRequest,
    user_id: str = Depends(get_current_user),
) -> UserPublic:
    """Update user settings (timezone, etc.)."""
    user = await User.get(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # Merge new settings with existing
    current_settings = user.settings or {}
    current_settings.update(request.settings)
    user.settings = current_settings
    await user.save()

    return UserPublic(id=str(user.id), email=user.email, name=user.name, role=user.role, settings=user.settings)
