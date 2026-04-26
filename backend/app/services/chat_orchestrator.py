"""Hybrid chat orchestration: Backboard memory/RAG context + native Gemma."""

from __future__ import annotations

import asyncio
import re
import sys

import httpx

from backend.app.database import get_supabase
from backend.app.models.schemas import ChatResponse
from backend.app.services.availability_assistant import handle_chat_message
from backend.app.services.backboard_client import (
    BackboardMemory,
    BackboardMessageContext,
    add_memory,
    ensure_thread,
    search_memories,
    store_assistant_memory,
    store_user_message,
)
from backend.app.services.gemma_client import generate_gemma_reply
from backend.app.services.gemma_client import is_fallback_reply

_latest_appliance_pref_by_user: dict[str, dict[str, str]] = {}

_APPLIANCE_MATCHERS: tuple[tuple[str, tuple[str, ...], str], ...] = (
    ("ev_charger", ("charge my car", "ev", "car charge", "ev charger"), "EV charging"),
    ("dishwasher", ("dishwasher", "wash dishes"), "dishwasher"),
    ("washing_machine", ("washing machine", "washer", "laundry"), "washing machine"),
    ("dryer", ("dryer", "dry clothes"), "dryer"),
    ("water_heater_boost", ("water heater", "hot water"), "water heater"),
)


def _dedupe_memories(memories: list[BackboardMemory]) -> list[BackboardMemory]:
    seen: set[str] = set()
    out: list[BackboardMemory] = []
    for memory in memories:
        key = memory.content.strip()
        if key and key not in seen:
            out.append(memory)
            seen.add(key)
    return out


_USER_SCOPED_PREFIX = re.compile(r"^For user [0-9a-f-]{36}:\s*", re.IGNORECASE)


def _excerpt_for_source_line(content: str, limit: int = 140) -> str:
    text = content.replace("\n", " ").strip()
    match = _USER_SCOPED_PREFIX.match(text)
    if match:
        text = text[match.end() :].strip()
    if len(text) <= limit:
        return text
    return text[: limit - 3].rstrip() + "..."


def _memory_source_label(memory: BackboardMemory) -> str | None:
    text = _excerpt_for_source_line(memory.content)
    if not text:
        return None
    if memory.score is not None:
        return f"{text} · relevance {memory.score:.2f}"
    return text


def _sources(
    memories: list[BackboardMemory],
    retrieved_files: list[str],
) -> list[str] | None:
    lines: list[str] = []
    for memory in memories:
        label = _memory_source_label(memory)
        if label:
            lines.append(label)
    for filename in retrieved_files:
        stripped = filename.strip()
        if stripped:
            lines.append(f"File: {stripped}")
    return lines or None


def _report_backboard_error(operation: str, user_id: str, exc: Exception) -> None:
    print(  # noqa: T201 — demo backend, no logging infra
        f"Backboard {operation} error (user {user_id}): {exc!s}",
        file=sys.stderr,
    )


def _update_user_preferences_from_chat(user_id: str, message: str) -> str | None:
    lowered = message.lower()
    if "reset" in lowered and "preference" in lowered:
        try:
            get_supabase().table("profiles").update(
                {
                    "cost_weight": 0.5,
                    "carbon_weight": 0.3,
                    "comfort_weight": 0.2,
                }
            ).eq("id", user_id).execute()
            get_supabase().table("feedback_events").delete().eq("user_id", user_id).execute()
            get_supabase().table("recommendations_cache").delete().eq("user_id", user_id).execute()
        except Exception as exc:  # noqa: BLE001
            _report_backboard_error("preferences reset db write", user_id, exc)
        return (
            "Done — I reset your optimization preferences to default "
            "(cost 50%, emissions 30%, comfort 20%) and cleared learned feedback."
        )

    if "preference" not in lowered and "priorit" not in lowered:
        return None

    cost_signal = any(token in lowered for token in ("cost", "save money", "cheaper", "bill"))
    carbon_signal = any(token in lowered for token in ("carbon", "emission", "eco", "cleaner"))
    comfort_signal = any(token in lowered for token in ("comfort", "convenien", "home", "easy"))

    if cost_signal and not carbon_signal and not comfort_signal:
        weights = {"cost_weight": 0.6, "carbon_weight": 0.25, "comfort_weight": 0.15}
        summary = "Updated preferences: prioritize cost savings."
    elif carbon_signal and not cost_signal and not comfort_signal:
        weights = {"cost_weight": 0.2, "carbon_weight": 0.65, "comfort_weight": 0.15}
        summary = "Updated preferences: prioritize lower emissions."
    elif comfort_signal and not cost_signal and not carbon_signal:
        weights = {"cost_weight": 0.2, "carbon_weight": 0.2, "comfort_weight": 0.6}
        summary = "Updated preferences: prioritize comfort and convenience."
    elif cost_signal or carbon_signal or comfort_signal:
        weights = {"cost_weight": 0.4, "carbon_weight": 0.35, "comfort_weight": 0.25}
        summary = "Updated preferences: balanced your requested priorities."
    else:
        return None

    try:
        get_supabase().table("profiles").update(weights).eq("id", user_id).execute()
        get_supabase().table("recommendations_cache").delete().eq("user_id", user_id).execute()
    except Exception as exc:  # noqa: BLE001
        _report_backboard_error("preferences update db write", user_id, exc)
    return summary


