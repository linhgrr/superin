"""FastAPI application entry point with lifespan management."""

import logging
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from starlette.exceptions import HTTPException as StarletteHTTPException

from core.config import settings
from core.constants import (
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


# ─── Lifespan ─────────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Server lifecycle: startup → serve → shutdown."""
    # 1. Init DB (needed for verify_plugins and agent)
    await init_db()

    # 2. Refresh RootAgent system prompt from discovered manifests
    from core.agents.root import root_agent
    root_agent.refresh()

    # 3. Verify plugins before accepting any requests
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

    yield

    # Shutdown
    await close_db()
    logger.info("✓ Server shutdown complete")


# ─── App factory ────────────────────────────────────────────────────────────────

def create_app() -> FastAPI:
    """Factory — useful for testing (pass app to TestClient)."""
    app = FastAPI(
        title="Shin SuperApp",
        version="2.1.0",
        lifespan=lifespan,
    )

    # ── Middleware ─────────────────────────────────────────────────────────
    # Security headers first (processed last on response)
    app.add_middleware(SecurityHeadersMiddleware)

    # CORS - hardened configuration
    # In production, explicitly list allowed origins instead of using wildcard
    cors_origins = settings.cors_origins
    # Ensure no wildcard origins in production
    if "*" in cors_origins and settings.hf_space is not True:
        logger.warning("CORS wildcard (*) not recommended for production")

    app.add_middleware(
        CORSMiddleware,
        allow_origins=cors_origins,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],  # Specific methods only
        allow_headers=[
            "Authorization",
            "Content-Type",
            "Accept",
            "X-Requested-With",
            "Origin",
        ],  # Specific headers only
        expose_headers=["Content-Type", "Authorization"],
        max_age=600,  # Cache preflight for 10 minutes
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
