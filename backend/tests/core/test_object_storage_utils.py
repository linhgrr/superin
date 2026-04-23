import pytest
from fastapi import HTTPException

import core.utils.object_storage as object_storage


def test_get_upload_endpoint_prefers_external_on_hf_space(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(object_storage.settings, "hf_space", True)
    monkeypatch.setattr(
        object_storage.settings,
        "object_storage_endpoint_external",
        "objectstorageapi.ap-southeast-1.clawcloudrun.com",
    )
    monkeypatch.setattr(
        object_storage.settings,
        "object_storage_endpoint_internal",
        "object-storage.objectstorage-system.svc.cluster.local",
    )
    monkeypatch.setattr(object_storage, "_is_endpoint_resolvable", lambda endpoint: "clawcloudrun" in endpoint)

    endpoint = object_storage.get_upload_endpoint()

    assert endpoint == "https://objectstorageapi.ap-southeast-1.clawcloudrun.com"


def test_get_upload_endpoint_falls_back_when_preferred_is_not_resolvable(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(object_storage.settings, "hf_space", False)
    monkeypatch.setattr(object_storage, "is_running_in_kubernetes", lambda: True)
    monkeypatch.setattr(
        object_storage.settings,
        "object_storage_endpoint_internal",
        "object-storage.objectstorage-system.svc.cluster.local",
    )
    monkeypatch.setattr(
        object_storage.settings,
        "object_storage_endpoint_external",
        "objectstorageapi.ap-southeast-1.clawcloudrun.com",
    )

    def _fake_resolver(endpoint: str) -> bool:
        return "clawcloudrun" in endpoint

    monkeypatch.setattr(object_storage, "_is_endpoint_resolvable", _fake_resolver)

    endpoint = object_storage.get_upload_endpoint()

    assert endpoint == "https://objectstorageapi.ap-southeast-1.clawcloudrun.com"


def test_get_upload_endpoint_requires_config(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(object_storage.settings, "hf_space", False)
    monkeypatch.setattr(object_storage, "is_running_in_kubernetes", lambda: False)
    monkeypatch.setattr(object_storage.settings, "object_storage_endpoint_internal", None)
    monkeypatch.setattr(object_storage.settings, "object_storage_endpoint_external", None)

    try:
        object_storage.get_upload_endpoint()
        raise AssertionError("Expected HTTPException")
    except HTTPException as exc:
        assert exc.status_code == 503
        assert exc.detail == "Object storage endpoint is not configured."