def _detect_appliance(message: str) -> tuple[str, str] | None:
    lowered = message.lower()
    for key, phrases, label in _APPLIANCE_MATCHERS:
        if any(phrase in lowered for phrase in phrases):
            return key, label
    return None


def _extract_appliance_time_preference(message: str) -> tuple[str, str, str] | None:
    lowered = message.lower()
    appliance = _detect_appliance(message)
    if appliance is None:
        return None
    intent_tokens = ("want", "prefer", "set", "change", "move", "run", "wash", "charge", "schedule")
    if not any(token in lowered for token in intent_tokens):
        return None
    match = re.search(
        r"\b(at|from)\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm|bm))",
        lowered,
        re.IGNORECASE,
    )
    if not match:
        return None
    raw_time = match.group(2).upper().replace("BM", "AM")
    appliance_key, appliance_label = appliance
    memory_line = f"User prefers {appliance_label} around {raw_time}."
    return appliance_key, appliance_label, memory_line


def _extract_appliance_time_question(message: str) -> tuple[str, str] | None:
    lowered = message.lower()
    if "when" not in lowered:
        return None
    appliance = _detect_appliance(message)
    if appliance is None:
        return None
    if "when should i" in lowered or "when do i want" in lowered or "what time should i" in lowered:
        return appliance
    return None


def _spawn_background_memory_store(
    user_id: str,
    user_message: str,
    assistant_reply: str,
) -> None:
    task = asyncio.create_task(
        store_assistant_memory(user_id, user_message, assistant_reply)
    )

    def _on_done(done_task: asyncio.Task[None]) -> None:
        try:
            done_task.result()
        except (httpx.HTTPError, ValueError) as exc:
            _report_backboard_error("store assistant memory", user_id, exc)
        except Exception as exc:  # noqa: BLE001 — keep failures non-fatal
            _report_backboard_error("store assistant memory", user_id, exc)

    task.add_done_callback(_on_done)


