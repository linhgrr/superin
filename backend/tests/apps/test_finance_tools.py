from datetime import UTC, date, datetime
from types import SimpleNamespace
from typing import Any, cast

import pytest

from apps.finance import tools as finance_tools
from core.models import User
from tests.tool_runtime import build_app_tool_runtime


@pytest.mark.asyncio
async def test_finance_add_transaction_uses_user_timezone(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    user = SimpleNamespace(settings={"timezone": "Asia/Ho_Chi_Minh"})

    async def fake_get(_user_id: str) -> User:
        return cast(User, user)

    observed: dict[str, Any] = {}

    async def fake_add_transaction(
        user_id: str,
        wallet_id: str,
        category_id: str,
        type_: str,
        amount: float,
        occurred_at: datetime,
        note: str | None = None,
    ) -> dict[str, str]:
        observed["occurred_at"] = occurred_at
        return {"id": "tx-1"}

    monkeypatch.setattr(User, "get", fake_get)
    monkeypatch.setattr(finance_tools.finance_service, "add_transaction", fake_add_transaction)

    result = await finance_tools.finance_add_transaction.ainvoke(
        {
            "wallet_id": "wallet-1",
            "category_id": "category-1",
            "type_": "expense",
            "amount": 12.5,
            "occurred_at": "2026-04-20T09:15:00",
            "runtime": build_app_tool_runtime("507f1f77bcf86cd799439011"),
        },
    )

    assert result == {"id": "tx-1"}
    assert observed["occurred_at"] == datetime(2026, 4, 20, 2, 15, tzinfo=UTC)


@pytest.mark.asyncio
async def test_finance_search_transactions_passes_local_date_semantics(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    user = SimpleNamespace(settings={"timezone": "Asia/Ho_Chi_Minh"})

    async def fake_get(_user_id: str) -> User:
        return cast(User, user)

    observed: dict[str, Any] = {}

    async def fake_search_transactions(
        user_id: str,
        query: str | None = None,
        start_date: date | None = None,
        end_date: date | None = None,
        limit: int = 20,
    ) -> list[dict[str, object]]:
        observed["start_date"] = start_date
        observed["end_date"] = end_date
        return []

    monkeypatch.setattr(User, "get", fake_get)
    monkeypatch.setattr(finance_tools.finance_service, "search_transactions", fake_search_transactions)

    result = await finance_tools.finance_search_transactions.ainvoke(
        {
            "start_date": "2026-04-01",
            "end_date": "2026-04-30",
            "runtime": build_app_tool_runtime("507f1f77bcf86cd799439011"),
        },
    )

    assert result == []
    assert observed["start_date"] == date(2026, 4, 1)
    assert observed["end_date"] == date(2026, 4, 30)
