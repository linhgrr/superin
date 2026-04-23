from __future__ import annotations

from types import SimpleNamespace
from typing import Any

import pytest

from core.catalog import service as catalog_service
from shared.enums import INSTALL_STATUS_ALREADY_INSTALLED


class FakeInstallCollection:
    def __init__(self, previous: dict[str, str] | None) -> None:
        self.previous = previous
        self.calls: list[dict[str, object]] = []

    async def find_one_and_update(
        self,
        *args: object,
        **kwargs: object,
    ) -> dict[str, str] | None:
        self.calls.append({"args": args, "kwargs": kwargs})
        return self.previous


class FakeDatabase:
    def __init__(self, previous: dict[str, str] | None) -> None:
        self.collection = FakeInstallCollection(previous)
        self.client = FakeMongoClient()

    def __getitem__(self, name: str) -> FakeInstallCollection:
        assert name == "user_app_installations"
        return self.collection


class FakeQuery:
    def __init__(self, items: list[Any]) -> None:
        self.items = items

    async def to_list(self) -> list[Any]:
        return self.items


class FakeField:
    def __init__(self, name: str) -> None:
        self.name = name

    def __eq__(self, other: object) -> bool:
        return self.name == str(other)


class FakeWidgetPreference:
    user_id = FakeField("user_id")
    widget_id = FakeField("widget_id")
    inserted: list[Any] | None = None
    existing: list[Any] = []

    def __init__(self, **kwargs: object) -> None:
        self.__dict__.update(kwargs)

    @staticmethod
    def find(*_args: object, **_kwargs: object) -> FakeQuery:
        return FakeQuery(FakeWidgetPreference.existing)

    @staticmethod
    async def insert_many(documents: list[Any], session: object | None = None) -> None:
        FakeWidgetPreference.inserted = documents


class FakeWidgetDataConfig:
    user_id = FakeField("user_id")

    def __init__(self, **kwargs: object) -> None:
        self.__dict__.update(kwargs)

    @staticmethod
    def find(*_args: object, **_kwargs: object) -> FakeQuery:
        return FakeQuery([])

    @staticmethod
    async def insert_many(documents: list[Any], session: object | None = None) -> None:
        return None


class FakeInstallationField:
    def __init__(self, name: str) -> None:
        self.name = name

    def __eq__(self, other: object) -> bool:
        return self.name == str(other)


class FakeInstallation:
    user_id = FakeInstallationField("user_id")
    app_id = FakeInstallationField("app_id")
    status = FakeInstallationField("status")

    def __init__(self, status: str = "active") -> None:
        self.__dict__["status"] = status
        self.saved = False

    async def save(self, session: object | None = None) -> None:
        self.saved = True


class FakeUserAppInstallation:
    user_id = FakeInstallationField("user_id")
    app_id = FakeInstallationField("app_id")
    status = FakeInstallationField("status")
    installation: FakeInstallation | None = None

    @staticmethod
    async def find_one(*_args: object, **_kwargs: object) -> FakeInstallation | None:
        return FakeUserAppInstallation.installation


class FakeSession:
    async def __aenter__(self) -> FakeSession:
        return self

    async def __aexit__(
        self,
        exc_type: type[BaseException] | None,
        exc: BaseException | None,
        tb: object | None,
    ) -> bool:
        return False

    def start_transaction(self) -> FakeSession:
        return self


class FakeMongoClient:
    async def start_session(self) -> FakeSession:
        return FakeSession()


