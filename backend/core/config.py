"""Application settings loaded from environment variables.

.env loading order (highest to lowest priority):
  1. System / shell env vars (e.g. from docker-compose, Railway, CI/CD)
  2. .env.local (git-ignored — local secrets and overrides)
  3. .env (committed template, safe defaults only)

Note: list[str] fields must be JSON arrays in env files.
  ✅ CORS_ORIGINS=["http://localhost:5173","https://app.vercel.app"]
  ❌ CORS_ORIGINS=http://localhost:5173,https://app.vercel.app

Production: set env vars directly in your deployment platform.
"""

from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """All configuration comes from environment variables."""

    model_config = SettingsConfigDict(
        env_file=(
            Path(__file__).parent.parent / ".env.local",
            Path(__file__).parent.parent / ".env",
        ),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # ─── Database ─────────────────────────────────────────────────────────────
    mongodb_uri: str
    mongodb_database: str = "superin"

    # ─── Auth ─────────────────────────────────────────────────────────────────
    jwt_secret: str
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 15
    refresh_token_expire_days: int = 7

    # ─── CORS (JSON array in .env file) ──────────────────────────────────────
    cors_origins: list[str] = ["http://localhost:5173"]
    admin_emails: list[str] = []

    # ─── Deployment ──────────────────────────────────────────────────────────
    hf_space: bool = False

    # ─── AI (OpenAI-compatible / Fireworks) ───────────────────────────────────
    openai_api_key: str = ""
    openai_base_url: str = "https://api.fireworks.ai/inference/v1"
    openai_model: str = "accounts/fireworks/routers/kimi-k2p5-turbo"
    llm_request_timeout_seconds: float = 60.0
    llm_stream_idle_timeout_seconds: float = 90.0


# Global singleton — imported everywhere in backend
settings = Settings()
