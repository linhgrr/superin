"""
RootAgent — top-level parallel orchestrator using LangGraph v2 @entrypoint.

Plugin discovery is fully automatic:
  - PLUGIN_REGISTRY is scanned at startup
  - @task workers are registered for every plugin agent
  - The root @entrypoint fans out to parallel @task workers

Architecture:
    @entrypoint root_agent
        ├── decide_target_apps(messages, installed_apps)  → list[app_id]
        └── for app_id in target_apps:
                future = task_fn(question=...) → submit to LangGraph executor
            for app_id, future in futures:
                result = await future  → collect results (parallel execution)
                ↓
            Results collected → merged → synthesized → returned

Streaming:
  - Partial app results streamed via writer({type: "app_result", ...})
  - Final answer tokens streamed via writer({type: "token", ...})
  - Done signal via writer({type: "done", ...})

Memory:
  - Short-term: conversation history loaded from MongoDB per-request
  - Long-term: store (MongoDBStore via get_store()) → user memories across sessions
"""

from .agent import RootAgent, root_agent
from .graph import get_root_agent_graph, refresh_graph
from .memory import delete_memory, recall_memories, recall_memories_for_context, save_memory

__all__ = [
    "RootAgent",
    "root_agent",
    "get_root_agent_graph",
    "refresh_graph",
    # Memory helpers
    "save_memory",
    "recall_memories",
    "recall_memories_for_context",
    "delete_memory",
]