async def hybrid_chat(
    user_id: str,
    message: str,
    thread_id: str | None = None,
) -> ChatResponse:
    """
    Generate chat responses with native Gemma while using Backboard for memory.

    Backboard errors are non-fatal: the frontend should still receive a Gemma
    response even if memory/RAG context is temporarily unavailable.
    """
    tid = thread_id or "fallback"
    memories: list[BackboardMemory] = []
    retrieved_files: list[str] = []

    try:
        tid = await ensure_thread(thread_id)
    except (httpx.HTTPError, ValueError) as exc:
        _report_backboard_error("thread", user_id, exc)

    try:
        preference_reply = _update_user_preferences_from_chat(user_id, message)
    except Exception as exc:  # noqa: BLE001 — do not break chat flow
        _report_backboard_error("preferences update", user_id, exc)
        preference_reply = None
    if preference_reply is not None:
        return ChatResponse(
            reply=preference_reply,
            thread_id=tid,
            sources=None,
            assistant_action=None,
        )

    appliance_pref = _extract_appliance_time_preference(message)
    if appliance_pref:
        appliance_key, appliance_label, memory_line = appliance_pref
        user_prefs = _latest_appliance_pref_by_user.setdefault(user_id, {})
        user_prefs[appliance_key] = memory_line
        try:
            asyncio.create_task(
                add_memory(
                    user_id,
                    memory_line,
                    {"kind": "appliance_preference", "appliance": appliance_key},
                )
            )
        except Exception as exc:  # noqa: BLE001
            _report_backboard_error("store appliance preference", user_id, exc)
        return ChatResponse(
            reply=f"Done — I updated your {appliance_label} preference. I will use this latest time going forward.",
            thread_id=tid,
            sources=None,
            assistant_action=None,
        )

    appliance_question = _extract_appliance_time_question(message)
    if appliance_question and user_id in _latest_appliance_pref_by_user:
        appliance_key, appliance_label = appliance_question
        latest = _latest_appliance_pref_by_user[user_id].get(appliance_key)
        if latest:
            readable = latest.replace("User prefers ", "you prefer ").replace(".", "")
            return ChatResponse(
                reply=f"Based on your latest update: {readable}.",
                thread_id=tid,
                sources=None,
                assistant_action=None,
            )

    if appliance_question:
        _, appliance_label = appliance_question
        return ChatResponse(
            reply=f"I do not have a saved {appliance_label} time yet. Tell me the exact time and I will update it right away.",
            thread_id=tid,
            sources=None,
            assistant_action=None,
        )

    try:
        assistant_outcome = await handle_chat_message(
            user_id,
            message,
            tid if tid != "fallback" else None,
        )
    except Exception as exc:  # noqa: BLE001 — keep chat responsive in demo envs
        _report_backboard_error("availability assistant", user_id, exc)
        assistant_outcome = None
    if assistant_outcome is not None:
        if tid != "fallback":
            _spawn_background_memory_store(user_id, message, assistant_outcome.reply)
        return ChatResponse(
            reply=assistant_outcome.reply,
            thread_id=tid,
            sources=None,
            assistant_action=assistant_outcome.action,
        )

    async def _store_user_turn() -> BackboardMessageContext | None:
        if tid == "fallback":
            return None
        try:
            return await store_user_message(tid, user_id, message)
        except Exception as exc:  # noqa: BLE001 — non-fatal memory write path
            _report_backboard_error("store user message", user_id, exc)
            return None

    async def _search_user_memories() -> list[BackboardMemory]:
        try:
            return await search_memories(user_id, message)
        except Exception as exc:  # noqa: BLE001 — non-fatal memory search path
            _report_backboard_error("memory search", user_id, exc)
            return []

    try:
        context, search_hits = await asyncio.gather(
            _store_user_turn(),
            _search_user_memories(),
        )
        if context is not None:
            memories.extend(context.retrieved_memories)
            retrieved_files.extend(context.retrieved_files)
        memories.extend(search_hits)

        memories = _dedupe_memories(memories)
        if user_id in _latest_appliance_pref_by_user:
            for pref_line in _latest_appliance_pref_by_user[user_id].values():
                memories.insert(0, BackboardMemory(id=None, content=pref_line, score=None))
        rag_context = [
            f"Backboard retrieved file available for this thread: {filename}"
            for filename in retrieved_files
        ]
        reply = await generate_gemma_reply(
            message,
            [memory.content for memory in memories],
            rag_context,
        )
    except Exception as exc:  # noqa: BLE001 — keep chat endpoint alive
        _report_backboard_error("orchestrator", user_id, exc)
        reply = await generate_gemma_reply(message, [], [])

    if tid != "fallback" and not is_fallback_reply(reply):
        _spawn_background_memory_store(user_id, message, reply)

    return ChatResponse(
        reply=reply,
        thread_id=tid,
        sources=_sources(memories, retrieved_files),
    )


if __name__ == "__main__":

    async def _main() -> None:
        response = await hybrid_chat(
            "demo_user_42",
            "What is a good time to run the dishwasher today?",
        )
        print(response.reply)
        print(response.thread_id)
        print(response.sources)

    asyncio.run(_main())
