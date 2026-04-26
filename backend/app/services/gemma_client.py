"""Native Google Gen AI client for Gemma chat responses."""

from __future__ import annotations

import asyncio
import sys

from google import genai

from backend.app.config import get_settings

_FALLBACK_REPLY = (
    "I'm having trouble reaching the assistant right now. "
    "Can you try again in a moment?"
)

_SYSTEM_PROMPT = """You are EnerGenius, an energy optimization assistant for homeowners.
Help the user understand when to run appliances to reduce electricity cost and carbon emissions.
Use the supplied memory and document context when relevant, but do not invent data.
Keep answers concise, practical, and tied to the user's home energy schedule."""


def _context_block(title: str, items: list[str]) -> str:
    if not items:
        return f"{title}: none"
    lines = [f"- {item}" for item in items]
    return title + ":\n" + "\n".join(lines)


def build_prompt(
    message: str,
    memories: list[str],
    rag_context: list[str],
) -> str:
    return "\n\n".join(
        [
            _SYSTEM_PROMPT,
            _context_block("Relevant Backboard memories", memories),
            _context_block("Relevant Backboard RAG context", rag_context),
            f"User message:\n{message}",
            "Assistant response:",
        ]
    )


async def generate_gemma_reply(
    message: str,
    memories: list[str],
    rag_context: list[str],
) -> str:
    """Generate a response directly with Google AI Studio / Gemini API."""
    settings = get_settings()
    if not settings.google_ai_api_key:
        print(  # noqa: T201 — demo backend, no logging infra
            "generate_gemma_reply error: GOOGLE_AI_API_KEY is not configured",
            file=sys.stderr,
        )
        return _FALLBACK_REPLY

    try:
        client = genai.Client(api_key=settings.google_ai_api_key)
        response = await client.aio.models.generate_content(
            model=settings.gemma_model_name,
            contents=build_prompt(message, memories, rag_context),
        )
    except Exception as exc:  # noqa: BLE001 — normalize SDK/provider failures
        print(  # noqa: T201 — demo backend, no logging infra
            f"generate_gemma_reply error: {exc!s}",
            file=sys.stderr,
        )
        return _FALLBACK_REPLY

    text = getattr(response, "text", None)
    if isinstance(text, str) and text.strip():
        return text.strip()
    return _FALLBACK_REPLY


def is_fallback_reply(reply: str) -> bool:
    return reply == _FALLBACK_REPLY


if __name__ == "__main__":

    async def _main() -> None:
        reply = await generate_gemma_reply(
            "What is a good time to run the dishwasher today?",
            ["For user demo_user_42: User prefers lower-cost evening appliance schedules."],
            [],
        )
        print(reply)

    asyncio.run(_main())
