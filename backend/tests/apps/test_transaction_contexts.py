from contextlib import asynccontextmanager
from types import SimpleNamespace

import pytest

from apps.calendar.repository import calendar_transaction
from apps.finance.repository import finance_transaction


class FakeSession:
    def __init__(self) -> None:
        self.transaction_started = False
        self.transaction_entered = False
        self.transaction_exited = False

    async def start_transaction(self):
        self.transaction_started = True

        @asynccontextmanager
        async def transaction_cm():
            self.transaction_entered = True
            try:
                yield self
            finally:
                self.transaction_exited = True

        return transaction_cm()


class FakeClient:
    def __init__(self, session: FakeSession) -> None:
        self._session = session
        self.session_entered = False
        self.session_exited = False

    def start_session(self):
        @asynccontextmanager
        async def session_cm():
            self.session_entered = True
            try:
                yield self._session
            finally:
                self.session_exited = True

        return session_cm()


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
