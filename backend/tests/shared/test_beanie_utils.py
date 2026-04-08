from shared.beanie_utils import aggregate_to_list


class _FakeCursor:
    def __init__(self, rows):
        self._rows = rows

    async def to_list(self):
        return self._rows


class _FakeDocAwaitableAggregate:
    @staticmethod
    async def aggregate(_pipeline):
        return _FakeCursor([{"k": "v"}])


class _FakeDocDirectAggregate:
    @staticmethod
    def aggregate(_pipeline):
        return _FakeCursor([{"n": 1}])


async def test_aggregate_to_list_supports_awaitable_aggregate() -> None:
    result = await aggregate_to_list(_FakeDocAwaitableAggregate, [{"$match": {"ok": True}}])
    assert result == [{"k": "v"}]


async def test_aggregate_to_list_supports_direct_aggregate_cursor() -> None:
    result = await aggregate_to_list(_FakeDocDirectAggregate, [{"$match": {"ok": True}}])
    assert result == [{"n": 1}]
