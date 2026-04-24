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

from dotenv import load_dotenv
from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

from shared.enums import PaymentProvider

_BACKEND_DIR = Path(__file__).parent.parent


def _prime_process_env() -> None:
    """Load backend env files into os.environ for third-party SDKs.

    BaseSettings can read from env files without mutating process environment.
    Libraries like LangSmith read directly from os.environ, so we prime those
    variables here while preserving documented precedence:
    system env > .env.local > .env.
    """
    for env_path in (_BACKEND_DIR / ".env", _BACKEND_DIR / ".env.local"):
        if env_path.exists():
            load_dotenv(env_path, override=False)


_prime_process_env()


class Settings(BaseSettings):
    """All configuration comes from environment variables."""

    model_config = SettingsConfigDict(
        env_file=(
            _BACKEND_DIR / ".env.local",
            _BACKEND_DIR / ".env",
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

    # ─── Redis (for multi-worker rate limiting) ───────────────────────────────
    # If not set, rate limiting falls back to in-memory (single-worker only).
    redis_url: str | None = None

    # ─── Deployment ──────────────────────────────────────────────────────────
    hf_space: bool = False
    subscription_expiry_cron_enabled: bool = True
    subscription_expiry_cron_timezone: str = "Asia/Ho_Chi_Minh"
    subscription_expiry_cron_hour: int = 0
    subscription_expiry_cron_minute: int = 0
    subscription_expiry_cron_batch_limit: int = 500

    # ─── AI (OpenAI-compatible / Fireworks) ───────────────────────────────────
    openai_api_key: str = ""
    openai_base_url: str = ""
    openai_model: str = ""
    llm_request_timeout_seconds: float = 60.0
    child_agent_timeout_seconds: float = 60.0
    child_agent_tool_call_soft_limit: int = 4
    child_agent_tool_call_hard_limit: int = 6
    child_agent_recursion_limit: int = 25
    child_agent_checkpoint_enabled: bool = False
    llm_stream_idle_timeout_seconds: float = 120.0
    memory_semantic_search_enabled: bool = False
    memory_embedding_model: str = ""
    memory_embedding_dimensions: int = 1536
    memory_vector_index_name: str = "superin_memory_index"
    root_agent_max_dispatch_rounds: int = 2
    root_agent_max_app_attempts_per_turn: int = 2
    root_agent_max_total_workers_per_turn: int = 8
    root_agent_max_turn_wall_seconds: float = 90.0
    root_agent_per_worker_timeout_seconds: float = 30.0
    pending_question_ttl_minutes: int = 30

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

    @model_validator(mode="after")
    def validate_agent_timeouts(self) -> "Settings":
        if not (
            self.child_agent_tool_call_soft_limit
            < self.child_agent_tool_call_hard_limit
            < self.child_agent_recursion_limit
        ):
            raise ValueError(
                "child agent limits must satisfy soft_limit < hard_limit < recursion_limit"
            )

        max_rounds = max(self.root_agent_max_dispatch_rounds, 1)
        if (
            self.root_agent_per_worker_timeout_seconds * max_rounds
            > self.root_agent_max_turn_wall_seconds * 1.2
        ):
            raise ValueError(
                "root agent timeout settings violate per_worker_timeout * max_rounds <= "
                "max_turn_wall_seconds * 1.2"
            )

        return self


# Global singleton — imported everywhere in backend
settings: Settings = Settings()  # type: ignore[call-arg]
