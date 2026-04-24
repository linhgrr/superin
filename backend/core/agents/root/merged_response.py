"""Helpers for synthesis when worker outputs are available."""

from __future__ import annotations

from .prompts import build_root_merged_synthesis_prompt
from .response_context import build_conversation_history_block
from .schemas import WorkerOutcome


def merge_app_results(results: list[WorkerOutcome]) -> str:
    """Format worker results into a merged context string for the synthesizer."""
    if not results:
        return ""

    parts = []
    for result in results:
        app_name = result["app"]
        status = result["status"]
        subtask = result["subtask"]
        message = result["message"]
        tool_results = result["tool_results"]
        error = result.get("error")
        failure_kind = result.get("failure_kind")
        retryable = result.get("retryable")
        answer_state = result.get("answer_state")
        evidence_summary = result.get("evidence_summary")
        capability_limit = result.get("capability_limit")
        stop_reason = result.get("stop_reason")
        contained_mutation = result.get("contained_mutation")

        section = f"[{app_name}] (task: {subtask[:80]})\n[status: {status}]\n{message}"
        if answer_state:
            section += f"\n[answer_state] {answer_state}"
        if evidence_summary:
            section += f"\n[evidence] {evidence_summary}"
        if stop_reason:
            section += f"\n[stop_reason] {stop_reason}"
        if capability_limit:
            section += f"\n[capability_limit] {capability_limit}"
        if contained_mutation:
            section += "\n[contains_mutation] yes"
        if status == "failed" and error and str(error) not in message:
            section += f"\n[failure_reason] {error}"
        if failure_kind:
            section += f"\n[failure_kind] {failure_kind}"
        if status == "failed" and retryable is not None:
            section += f"\n[retryable] {'yes' if retryable else 'no'}"
        if tool_results:
            section += "\n---"
            for tool_result in tool_results:
                if tool_result.get("ok", False):
                    section += f"\n  - {tool_result.get('tool_name', '?')}: OK"
                    continue

                tool_error = tool_result.get("error")
                if isinstance(tool_error, dict):
                    error_message = tool_error.get("message", "Unknown error")
                elif tool_error is None:
                    error_message = "Unknown error"
                else:
                    error_message = str(tool_error)
                section += f"\n  - {tool_result.get('tool_name', '?')}: ERROR — {error_message}"

        parts.append(section)

    return "\n\n".join(parts)


def build_merged_prompt(
    messages: list,
    merged_context: str,
    execution_context_block: str,
    memory_block: str,
) -> str:
    """Build the merged synthesis prompt payload."""
    history = build_conversation_history_block(messages, limit=10)
    return (
        f"{build_root_merged_synthesis_prompt()}\n\n"
        f"{execution_context_block}\n\n"
        f"<conversation_history>\n{history}\n</conversation_history>\n\n"
        f"<app_results>\n{merged_context}\n</app_results>"
        f"{memory_block}"
    )
