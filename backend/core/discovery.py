"""Auto-discover and import all app plugins from backend/apps/."""

import importlib
import logging
from pathlib import Path

logger = logging.getLogger(__name__)


def discover_apps() -> None:
    """Scan backend/apps/ and import each subfolder's __init__.py.

    Each __init__.py must call register_plugin() for its app.
    Raises ImportError if a plugin has missing dependencies.

    Call once at server startup (inside lifespan).
    """
    apps_dir = Path(__file__).parent.parent / "apps"
    for app_dir in sorted(apps_dir.iterdir()):
        if not app_dir.is_dir():
            continue
        if app_dir.name.startswith("_") or app_dir.name.startswith("."):
            continue

        module_name = f"apps.{app_dir.name}"
        try:
            importlib.import_module(module_name)
            logger.info("✓ Loaded plugin: %s", app_dir.name)
        except ImportError as e:
            logger.error("✗ Failed to load plugin '%s': %s", app_dir.name, e)
            raise