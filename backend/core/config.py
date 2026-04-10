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

from shared.enums import PaymentProvider


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
    subscription_expiry_cron_enabled: bool = True
    subscription_expiry_cron_timezone: str = "Asia/Ho_Chi_Minh"
    subscription_expiry_cron_hour: int = 0
    subscription_expiry_cron_minute: int = 0
    subscription_expiry_cron_batch_limit: int = 500

    # ─── AI (OpenAI-compatible / Fireworks) ───────────────────────────────────
    openai_api_key: str = ""
    openai_base_url: str = "https://api.fireworks.ai/inference/v1"
    openai_model: str = "accounts/fireworks/routers/kimi-k2p5-turbo"
    llm_request_timeout_seconds: float = 60.0
    llm_stream_idle_timeout_seconds: float = 90.0

    # ─── Object Storage (S3-compatible) ───────────────────────────────────────
    object_storage_access_key: str | None = None
    object_storage_secret_key: str | None = None
    object_storage_bucket: str | None = None
    object_storage_region: str = "ap-southeast-1"
    object_storage_endpoint_internal: str | None = None
    object_storage_endpoint_external: str | None = None
    object_storage_addressing_style: str = "path"
    object_storage_avatar_max_bytes: int = 5 * 1024 * 1024
    object_storage_avatar_prefix: str = "avatars"

    # ─── Payments ─────────────────────────────────────────────────────────────
    payment_default_provider: PaymentProvider | None = None

    stripe_secret_key: str | None = None
    stripe_webhook_secret: str | None = None
    stripe_webhook_tolerance_seconds: int = 300
    stripe_price_id_paid_monthly: str | None = None
    stripe_checkout_success_url: str | None = None
    stripe_checkout_cancel_url: str | None = None

    payos_client_id: str | None = None
    payos_api_key: str | None = None
    payos_checksum_key: str | None = None
    payos_base_url: str | None = None
    payos_return_url: str | None = None
    payos_cancel_url: str | None = None
    payos_amount_vnd: int | None = None
    payos_paid_duration_days: int | None = None
    payos_payment_link_expire_seconds: int | None = None


# Global singleton — imported everywhere in backend
settings = Settings()
