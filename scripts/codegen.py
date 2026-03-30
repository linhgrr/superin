#!/usr/bin/env python3
"""
Codegen — generates TypeScript types from the backend OpenAPI spec.

Pipeline: FastAPI app → openapi.json → openapi-typescript (Node.js) → api.ts

Environment (for generating openapi.json):
    Requires conda environment `linhdz` to be active, OR set these env vars:
    MONGODB_URI, JWT_SECRET, OPENAI_API_KEY, OPENAI_BASE_URL

Usage:
    # With conda activated:
    conda run -n linhdz python scripts/codegen.py

    # Or from any shell (reads .env automatically):
    python scripts/codegen.py
"""

import subprocess
import sys
import os
from pathlib import Path

ROOT = Path(__file__).parent.parent
OPENAPI_SPEC = ROOT / "openapi.json"
OUTPUT = ROOT / "frontend" / "src" / "types" / "generated" / "api.ts"

# Backend env defaults — can override via environment variables
_backend_env = {
    "MONGODB_URI": "mongodb+srv://nhatquangpx:8sotamnhe@gymmanagement.8jghrjf.mongodb.net/?retryWrites=true&w=majority",
    "JWT_SECRET": "shin-superin-dev-secret",
    "OPENAI_API_KEY": "fw_HToZECoeccNqkpq69XUi1a",
    "OPENAI_BASE_URL": "https://api.fireworks.ai/inference/v1",
}


def _run_python(cmd: str) -> subprocess.CompletedProcess:
    """Run Python snippet via conda env if available, else direct."""
    env = {**os.environ, **{k: v for k, v in _backend_env.items() if v}}

    # Try conda first
    result = subprocess.run(
        ["conda", "run", "-n", "linhdz", "python3", "-c", cmd],
        cwd=str(ROOT),
        capture_output=True,
        text=True,
        env=env,
    )
    return result


def generate_openapi_spec():
    """Build openapi.json by importing the FastAPI app."""
    script = """
import sys; sys.path.insert(0, 'backend')
from core.main import app
import json
spec = app.openapi()
with open('openapi.json', 'w') as f:
    json.dump(spec, f, indent=2)
print('paths:', len(spec.get('paths', {})), 'schemas:', len(spec.get('components', {}).get('schemas', {})))
"""

    result = _run_python(script)
    if result.returncode != 0:
        print("[codegen] ERROR generating OpenAPI spec:")
        print(result.stderr[-2000:])
        sys.exit(1)
    print("[codegen] ✓ " + result.stdout.strip())


def run_typescript_codegen():
    """Run openapi-typescript to generate TypeScript interfaces."""
    result = subprocess.run(
        ["openapi-typescript", str(OPENAPI_SPEC), "-o", str(OUTPUT)],
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        print("[codegen] ERROR running openapi-typescript:")
        print(result.stderr[-2000:])
        sys.exit(1)
    print("[codegen] ✓ Types generated →", OUTPUT)


def main():
    print("[codegen] Step 1: Generating OpenAPI spec from FastAPI app...")
    generate_openapi_spec()

    print("[codegen] Step 2: Generating TypeScript types from OpenAPI spec...")
    run_typescript_codegen()
    print("[codegen] ✓ Done — import from '@/types/generated/api'")


if __name__ == "__main__":
    main()
