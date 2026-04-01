"""JWT utilities: create, verify tokens and FastAPI dependency for getting current user."""

import uuid
from datetime import UTC, datetime, timedelta
from typing import Annotated

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt

from core.config import settings
from core.models import TokenBlacklist

security = HTTPBearer()


def create_access_token(data: dict) -> str:
    """Create a short-lived access token (default 15 min)."""
    to_encode = data.copy()
    to_encode.update({
        "exp": datetime.now(UTC) + timedelta(minutes=settings.access_token_expire_minutes),
        "type": "access",
        "jti": str(uuid.uuid4()),
    })
    return jwt.encode(to_encode, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def create_refresh_token(data: dict) -> str:
    """Create a long-lived refresh token (default 7 days)."""
    to_encode = data.copy()
    to_encode.update({
        "exp": datetime.now(UTC) + timedelta(days=settings.refresh_token_expire_days),
        "type": "refresh",
        "jti": str(uuid.uuid4()),
    })
    return jwt.encode(to_encode, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def decode_token(token: str) -> dict:
    """Decode and validate a JWT without checking type."""
    return jwt.decode(
        token,
        settings.jwt_secret,
        algorithms=[settings.jwt_algorithm],
    )


async def get_current_user(
    credentials: Annotated[HTTPAuthorizationCredentials, Depends(security)],
) -> str:
    """FastAPI dependency — validates access token and returns user_id.

    Raises HTTPException 401 if token is invalid, expired, or revoked.
    """
    token = credentials.credentials
    try:
        payload = decode_token(token)
        user_id: str | None = payload.get("sub")
        token_type: str | None = payload.get("type")
        jti: str | None = payload.get("jti")

        if user_id is None:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED)
        if token_type != "access":
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED)

        if jti:
            revoked = await TokenBlacklist.find_one(TokenBlacklist.jti == jti)
            if revoked:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Token has been revoked",
                )

        return user_id
    except JWTError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED)


async def get_current_user_optional(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(HTTPBearer(auto_error=False))],
) -> str | None:
    """FastAPI dependency — validates access token if present, returns None if missing."""
    if credentials is None:
        return None
    try:
        return await get_current_user(credentials)
    except HTTPException:
        return None
