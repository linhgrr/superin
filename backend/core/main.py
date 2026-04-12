"""FastAPI application entry point with lifespan management."""

import asyncio
import logging
from concurrent.futures import ThreadPoolExecutor
from contextlib import asynccontextmanager
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from fastapi import Depends, FastAPI
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from starlette.exceptions import HTTPException as StarletteHTTPException

from core.config import settings
from core.constants import (
    API_ADMIN,
    API_AUTH,
    API_CATALOG,
    API_CHAT,
    API_ROOT,
    API_SUBSCRIPTIONS,
    API_WORKSPACE,
)
from core.db import close_db, init_db
from core.discovery import discover_apps
from core.exceptions import (
    generic_handler,
    http_exception_handler,
    validation_handler,
)
from core.middleware.logging import RequestLoggingMiddleware
from core.middleware.security import SecurityHeadersMiddleware
from core.verify import verify_plugins

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s — %(message)s",
)
logger = logging.getLogger(__name__)


def _validate_subscription_expiry_cron_config() -> ZoneInfo:
    if not (0 <= settings.subscription_expiry_cron_hour <= 23):
        raise RuntimeError("SUBSCRIPTION_EXPIRY_CRON_HOUR must be within [0, 23].")
    if not (0 <= settings.subscription_expiry_cron_minute <= 59):
        raise RuntimeError("SUBSCRIPTION_EXPIRY_CRON_MINUTE must be within [0, 59].")
    if settings.subscription_expiry_cron_batch_limit <= 0:
        raise RuntimeError("SUBSCRIPTION_EXPIRY_CRON_BATCH_LIMIT must be a positive integer.")
    try:
        return ZoneInfo(settings.subscription_expiry_cron_timezone)
    except ZoneInfoNotFoundError as exc:
        raise RuntimeError(
            f"Invalid SUBSCRIPTION_EXPIRY_CRON_TIMEZONE='{settings.subscription_expiry_cron_timezone}'",
        ) from exc


def _seconds_until_next_daily_run(*, timezone: ZoneInfo, hour: int, minute: int) -> float:
    now = datetime.now(timezone)
    next_run = now.replace(hour=hour, minute=minute, second=0, microsecond=0)
    if next_run <= now:
        next_run += timedelta(days=1)
    return (next_run - now).total_seconds()


async def _run_subscription_expiry_cron(stop_event: asyncio.Event) -> None:
    from core.subscriptions.service import expire_due_payos_subscriptions

    timezone = _validate_subscription_expiry_cron_config()
    hour = settings.subscription_expiry_cron_hour
    minute = settings.subscription_expiry_cron_minute
    batch_limit = settings.subscription_expiry_cron_batch_limit

    while not stop_event.is_set():
        wait_seconds = _seconds_until_next_daily_run(
            timezone=timezone,
            hour=hour,
            minute=minute,
        )
        logger.info(
            "Subscription expiry cron sleeping %.0fs until next run at %02d:%02d (%s)",
            wait_seconds,
            hour,
            minute,
            settings.subscription_expiry_cron_timezone,
        )
        try:
            await asyncio.wait_for(stop_event.wait(), timeout=wait_seconds)
            break
        except TimeoutError:
            pass

        try:
            expired_count = await expire_due_payos_subscriptions(limit=batch_limit)
            logger.info("Subscription expiry cron processed %d expired PayOS subscription(s)", expired_count)
        except Exception:
            logger.exception("Subscription expiry cron failed")


