"""httpx client for Backboard.io (Gemma via team BYOK)."""

from __future__ import annotations

import asyncio
import json
import sys

import httpx

from backend.app.config import get_settings
from backend.app.models.schemas import ChatResponse

_FALLBACK_REPLY = (
    "I'm having trouble reaching the assistant right now. "
    "Can you try again in a moment?"
)


async def backboard_chat(
    user_id: str,
    message: str,
    thread_id: str | None = None,
) -> ChatResponse:
    """Create thread if needed, send message, return normalized ChatResponse."""
    settings = get_settings()
    base = settings.backboard_base_url.rstrip("/")
    headers = {"X-API-Key": settings.backboard_api_key}
    tid = thread_id
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            if not tid:
                r = await client.post(
                    f"{base}/assistants/{settings.backboard_assistant_id}/threads",
                    headers=headers,
                    json={},
                )
                r.raise_for_status()
                data = r.json()
                tid = str(data.get("thread_id", "") or data.get("threadId", ""))
            if not tid:
                raise ValueError("Backboard did not return a thread_id")
            form_data = {
                "content": message,
                "llm_provider": "google",
                "model_name": "gemma-4-31b-it",
                "stream": "false",
                "memory": "Auto",
                "web_search": "Auto",
            }
            r2 = await client.post(
                f"{base}/threads/{tid}/messages",
                headers=headers,
                data=form_data,
            )
            r2.raise_for_status()
            out = r2.json()
    except (httpx.HTTPError, json.JSONDecodeError, ValueError) as exc:
        print(  # noqa: T201 — PRD: stderr on failure, no obs stack
            f"backboard_chat error (user {user_id}): {exc!s}",
            file=sys.stderr,
        )
        return ChatResponse(
            reply=_FALLBACK_REPLY,
            thread_id=thread_id or "fallback",
            sources=None,
        )

    reply = out.get("content")
    if not isinstance(reply, str) or not reply:
        reply = str(out.get("message", "")) or _FALLBACK_REPLY
    out_tid = str(
        out.get("thread_id", tid or "") or out.get("threadId", tid or "fallback")
    )
    return ChatResponse(
        reply=reply,
        thread_id=out_tid,
        sources=None,
    )


if __name__ == "__main__":

    async def _main() -> None:
        r = await backboard_chat(
            "demo_user_42", "Why is 2 PM the best time today?"
        )
        print(r.reply)
        print(r.thread_id)
        print(r.sources)

    asyncio.run(_main())
