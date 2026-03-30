"""Backend-wide constants — single source of truth.

Import from here wherever needed. Never hardcode constants in modules.
"""

# ─── Auth / JWT ───────────────────────────────────────────────────────────────

AUTH_COOKIE_NAME = "refresh_token"
AUTH_COOKIE_MAX_AGE_SECONDS = 7 * 24 * 60 * 60  # 7 days


# ─── Rate Limiting ────────────────────────────────────────────────────────────

RATE_LIMIT_LOGIN = 5       # per minute per email
RATE_LIMIT_CHAT = 30      # per minute per user
RATE_LIMIT_DEFAULT = 120  # per minute per user

