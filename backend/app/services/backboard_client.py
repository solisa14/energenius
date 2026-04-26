"""Backboard.io helpers for threads, memory, and lightweight RAG metadata."""

from __future__ import annotations

import asyncio
import json
from dataclasses import dataclass
from typing import Any

import httpx

from backend.app.config import get_settings

_BACKBOARD_TIMEOUT_SECONDS = 8.0


@dataclass(frozen=True)
class BackboardMemory:
    id: str | None
    content: str
    score: float | None = None


@dataclass(frozen=True)
class BackboardMessageContext:
    thread_id: str
    retrieved_memories: list[BackboardMemory]
    retrieved_files: list[str]
    memory_operation_id: str | None = None


def _headers() -> dict[str, str]:
    return {"X-API-Key": get_settings().backboard_api_key}


def _base_url() -> str:
    return get_settings().backboard_base_url.rstrip("/")


def _assistant_id() -> str:
    return get_settings().backboard_assistant_id


def _text_from_structure(obj: Any, depth: int = 0) -> str | None:
    """Pull human-readable text from nested API payloads without repr(dict) dumps."""
    if depth > 6:
        return None
    if isinstance(obj, str):
        stripped = obj.strip()
        return stripped if stripped else None
    if isinstance(obj, dict):
        for key in ("text", "message", "content", "summary", "body", "value"):
            if key not in obj:
                continue
            nested = _text_from_structure(obj[key], depth + 1)
            if nested:
                return nested
        return None
    if isinstance(obj, list):
        parts: list[str] = []
        for el in obj[:5]:
            nested = _text_from_structure(el, depth + 1)
            if nested:
                parts.append(nested)
        return "; ".join(parts) if parts else None
    return None


def _memory_content(raw: dict[str, Any]) -> str:
    content = raw.get("content", raw.get("memory", ""))
    if isinstance(content, str):
        return content.strip()
    if isinstance(content, (dict, list)):
        extracted = _text_from_structure(content)
        return extracted if extracted else ""
    if content in (None, ""):
        return ""
    return str(content).strip()


def _file_label(item: Any) -> str | None:
    if isinstance(item, str):
        s = item.strip()
        return s if s else None
    if isinstance(item, dict):
        for key in ("filename", "name", "path", "file_id", "id"):
            v = item.get(key)
            if isinstance(v, str) and v.strip():
                return v.strip()
    return None


def _memory_allowed(raw: dict[str, Any], user_id: str) -> bool:
    metadata = raw.get("metadata")
    if isinstance(metadata, dict) and metadata.get("user_id") not in (None, user_id):
        return False
    content = _memory_content(raw)
    if "For user " in content:
        return f"For user {user_id}" in content
    return bool(content)


def _memory_from_raw(raw: dict[str, Any]) -> BackboardMemory:
    score = raw.get("score")
    return BackboardMemory(
        id=str(raw.get("id")) if raw.get("id") else None,
        content=_memory_content(raw),
        score=float(score) if isinstance(score, int | float) else None,
    )


def _keyword_rank(memories: list[BackboardMemory], query: str) -> list[BackboardMemory]:
    terms = {term.lower() for term in query.split() if len(term) > 2}
    if not terms:
        return memories
    ranked = sorted(
        memories,
        key=lambda memory: len(
            terms.intersection(set(memory.content.lower().split()))
        ),
        reverse=True,
    )
    return [
        memory
        for memory in ranked
        if terms.intersection(set(memory.content.lower().split()))
    ]


def _truncate(value: str, limit: int = 700) -> str:
    if len(value) <= limit:
        return value
    return value[: limit - 3].rstrip() + "..."


async def ensure_thread(thread_id: str | None = None) -> str:
    """Return an existing thread id or create a Backboard thread."""
    if thread_id and thread_id.strip() and thread_id != "demo-thread":
        return thread_id
    async with httpx.AsyncClient(timeout=_BACKBOARD_TIMEOUT_SECONDS) as client:
        response = await client.post(
            f"{_base_url()}/assistants/{_assistant_id()}/threads",
            headers=_headers(),
            json={},
        )
        response.raise_for_status()
        data = response.json()
    tid = data.get("thread_id", data.get("threadId", ""))
    if not isinstance(tid, str) or not tid:
        raise ValueError("Backboard did not return a thread_id")
    return tid


