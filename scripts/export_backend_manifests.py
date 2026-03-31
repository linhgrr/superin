"""Export backend app manifests as JSON for cross-stack validation."""

from __future__ import annotations

import json
import sys
from importlib import import_module
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BACKEND_ROOT = ROOT / "backend"

sys.path.insert(0, str(BACKEND_ROOT))

from shared.schemas import AppManifestSchema  # noqa: E402


def load_backend_manifests() -> list[dict]:
    manifests: list[dict] = []

    for app_dir in sorted((BACKEND_ROOT / "apps").iterdir()):
        if not app_dir.is_dir():
            continue
        if app_dir.name.startswith("__"):
            continue

        manifest_file = app_dir / "manifest.py"
        if not manifest_file.exists():
            continue

        module = import_module(f"apps.{app_dir.name}.manifest")
        manifest = next(
            value
            for value in vars(module).values()
            if isinstance(value, AppManifestSchema)
        )
        manifests.append(
            {
                "id": manifest.id,
                "name": manifest.name,
                "widgets": [
                    {"id": widget.id, "size": widget.size}
                    for widget in manifest.widgets
                ],
            }
        )

    return manifests


if __name__ == "__main__":
    print(json.dumps(load_backend_manifests()))
