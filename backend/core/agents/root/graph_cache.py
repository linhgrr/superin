"""LRU-bounded cache for compiled LangGraph instances."""

from __future__ import annotations

from collections import OrderedDict
from typing import TYPE_CHECKING, Any

from loguru import logger

from core.db import get_store
from shared.llm import get_llm

if TYPE_CHECKING:
    from langchain_core.tools import BaseTool

# Cap on the number of compiled LangGraph instances retained.
# Uses LRU eviction — least recently used graph is dropped when the cap is hit.
MAX_CACHED_GRAPHS = 32


class GraphCache:
    """
    LRU cache for compiled LangGraph graphs, keyed by a (system_prompt_hash, sorted_tool_names) tuple.

    Reduces LLM cold-start cost by reusing compiled graphs across requests that share
    the same tool set and system prompt.
    """

    def __init__(self) -> None:
        # Maps (system_prompt_hash, tool_names_tuple) → compiled graph
        self._graphs: OrderedDict[tuple[str, ...], Any] = OrderedDict()

    def get_or_create(self, system_prompt: str, tools: list[BaseTool]) -> Any:
        """
        Return a cached graph, or compile and cache a new one.

        Uses SHA-256 of the system prompt as part of the cache key.
        Evicts the least-recently-used entry when MAX_CACHED_GRAPHS is exceeded.
        """
        import hashlib

        sys_hash = hashlib.sha256(system_prompt.encode()).hexdigest()
        cache_key = (sys_hash, tuple(sorted(t.name for t in tools)))

        if cache_key in self._graphs:
            # Move to end (most-recently-used)
            self._graphs.move_to_end(cache_key)
            logger.debug("GraphCache  cache=HIT  tools_count={}", len(tools))
            return self._graphs[cache_key]

        logger.debug(
            "GraphCache  cache=MISS  tools_count={}  graphs_in_cache={}",
            len(tools),
            len(self._graphs),
        )

        graph = _compile_graph(system_prompt, tools)
        self._graphs[cache_key] = graph

        # Evict oldest (least-recently-used) entry if over limit
        if len(self._graphs) > MAX_CACHED_GRAPHS:
            self._graphs.popitem(last=False)

        return graph

    def invalidate(self) -> None:
        """Clear all cached graphs. Call after plugin discovery / refresh."""
        self._graphs.clear()


def _compile_graph(system_prompt: str, tools: list[BaseTool]) -> Any:
    """Compile a LangGraph ReAct agent with the given tools and system prompt."""
    from langgraph.prebuilt import create_react_agent

    return create_react_agent(
        model=get_llm(),
        tools=tools,
        prompt=system_prompt or None,
        store=get_store(),
    )
