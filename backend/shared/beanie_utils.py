"""Compatibility helpers for Beanie/Motor query behavior across versions."""

import inspect
from typing import Any


async def aggregate_to_list(document_cls: Any, pipeline: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """
    Run an aggregation pipeline and always return a materialized list.

    Beanie/Motor versions differ on whether `Document.aggregate(...)` returns
    an aggregation cursor directly or a coroutine that resolves to one.
    """
    aggregate_result = document_cls.aggregate(pipeline)
    if inspect.isawaitable(aggregate_result):
        aggregate_result = await aggregate_result

    results = aggregate_result.to_list()
    if inspect.isawaitable(results):
        results = await results
    return results
