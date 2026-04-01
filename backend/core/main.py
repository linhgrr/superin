"""FastAPI application entry point with lifespan management."""

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from starlette.exceptions import HTTPException as StarletteHTTPException

from core.config import settings
from core.db import close_db, init_db
from core.discovery import discover_apps
from core.exceptions import (
    generic_handler,
    http_exception_handler,
    validation_handler,
)
from core.logging_middleware import RequestLoggingMiddleware
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
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.add_middleware(RequestLoggingMiddleware)

    # ── Exception handlers ────────────────────────────────────────────────
    app.add_exception_handler(StarletteHTTPException, http_exception_handler)
    app.add_exception_handler(RequestValidationError, validation_handler)
    app.add_exception_handler(Exception, generic_handler)

    # ── Core routers ──────────────────────────────────────────────────────
    from apps.auth import router as auth_router
    app.include_router(auth_router, prefix="/api/auth", tags=["auth"])

    from apps.catalog import router as catalog_router
    app.include_router(catalog_router, prefix="/api/catalog", tags=["catalog"])

    from apps.chat import router as chat_router
    app.include_router(chat_router, prefix="/api/chat", tags=["chat"])

    # ── Plugin routers — discover and mount immediately for OpenAPI spec ──
    # Safe to call multiple times; plugin modules are already imported.
    discover_apps()
    from core.registry import PLUGIN_REGISTRY
    for app_id, plugin in PLUGIN_REGISTRY.items():
        app.include_router(
            plugin["router"],
            prefix=f"/api/apps/{app_id}",
            tags=[app_id],
        )

    # ── Health check ───────────────────────────────────────────────────────
    @app.get("/health", tags=["health"])
    async def health():
        return {"status": "ok", "version": "2.1.0"}

    return app


# ─── App instance (uvicorn imports this) ───────────────────────────────────────

app = create_app()
