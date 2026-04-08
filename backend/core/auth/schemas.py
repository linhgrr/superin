"""Auth request/response Pydantic schemas."""

from pydantic import BaseModel, EmailStr, Field


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    name: str = Field(min_length=1, max_length=100)


class UpdateUserSettingsRequest(BaseModel):
    """Update user settings like timezone."""

    settings: dict = Field(
        default_factory=dict,
        description="User settings object (e.g., {timezone: 'Asia/Ho_Chi_Minh'})",
    )
