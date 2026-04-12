from types import SimpleNamespace

import pytest

from apps.calendar.repository import calendar_transaction
from apps.finance.repository import finance_transaction


class FakeSession:
    def __init__(self) -> None:
        self.transaction_started = False
        self.transaction_entered = False
        self.transaction_exited = False

    def start_transaction(self):
        self.transaction_started = True
        outer = self

        class TransactionWrapper:
            async def __aenter__(self):
                outer.transaction_entered = True
                return outer
            async def __aexit__(self, exc_type, exc_val, exc_tb):
                outer.transaction_exited = True

        return TransactionWrapper()


class FakeClient:
    def __init__(self, session: FakeSession) -> None:
        self._session = session
        self.session_entered = False
        self.session_exited = False

    async def start_session(self):
        outer = self

        class SessionWrapper:
            async def __aenter__(self):
                outer.session_entered = True
                return outer._session
            async def __aexit__(self, exc_type, exc_val, exc_tb):
                outer.session_exited = True

        return SessionWrapper()


@pytest.mark.parametrize(
    ("target", "transaction_helper"),
    [
        ("apps.finance.repository.get_db", finance_transaction),
        ("apps.calendar.repository.get_db", calendar_transaction),
    ],
)
async def test_transaction_helpers_await_start_transaction(
    monkeypatch: pytest.MonkeyPatch,
    target: str,
    transaction_helper,
) -> None:
    session = FakeSession()
    client = FakeClient(session)
    monkeypatch.setattr(target, lambda: SimpleNamespace(client=client))

    async with transaction_helper() as yielded_session:
        assert yielded_session is session
        assert session.transaction_started is True
        assert session.transaction_entered is True

    assert session.transaction_exited is True
    assert client.session_entered is True
    assert client.session_exited is True