async def test_install_app_for_user_installs_and_seeds_widgets(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    install_calls: list[str] = []
    plugin = {
        "manifest": SimpleNamespace(
            name="Finance",
            widgets=[
                SimpleNamespace(id="finance.total-balance"),
                SimpleNamespace(id="finance.recent-transactions"),
            ],
        ),
        "agent": SimpleNamespace(
            on_install=lambda user_id: install_calls.append(user_id),
        ),
    }

    async def fake_on_install(user_id: str) -> None:
        install_calls.append(user_id)

    plugin["agent"] = SimpleNamespace(on_install=fake_on_install)
    FakeWidgetPreference.existing = [SimpleNamespace(widget_id="finance.total-balance")]
    FakeWidgetPreference.inserted = None

    monkeypatch.setattr(catalog_service, "get_plugin", lambda app_id: plugin if app_id == "finance" else None)
    monkeypatch.setattr(catalog_service, "get_db", lambda: FakeDatabase(previous=None))
    monkeypatch.setattr(catalog_service, "WidgetPreference", FakeWidgetPreference)
    monkeypatch.setattr(catalog_service, "WidgetDataConfig", FakeWidgetDataConfig)
    monkeypatch.setattr(catalog_service, "In", lambda field, values: ("in", field, values))

    result = await catalog_service.install_app_for_user(
        "64f000000000000000000001",
        "finance",
    )

    assert result == {
        "status": "installed",
        "app_id": "finance",
        "app_name": "Finance",
    }
    assert install_calls == ["64f000000000000000000001"]
    assert FakeWidgetPreference.inserted is not None
    assert [doc.widget_id for doc in FakeWidgetPreference.inserted] == [
        "finance.recent-transactions"
    ]


async def test_install_app_for_user_returns_already_installed_without_hooks(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    plugin = {
        "manifest": SimpleNamespace(name="Finance", widgets=[]),
        "agent": SimpleNamespace(on_install=None),
    }
    db = FakeDatabase(previous={"status": "active"})

    monkeypatch.setattr(catalog_service, "get_plugin", lambda app_id: plugin if app_id == "finance" else None)
    monkeypatch.setattr(catalog_service, "get_db", lambda: db)
    monkeypatch.setattr(catalog_service, "WidgetDataConfig", FakeWidgetDataConfig)

    result = await catalog_service.install_app_for_user(
        "64f000000000000000000001",
        "finance",
    )

    assert result == {
        "status": INSTALL_STATUS_ALREADY_INSTALLED,
        "app_id": "finance",
        "app_name": "Finance",
    }
    assert len(db.collection.calls) == 1


async def test_install_app_for_user_rejects_unknown_app(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(catalog_service, "get_plugin", lambda _app_id: None)

    with pytest.raises(catalog_service.UnknownAppError) as exc_info:
        await catalog_service.install_app_for_user(
            "64f000000000000000000001",
            "missing",
        )

    assert exc_info.value.app_id == "missing"


async def test_install_app_for_user_uses_effective_tier_for_paid_gate(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    plugin = {
        "manifest": SimpleNamespace(
            name="Finance",
            widgets=[],
            requires_tier=catalog_service.SubscriptionTier.PAID,
        ),
        "agent": SimpleNamespace(on_install=None),
    }

    async def fake_get_effective_tier(_user_id: str) -> str:
        return catalog_service.SubscriptionTier.FREE

    monkeypatch.setattr(catalog_service, "get_plugin", lambda app_id: plugin if app_id == "finance" else None)
    monkeypatch.setattr(catalog_service, "get_effective_tier", fake_get_effective_tier)

    with pytest.raises(catalog_service.InsufficientTierError) as exc_info:
        await catalog_service.install_app_for_user(
            "64f000000000000000000001",
            "finance",
        )

    assert exc_info.value.app_id == "finance"
    assert exc_info.value.required_tier == catalog_service.SubscriptionTier.PAID


async def test_uninstall_app_for_user_disables_installation(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    uninstall_calls: list[str] = []
    installation = FakeInstallation(status="active")
    plugin = {
        "manifest": SimpleNamespace(name="Finance"),
        "agent": SimpleNamespace(),
    }

    async def fake_on_uninstall(user_id: str) -> None:
        uninstall_calls.append(user_id)

    plugin["agent"].on_uninstall = fake_on_uninstall
    monkeypatch.setattr(catalog_service, "get_plugin", lambda app_id: plugin if app_id == "finance" else None)
    monkeypatch.setattr(catalog_service, "get_db", lambda: FakeDatabase(previous=None))
    FakeUserAppInstallation.installation = installation
    monkeypatch.setattr(catalog_service, "UserAppInstallation", FakeUserAppInstallation)

    result = await catalog_service.uninstall_app_for_user(
        "64f000000000000000000001",
        "finance",
    )

    assert result == {
        "status": "uninstalled",
        "app_id": "finance",
        "app_name": "Finance",
    }
    assert uninstall_calls == ["64f000000000000000000001"]
    assert installation.status == "disabled"
    assert installation.saved is True


async def test_uninstall_app_for_user_returns_already_uninstalled(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    plugin = {
        "manifest": SimpleNamespace(name="Finance"),
        "agent": SimpleNamespace(),
    }

    monkeypatch.setattr(catalog_service, "get_plugin", lambda app_id: plugin if app_id == "finance" else None)
    monkeypatch.setattr(catalog_service, "get_db", lambda: FakeDatabase(previous=None))
    FakeUserAppInstallation.installation = None
    monkeypatch.setattr(catalog_service, "UserAppInstallation", FakeUserAppInstallation)

    result = await catalog_service.uninstall_app_for_user(
        "64f000000000000000000001",
        "finance",
    )

    assert result == {
        "status": "already_uninstalled",
        "app_id": "finance",
        "app_name": "Finance",
    }