async def search_memories(
    user_id: str,
    query: str,
    limit: int = 5,
) -> list[BackboardMemory]:
    """Search Backboard memories, scoped by a user marker to avoid cross-user leaks."""
    async with httpx.AsyncClient(timeout=_BACKBOARD_TIMEOUT_SECONDS) as client:
        response = await client.post(
            f"{_base_url()}/assistants/{_assistant_id()}/memories/search",
            headers=_headers(),
            json={"query": f"For user {user_id}: {query}", "limit": limit},
        )
        response.raise_for_status()
        data = response.json()
    raw_memories = data.get("memories", [])
    if not isinstance(raw_memories, list):
        return []
    memories: list[BackboardMemory] = []
    for raw in raw_memories:
        if isinstance(raw, dict) and _memory_allowed(raw, user_id):
            memories.append(_memory_from_raw(raw))
    if memories:
        return memories
    listed = await list_memories(user_id, page_size=max(limit, 10))
    return _keyword_rank(listed, query)[:limit]


async def list_memories(user_id: str, page_size: int = 25) -> list[BackboardMemory]:
    """List Backboard memories and apply local user scoping."""
    async with httpx.AsyncClient(timeout=_BACKBOARD_TIMEOUT_SECONDS) as client:
        response = await client.get(
            f"{_base_url()}/assistants/{_assistant_id()}/memories",
            headers=_headers(),
            params={"page": 1, "page_size": page_size},
        )
        response.raise_for_status()
        data = response.json()
    raw_memories = data.get("memories", [])
    if not isinstance(raw_memories, list):
        return []
    return [
        _memory_from_raw(raw)
        for raw in raw_memories
        if isinstance(raw, dict) and _memory_allowed(raw, user_id)
    ]


async def add_memory(
    user_id: str,
    content: str,
    metadata: dict[str, Any] | None = None,
) -> str | None:
    """Write a user-scoped memory directly to Backboard."""
    payload = {
        "content": f"For user {user_id}: {_truncate(content)}",
        "metadata": {
            "source": "energenius_chat",
            "user_id": user_id,
            **(metadata or {}),
        },
    }
    async with httpx.AsyncClient(timeout=_BACKBOARD_TIMEOUT_SECONDS) as client:
        response = await client.post(
            f"{_base_url()}/assistants/{_assistant_id()}/memories",
            headers=_headers(),
            json=payload,
        )
        response.raise_for_status()
        data = response.json()
    memory_id = data.get("memory_id", data.get("id"))
    return str(memory_id) if memory_id else None


async def store_user_message(
    thread_id: str,
    user_id: str,
    message: str,
) -> BackboardMessageContext:
    """
    Store the user turn in Backboard without asking Backboard to generate.

    `send_to_llm=false` keeps conversation persistence and memory hooks available
    while avoiding the Backboard-hosted LLM path that is blocked by credits.
    """
    async with httpx.AsyncClient(timeout=_BACKBOARD_TIMEOUT_SECONDS) as client:
        response = await client.post(
            f"{_base_url()}/threads/{thread_id}/messages",
            headers=_headers(),
            data={
                "content": message,
                "stream": "false",
                "memory": "Auto",
                "send_to_llm": "false",
                "metadata": json.dumps(
                    {"source": "energenius_chat", "user_id": user_id}
                ),
            },
        )
        response.raise_for_status()
        data = response.json()
    raw_memories = data.get("retrieved_memories") or []
    memories = [
        _memory_from_raw(raw)
        for raw in raw_memories
        if isinstance(raw, dict) and _memory_allowed(raw, user_id)
    ]
    raw_files = data.get("retrieved_files") or []
    files: list[str] = []
    for item in raw_files:
        label = _file_label(item)
        if label:
            files.append(label)
    op_id = data.get("memory_operation_id")
    return BackboardMessageContext(
        thread_id=thread_id,
        retrieved_memories=memories,
        retrieved_files=files,
        memory_operation_id=str(op_id) if op_id else None,
    )


async def store_assistant_memory(
    user_id: str,
    user_message: str,
    assistant_reply: str,
) -> None:
    """Persist a compact summary so later native Gemma calls can retrieve it."""
    content = (
        f"Recent chat turn. User said: {_truncate(user_message, 280)} "
        f"Assistant replied: {_truncate(assistant_reply, 360)}"
    )
    await add_memory(
        user_id,
        content,
        {"kind": "chat_turn"},
    )


if __name__ == "__main__":

    async def _main() -> None:
        uid = "demo_user_42"
        tid = await ensure_thread()
        await add_memory(uid, "User prefers lower-cost evening appliance schedules.")
        ctx = await store_user_message(
            tid,
            uid,
            "When should I run the dishwasher if I care about cost?",
        )
        memories = await search_memories(uid, "dishwasher cost preferences")
        print(tid)
        print([m.content for m in ctx.retrieved_memories])
        print([m.content for m in memories])

    asyncio.run(_main())
