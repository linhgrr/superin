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


# ─── Agent Safety Limits ──────────────────────────────────────────────────────

MAX_MESSAGE_LENGTH = 10000               # characters per message
MAX_TOOL_CALL_ARGUMENTS_SIZE = 5000      # JSON characters per tool call
MAX_TOOL_CALLS_PER_DELEGATION = 30       # per agent invocation
AGENT_RECURSION_LIMIT = 25                # LangGraph recursion limit for child agents


# ─── API Routes — Core Only ───────────────────────────────────────────────────
# App-specific routes are dynamic: /api/apps/{app_id}/... (auto-discovered)

API_ROOT = "/api"

# Core routes (hardcoded in main.py)
API_AUTH = f"{API_ROOT}/auth"
API_CATALOG = f"{API_ROOT}/catalog"
API_CHAT = f"{API_ROOT}/chat"
API_WORKSPACE = f"{API_ROOT}/workspace"
API_SUBSCRIPTIONS = f"{API_ROOT}/subscription"

# Auth endpoints
AUTH_LOGIN = f"{API_AUTH}/login"
AUTH_REGISTER = f"{API_AUTH}/register"
AUTH_REFRESH = f"{API_AUTH}/refresh"
AUTH_LOGOUT = f"{API_AUTH}/logout"
AUTH_ME = f"{API_AUTH}/me"

# Catalog endpoints
CATALOG_APPS = f"{API_CATALOG}/apps"
CATALOG_CATEGORIES = f"{API_CATALOG}/categories"
CATALOG_INSTALL = f"{API_CATALOG}/install/{{app_id}}"
CATALOG_UNINSTALL = f"{API_CATALOG}/uninstall/{{app_id}}"

# Chat endpoints
CHAT_STREAM = f"{API_CHAT}/stream"
CHAT_HISTORY = f"{API_CHAT}/history"


# ─── App API Helper ─────────────────────────────────────────────────────────────

def app_api_path(app_id: str, endpoint: str = "") -> str:
    """Build API path for an app endpoint.

    Usage:
        app_api_path("finance", "wallets")  # → "/api/apps/finance/wallets"
        app_api_path("todo")                  # → "/api/apps/todo"
    """
    base = f"{API_ROOT}/apps/{app_id}"
    return f"{base}/{endpoint}" if endpoint else base
