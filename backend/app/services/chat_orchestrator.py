"""Hybrid chat orchestration: Backboard memory/RAG context + native Gemma."""

from __future__ import annotations

import asyncio
import re
import sys

import httpx

from backend.app.models.schemas import ChatResponse
from backend.app.services.availability_assistant import handle_chat_message
from backend.app.services.backboard_client import (
    BackboardMemory,
    ensure_thread,
    search_memories,
    store_assistant_memory,
    store_user_message,
)
from backend.app.services.gemma_client import generate_gemma_reply
from backend.app.services.gemma_client import is_fallback_reply


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

    assistant_outcome = await handle_chat_message(
        user_id,
        message,
        tid if tid != "fallback" else None,
    )
    if assistant_outcome is not None:
        if tid != "fallback":
            try:
                await store_assistant_memory(user_id, message, assistant_outcome.reply)
            except (httpx.HTTPError, ValueError) as exc:
                _report_backboard_error("store assistant memory", user_id, exc)
        return ChatResponse(
            reply=assistant_outcome.reply,
            thread_id=tid,
            sources=None,
            assistant_action=assistant_outcome.action,
        )

    if tid != "fallback":
        try:
            context = await store_user_message(tid, user_id, message)
            memories.extend(context.retrieved_memories)
            retrieved_files.extend(context.retrieved_files)
        except (httpx.HTTPError, ValueError) as exc:
            _report_backboard_error("store user message", user_id, exc)

    try:
        memories.extend(await search_memories(user_id, message))
    except (httpx.HTTPError, ValueError) as exc:
        _report_backboard_error("memory search", user_id, exc)

    memories = _dedupe_memories(memories)
    rag_context = [
        f"Backboard retrieved file available for this thread: {filename}"
        for filename in retrieved_files
    ]
    reply = await generate_gemma_reply(
        message,
        [memory.content for memory in memories],
        rag_context,
    )

    if tid != "fallback" and not is_fallback_reply(reply):
        try:
            await store_assistant_memory(user_id, message, reply)
        except (httpx.HTTPError, ValueError) as exc:
            _report_backboard_error("store assistant memory", user_id, exc)

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
