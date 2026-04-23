import os
from pathlib import Path

import pytest

from core import config as config_module


def test_prime_process_env_loads_langsmith_keys(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    backend_dir = tmp_path / "backend"
    backend_dir.mkdir()

    (backend_dir / ".env").write_text("LANGSMITH_PROJECT=from-dot-env\nSHARED_KEY=from-dot-env\n")
    (backend_dir / ".env.local").write_text(
        "LANGSMITH_API_KEY=test-langsmith-key\nSHARED_KEY=from-dot-env-local\n"
    )

    monkeypatch.delenv("LANGSMITH_API_KEY", raising=False)
    monkeypatch.delenv("LANGSMITH_PROJECT", raising=False)
    monkeypatch.setenv("SHARED_KEY", "from-shell")
    monkeypatch.setattr(config_module, "_BACKEND_DIR", backend_dir)

    config_module._prime_process_env()

    assert os.environ["LANGSMITH_API_KEY"] == "test-langsmith-key"
    assert os.environ["LANGSMITH_PROJECT"] == "from-dot-env"
    assert os.environ["SHARED_KEY"] == "from-shell"
