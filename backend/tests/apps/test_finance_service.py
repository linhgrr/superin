from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from datetime import UTC, date, datetime
from types import SimpleNamespace
from typing import cast

import pytest
from pymongo.errors import DuplicateKeyError

from apps.finance.service import FinanceService


@asynccontextmanager
async def fake_finance_transaction() -> AsyncIterator[str]:
    yield "session"


async def test_list_transactions_passes_skip_and_limit_as_keywords(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    service = FinanceService()
    captured: dict[str, object] = {}

    async def fake_find_by_user(*args: object, **kwargs: object) -> list[object]:
        captured["args"] = args
        captured["kwargs"] = kwargs
        return []

    monkeypatch.setattr(service.transactions, "find_by_user", fake_find_by_user)

    result = await service.list_transactions("user-1", skip=5, limit=10)

    assert result == []
    assert captured["args"] == ("user-1", None, None, None)
    assert captured["kwargs"] == {"skip": 5, "limit": 10}


async def test_create_wallet_maps_duplicate_key_to_value_error(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    service = FinanceService()

    async def fake_create(*_args: object, **_kwargs: object) -> object:
        raise DuplicateKeyError("duplicate wallet")

    monkeypatch.setattr(service.wallets, "create", fake_create)

    with pytest.raises(ValueError, match="Wallet 'Main' already exists"):
        await service.create_wallet("user-1", "Main")


async def test_add_transaction_rejects_missing_category_before_writing(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    service = FinanceService()
    wallet = SimpleNamespace(id="wallet-1", balance=100)
    create_called = False

    monkeypatch.setattr("apps.finance.service.finance_transaction", fake_finance_transaction)

    async def fake_wallet_find(
        wallet_id: str,
        user_id: str,
        *,
        session: object | None = None,
    ) -> object:
        assert wallet_id == "wallet-1"
        assert user_id == "user-1"
        assert session == "session"
        return wallet

    async def fake_category_find(
        category_id: str,
        user_id: str,
        *,
        session: object | None = None,
    ) -> None:
        assert category_id == "missing-cat"
        assert user_id == "user-1"
        assert session == "session"
        return None

    async def fake_create(*_args: object, **_kwargs: object) -> object:
        nonlocal create_called
        create_called = True
        raise AssertionError("transaction create should not be reached")

    monkeypatch.setattr(service.wallets, "find_by_id", fake_wallet_find)
    monkeypatch.setattr(service.categories, "find_by_id", fake_category_find)
    monkeypatch.setattr(service.transactions, "create", fake_create)

    with pytest.raises(ValueError, match="Category not found"):
        await service.add_transaction(
            "user-1",
            "wallet-1",
            "missing-cat",
            "expense",
            25,
            datetime.now(UTC),
        )

    assert create_called is False


async def test_add_transaction_uses_atomic_balance_guard_for_expense(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    service = FinanceService()
    wallet = SimpleNamespace(id="wallet-1", balance=100)
    category = SimpleNamespace(id="category-1")
    created_at = datetime.now(UTC)
    tx = SimpleNamespace(
        id="tx-1",
        wallet_id="wallet-1",
        category_id="category-1",
        type="expense",
        amount=25,
        occurred_at=created_at,
        note=None,
        created_at=created_at,
    )
    captured: dict[str, object] = {}

    monkeypatch.setattr("apps.finance.service.finance_transaction", fake_finance_transaction)

    async def fake_wallet_find(*_args: object, **_kwargs: object) -> SimpleNamespace:
        return wallet

    async def fake_category_find(*_args: object, **_kwargs: object) -> SimpleNamespace:
        return category

    async def fake_apply_balance_delta(
        wallet_id: str,
        user_id: str,
        delta: float,
        *,
        min_balance: float | None = None,
        session: object | None = None,
    ) -> SimpleNamespace:
        captured["wallet_id"] = wallet_id
        captured["user_id"] = user_id
        captured["delta"] = delta
        captured["min_balance"] = min_balance
        captured["session"] = session
        return wallet

    async def fake_create(*_args: object, **_kwargs: object) -> SimpleNamespace:
        return tx

    monkeypatch.setattr(service.wallets, "find_by_id", fake_wallet_find)
    monkeypatch.setattr(service.categories, "find_by_id", fake_category_find)
    monkeypatch.setattr(service.wallets, "apply_balance_delta", fake_apply_balance_delta)
    monkeypatch.setattr(service.transactions, "create", fake_create)

    result = await service.add_transaction(
        "user-1",
        "wallet-1",
        "category-1",
        "expense",
        25,
        created_at,
    )

    assert result.id == "tx-1"
    assert captured == {
        "wallet_id": "wallet-1",
        "user_id": "user-1",
        "delta": -25,
        "min_balance": 25,
        "session": "session",
    }


async def test_search_transactions_converts_local_dates_to_utc_range(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    service = FinanceService()
    user = SimpleNamespace(settings={"timezone": "Asia/Ho_Chi_Minh"})
    captured: dict[str, object] = {}

    async def fake_get(_user_id: str) -> object:
        return cast(object, user)

    async def fake_find_by_user(*args: object, **kwargs: object) -> list[object]:
        captured["args"] = args
        captured["kwargs"] = kwargs
        return []

    monkeypatch.setattr("apps.finance.service.User.get", fake_get)
    monkeypatch.setattr(service.transactions, "find_by_user", fake_find_by_user)

    result = await service.search_transactions(
        "user-1",
        start_date=date(2026, 4, 1),
        end_date=date(2026, 4, 30),
        limit=12,
    )

    assert result == []
    assert captured["args"] == ("user-1",)
    assert captured["kwargs"] == {
        "start_date": datetime(2026, 3, 31, 17, 0, tzinfo=UTC),
        "end_date": datetime(2026, 4, 30, 16, 59, 59, 999999, tzinfo=UTC),
        "skip": 0,
        "limit": 10000,
    }