# ─── Lifespan ─────────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Server lifecycle: startup → serve → shutdown."""
    # 0. Tune default thread pool to prevent MongoDBStore sync operations from starving async threads
    loop = asyncio.get_running_loop()
    loop.set_default_executor(ThreadPoolExecutor(max_workers=100))

    # 1. Init DB (needed for verify_plugins and agent)
    await init_db()

    # 2. Init Redis for rate limiting (optional — falls back to in-memory)
    from core.utils.limiter import set_redis_client, tiered_limiter
    _redis = None
    if settings.redis_url:
        try:
            from fastapi_limiter import FastAPILimiter
            from redis.asyncio import from_url as redis_from_url
            _redis = await redis_from_url(
                settings.redis_url,
                encoding="utf-8",
                decode_responses=True,
            )
            await FastAPILimiter.init(_redis)
            set_redis_client(_redis)
            tiered_limiter.set_redis(_redis)
            logger.info("✓ Redis rate limiting enabled (%s)", settings.redis_url)
        except Exception:
            logger.warning(
                "⚠️  Redis connection failed — rate limiting falls back to in-memory (not safe for multi-worker)",
                exc_info=True,
            )
    else:
        logger.warning(
            "⚠️  REDIS_URL not set — using in-memory rate limiting (NOT safe for multi-worker deployments)",
        )

    # 3. Refresh RootAgent system prompt from discovered manifests
    from core.agents.root import root_agent
    root_agent.refresh()

    # 4. Verify plugins before accepting any requests
    errors, warnings = verify_plugins()
    for w in warnings:
        logger.warning("⚠️  %s", w)
    if warnings:
        logger.warning("⚠️  %d startup warning(s)", len(warnings))
    if errors:
        for e in errors:
            logger.error("❌ %s", e)
        raise RuntimeError(
            f"{len(errors)} startup error(s) — fix before running. See above."
        )

    logger.info("✓ Server ready — all plugins verified")

    expiry_cron_stop_event = asyncio.Event()
    expiry_cron_task: asyncio.Task[None] | None = None
    if settings.subscription_expiry_cron_enabled:
        _validate_subscription_expiry_cron_config()
        expiry_cron_task = asyncio.create_task(_run_subscription_expiry_cron(expiry_cron_stop_event))
        logger.info(
            "✓ Subscription expiry cron enabled (%02d:%02d %s, batch_limit=%d)",
            settings.subscription_expiry_cron_hour,
            settings.subscription_expiry_cron_minute,
            settings.subscription_expiry_cron_timezone,
            settings.subscription_expiry_cron_batch_limit,
        )

    yield

    # Shutdown
    if expiry_cron_task is not None:
        expiry_cron_stop_event.set()
        await expiry_cron_task

    if _redis is not None:
        try:
            await _redis.aclose()
        except Exception:
            pass

    await close_db()
    logger.info("✓ Server shutdown complete")



# ─── App factory ────────────────────────────────────────────────────────────────

def create_app() -> FastAPI:
    """Factory — useful for testing (pass app to TestClient)."""
    app = FastAPI(
        title="Superin",
        version="2.1.0",
        lifespan=lifespan,
    )

    # ── Middleware ───────────────────────────────────────────
    # Security headers first (processed last on response)
    app.add_middleware(SecurityHeadersMiddleware)

    # CORS - hardened configuration
    cors_origins = settings.cors_origins
    # Fail hard: wildcard + credentials = security hole (any site can make auth'd requests)
    if "*" in cors_origins and not settings.hf_space:
        raise RuntimeError(
            "CORS wildcard (*) with allow_credentials=True is a critical security misconfiguration. "
            "Set CORS_ORIGINS to a specific list of allowed origins, or set HF_SPACE=true to bypass."
        )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=cors_origins,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
        allow_headers=[
            "Authorization",
            "Content-Type",
            "Accept",
            "X-Requested-With",
            "Origin",
        ],
        expose_headers=["Content-Type", "Authorization"],
        max_age=600,
    )
    app.add_middleware(RequestLoggingMiddleware)

    # ── Exception handlers ────────────────────────────────────────────────
    app.add_exception_handler(StarletteHTTPException, http_exception_handler)
    app.add_exception_handler(RequestValidationError, validation_handler)
    app.add_exception_handler(Exception, generic_handler)

    # ── Core routers ──────────────────────────────────────────────────────
    from core.auth.routes import router as auth_router
    app.include_router(auth_router, prefix=API_AUTH, tags=["auth"])

    from core.catalog.routes import router as catalog_router
    app.include_router(catalog_router, prefix=API_CATALOG, tags=["catalog"])

    from core.chat.routes import router as chat_router
    app.include_router(chat_router, prefix=API_CHAT, tags=["chat"])

    from core.workspace.routes import router as workspace_router
    app.include_router(workspace_router, prefix=API_WORKSPACE, tags=["workspace"])

    from core.subscriptions.routes import router as subscriptions_router
    app.include_router(subscriptions_router, prefix=API_SUBSCRIPTIONS, tags=["subscriptions"])

    from core.admin.routes import router as admin_router
    app.include_router(admin_router, prefix=API_ADMIN, tags=["admin"])

    # ── Plugin routers — discover and mount immediately for OpenAPI spec ──
    # Safe to call multiple times; plugin modules are already imported.
    discover_apps()
    from core.registry import PLUGIN_REGISTRY
    from core.workspace.service import require_installed_app
    for app_id, plugin in PLUGIN_REGISTRY.items():
        app.include_router(
            plugin["router"],
            prefix=f"{API_ROOT}/apps/{app_id}",
            tags=[app_id],
            dependencies=[Depends(require_installed_app(app_id))],
        )

    # ── Health check ───────────────────────────────────────────────────────
    @app.get("/health", tags=["health"])
    async def health():
        return {"status": "ok", "version": "2.1.0"}

    return app


# ─── App instance (uvicorn imports this) ───────────────────────────────────────

app = create_app()
