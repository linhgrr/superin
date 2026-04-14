"""Compatibility alias for the legacy `core.catalog_service` import path."""

from __future__ import annotations

import sys

from core.catalog import service as _service

# Keep legacy imports and monkeypatch-based tests pointing at the canonical
# implementation module instead of maintaining a second wrapper layer.
sys.modules[__name__] = _service
