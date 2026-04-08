from types import SimpleNamespace

import shared.llm as llm_module


def test_get_llm_disables_stream_usage_and_preserves_ngrok_headers(monkeypatch) -> None:
    captured: dict[str, object] = {}

    class FakeChatOpenAI:
        def __init__(self, **kwargs) -> None:
            captured.update(kwargs)

    fake_settings = SimpleNamespace(
        openai_api_key="test-key",
        openai_base_url="https://demo.ngrok-free.dev/v1",
        openai_model="demo-model",
        llm_request_timeout_seconds=12.5,
    )

    monkeypatch.setattr(llm_module, "_llm", None)
    monkeypatch.setattr(llm_module, "_patch_langchain_openai_usage_metadata", lambda: None)
    monkeypatch.setitem(
        __import__("sys").modules,
        "langchain_openai",
        SimpleNamespace(ChatOpenAI=FakeChatOpenAI),
    )
    monkeypatch.setattr("core.config.settings", fake_settings)

    llm = llm_module.get_llm()

    assert isinstance(llm, FakeChatOpenAI)
    assert captured["stream_usage"] is False
    assert captured["api_key"] == "test-key"
    assert captured["base_url"] == "https://demo.ngrok-free.dev/v1"
    assert captured["model"] == "demo-model"
    assert captured["timeout"] == 12.5
    assert captured["max_retries"] == 1
    assert captured["model_kwargs"] == {
        "extra_headers": {
            "ngrok-skip-browser-warning": "1",
        }
    }


def test_patch_langchain_usage_metadata_handles_null_completion_tokens(monkeypatch) -> None:
    captured: dict[str, object] = {}

    def original_create_usage_metadata(usage: dict[str, object], _service_tier=None) -> dict[str, object]:
        captured["usage"] = usage
        return {"usage": usage}

    fake_module = SimpleNamespace(_create_usage_metadata=original_create_usage_metadata)

    def fake_import_module(name: str):
        assert name == "langchain_openai.chat_models.base"
        return fake_module

    monkeypatch.setattr(llm_module.importlib, "import_module", fake_import_module)

    llm_module._patch_langchain_openai_usage_metadata()
    result = fake_module._create_usage_metadata({"prompt_tokens": 7, "completion_tokens": None})

    assert captured["usage"] == {
        "prompt_tokens": 7,
        "completion_tokens": 0,
        "total_tokens": 7,
    }
    assert result == {
        "usage": {
            "prompt_tokens": 7,
            "completion_tokens": 0,
            "total_tokens": 7,
        }
    }


def test_patch_langchain_usage_metadata_supports_single_argument_signature(monkeypatch) -> None:
    captured: dict[str, object] = {}

    def original_create_usage_metadata(usage: dict[str, object]) -> dict[str, object]:
        captured["usage"] = usage
        return {"usage": usage}

    fake_module = SimpleNamespace(_create_usage_metadata=original_create_usage_metadata)

    def fake_import_module(name: str):
        assert name == "langchain_openai.chat_models.base"
        return fake_module

    monkeypatch.setattr(llm_module.importlib, "import_module", fake_import_module)

    llm_module._patch_langchain_openai_usage_metadata()
    result = fake_module._create_usage_metadata({"prompt_tokens": 2, "completion_tokens": None})

    assert captured["usage"] == {
        "prompt_tokens": 2,
        "completion_tokens": 0,
        "total_tokens": 2,
    }
    assert result == {
        "usage": {
            "prompt_tokens": 2,
            "completion_tokens": 0,
            "total_tokens": 2,
        }
    }
