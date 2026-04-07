from types import SimpleNamespace

import pytest

import core.catalog_service as catalog_service
from shared.enums import INSTALL_STATUS_ALREADY_INSTALLED


class FakeInstallCollection:
    def __init__(self, previous: dict | None) -> None:
        self.previous = previous
        self.calls: list[dict] = []

    async def find_one_and_update(self, *args, **kwargs):
        self.calls.append({"args": args, "kwargs": kwargs})
        return self.previous


class FakeDatabase:
    def __init__(self, previous: dict | None) -> None:
        self.collection = FakeInstallCollection(previous)

    def __getitem__(self, name: str) -> FakeInstallCollection:
        assert name == "user_app_installations"
        return self.collection


class FakeQuery:
    def __init__(self, items) -> None:
        self.items = items

    async def to_list(self):
        return self.items


class FakeField:
    def __init__(self, name: str) -> None:
        self.name = name

    def __eq__(self, other):
        return (self.name, other)


class FakeWidgetPreference:
    user_id = FakeField("user_id")
    widget_id = FakeField("widget_id")
    inserted = None
    existing = []

    def __init__(self, **kwargs) -> None:
        self.__dict__.update(kwargs)

    @staticmethod
    def find(*_args, **_kwargs):
        return FakeQuery(FakeWidgetPreference.existing)

    @staticmethod
    async def insert_many(documents):
        FakeWidgetPreference.inserted = documents


class FakeInstallationField:
    def __init__(self, name: str) -> None:
        self.name = name

    def __eq__(self, other):
        return (self.name, other)


class FakeInstallation:
    user_id = FakeInstallationField("user_id")
    app_id = FakeInstallationField("app_id")
    status = FakeInstallationField("status")

    def __init__(self, status: str = "active") -> None:
        self.status = status
        self.saved = False

    async def save(self) -> None:
        self.saved = True


class FakeUserAppInstallation:
    user_id = FakeInstallationField("user_id")
    app_id = FakeInstallationField("app_id")
    status = FakeInstallationField("status")
    installation = None

    @staticmethod
    async def find_one(*_args):
        return FakeUserAppInstallation.installation


async def test_install_app_for_user_installs_and_seeds_widgets(monkeypatch) -> None:
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


async def test_install_app_for_user_returns_already_installed_without_hooks(monkeypatch) -> None:
    plugin = {
        "manifest": SimpleNamespace(name="Finance", widgets=[]),
        "agent": SimpleNamespace(on_install=None),
    }
    db = FakeDatabase(previous={"status": "active"})

    monkeypatch.setattr(catalog_service, "get_plugin", lambda app_id: plugin if app_id == "finance" else None)
    monkeypatch.setattr(catalog_service, "get_db", lambda: db)

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


async def test_install_app_for_user_rejects_unknown_app(monkeypatch) -> None:
    monkeypatch.setattr(catalog_service, "get_plugin", lambda _app_id: None)

    with pytest.raises(catalog_service.UnknownAppError) as exc_info:
        await catalog_service.install_app_for_user(
            "64f000000000000000000001",
            "missing",
        )

    assert exc_info.value.app_id == "missing"


async def test_uninstall_app_for_user_disables_installation(monkeypatch) -> None:
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


async def test_uninstall_app_for_user_returns_already_uninstalled(monkeypatch) -> None:
    plugin = {
        "manifest": SimpleNamespace(name="Finance"),
        "agent": SimpleNamespace(),
    }

    monkeypatch.setattr(catalog_service, "get_plugin", lambda app_id: plugin if app_id == "finance" else None)
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
