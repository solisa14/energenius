"""Gemma-backed availability reasoning with safe server-side actions."""

from __future__ import annotations

import json
import re
import sys
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta
from typing import Any, Literal

try:
    from google import genai
except ImportError:  # pragma: no cover - dependency may be absent in local dev
    genai = None

from backend.app.config import get_settings
from backend.app.database import get_supabase
from backend.app.models.schemas import (
    AvailabilityActionReplyResponse,
    AvailabilityAssistantAction,
    AvailabilityClarification,
    CalendarSyncResponse,
    DayAvailability,
)
from backend.app.services.calendar_parser import (
    SLOTS_PER_DAY,
    apply_slot_change,
    default_slots_for_day,
    safe_zoneinfo,
    slot_range_for_interval,
)
from backend.app.services.google_calendar import (
    build_day_events_local,
    fetch_events_for_local_days,
)


class CalendarSyncFailure(Exception):
    def __init__(self, code: str, message: str, status_code: int = 400) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.status_code = status_code


_MONTHS = {
    "january": 1,
    "february": 2,
    "march": 3,
    "april": 4,
    "may": 5,
    "june": 6,
    "july": 7,
    "august": 8,
    "september": 9,
    "october": 10,
    "november": 11,
    "december": 12,
}

_HOME_HINTS = (
    "wfh",
    "work from home",
    "remote",
    "zoom",
    "virtual",
    "telehealth",
    "at home",
    "home office",
)
_AWAY_HINTS = (
    "dentist",
    "doctor",
    "appointment",
    "flight",
    "airport",
    "trip",
    "travel",
    "office",
    "commute",
    "school",
    "pickup",
    "dropoff",
    "soccer",
    "practice",
    "restaurant",
    "lunch",
    "dinner",
    "gym",
    "haircut",
    "barber",
    "errand",
)
_UNCERTAIN_HINTS = ("busy", "meeting", "focus", "hold", "tentative")

_STATE_HOME_RE = re.compile(
    r"\b(i(?:'| a)?ll be home|i am home|i'm home|be home|at home|working from home|work from home|wfh)\b",
    re.IGNORECASE,
)
_STATE_AWAY_RE = re.compile(
    r"\b(won't be home|will not be home|not be home|away from home|be away|i'm away|i am away|out of the house|out of town|away)\b",
    re.IGNORECASE,
)
_STATE_SKIP_RE = re.compile(r"\b(skip|ignore|leave it|don'?t change|no change)\b", re.IGNORECASE)
_YES_RE = re.compile(r"\b(yes|yep|yeah|correct|right)\b", re.IGNORECASE)
_NO_RE = re.compile(r"\b(no|nope|nah)\b", re.IGNORECASE)
_DATE_ISO_RE = re.compile(r"\b(20\d{2}-\d{2}-\d{2})\b")
_MONTH_DAY_RE = re.compile(
    r"\b("
    + "|".join(_MONTHS.keys())
    + r")\s+(\d{1,2})(?:,\s*(20\d{2}))?\b",
    re.IGNORECASE,
)
_TIME_RANGE_RE = re.compile(
    r"(?:from\s+)?"
    r"(?P<start>\d{1,2}(?::\d{2})?\s*(?:am|pm)?)"
    r"\s*(?:to|-|until)\s*"
    r"(?P<end>\d{1,2}(?::\d{2})?\s*(?:am|pm)?)",
    re.IGNORECASE,
)


@dataclass(frozen=True)
class CalendarEventDecision:
    state: Literal["home", "away", "unknown"]
    reason: str
    confidence: float
    question_text: str | None = None


@dataclass(frozen=True)
class ChatDecision:
    kind: Literal["apply_availability_change", "ask_clarification", "not_schedule_related"]
    summary: str
    question_text: str | None = None
    target_date: date | None = None
    start_slot: int | None = None
    end_slot: int | None = None
    set_home: bool | None = None
    reason: str | None = None


@dataclass(frozen=True)
class ChatOutcome:
    reply: str
    action: AvailabilityAssistantAction | None = None
    clarification: AvailabilityClarification | None = None


def _now_local(timezone_name: str | None) -> datetime:
    return datetime.now(tz=safe_zoneinfo(timezone_name))


def _today_local(timezone_name: str | None) -> date:
    return _now_local(timezone_name).date()


def _slot_label(slot_idx: int) -> str:
    normalized = slot_idx % SLOTS_PER_DAY
    hour = normalized // 2
    minute = 30 if slot_idx % 2 else 0
    return datetime.combine(date(2000, 1, 1), time(hour=hour, minute=minute)).strftime(
        "%-I:%M %p"
    )


def _slot_window_label(start_slot: int, end_slot: int) -> str:
    return f"{_slot_label(start_slot)} to {_slot_label(end_slot)}"


def _row_date(raw: Any) -> date:
    if isinstance(raw, date):
        return raw
    return date.fromisoformat(str(raw))


def _profile(user_id: str) -> dict[str, Any]:
    response = (
        get_supabase().table("profiles").select("*").eq("id", user_id).single().execute()
    )
    return dict(response.data or {})


def _looks_like_missing_setup(exc: Exception) -> bool:
    text = str(exc).lower()
    return any(
        needle in text
        for needle in (
            "timezone",
            "requires_presence",
            "availability_assistant_actions",
            "column",
            "relation",
            "does not exist",
        )
    )


def _ensure_onboarding_schema_ready(user_id: str) -> None:
    supabase = get_supabase()
    try:
        prof = (
            supabase.table("profiles")
            .select("id,timezone")
            .eq("id", user_id)
            .execute()
        )
        rows = list(prof.data or [])
        if not rows:
            raise CalendarSyncFailure(
                "profile_missing",
                "The profile row for this user is missing. Verify the auth trigger created `profiles` rows before onboarding.",
                status_code=500,
            )
        supabase.table("appliances").select("id,requires_presence").limit(1).execute()
        supabase.table("availability_assistant_actions").select("id").limit(1).execute()
    except CalendarSyncFailure:
        raise
    except Exception as exc:  # noqa: BLE001
        if _looks_like_missing_setup(exc):
            raise CalendarSyncFailure(
                "setup_migration_missing",
                "Latest Supabase setup is missing. Apply `supabase/migrations/0002_gemma_availability_assistant.sql` before onboarding or Google Calendar sync.",
                status_code=500,
            ) from exc
        raise


def _timezone_for_user(user_id: str, timezone_hint: str | None = None) -> str:
    if timezone_hint:
        return str(safe_zoneinfo(timezone_hint).key)
    profile = _profile(user_id)
    return str(safe_zoneinfo(profile.get("timezone")).key)


def _get_day_slots(user_id: str, target_date: date) -> list[bool]:
    response = (
        get_supabase()
        .table("availability")
        .select("slots")
        .eq("user_id", user_id)
        .eq("date", target_date.isoformat())
        .execute()
    )
    rows = list(response.data or [])
    if rows:
        slots = rows[0].get("slots")
        if isinstance(slots, list) and len(slots) == SLOTS_PER_DAY:
            return [bool(value) for value in slots]
    return default_slots_for_day(target_date)


def _upsert_day_slots(user_id: str, target_date: date, slots: list[bool]) -> DayAvailability:
    payload = {"user_id": user_id, "date": target_date.isoformat(), "slots": slots}
    get_supabase().table("availability").upsert(payload, on_conflict="user_id,date").execute()
    return DayAvailability(date=target_date, slots=slots)


def _clear_pending_calendar_actions(user_id: str) -> None:
    get_supabase().table("availability_assistant_actions").update(
        {"status": "cancelled", "updated_at": datetime.utcnow().isoformat()}
    ).eq("user_id", user_id).eq("source", "calendar_sync").eq("status", "pending").execute()


def _create_action(
    *,
    user_id: str,
    source: str,
    status: str,
    target_date: date,
    start_slot: int,
    end_slot: int,
    question_text: str | None = None,
    reason: str | None = None,
    thread_id: str | None = None,
    set_home: bool | None = None,
    raw_user_message: str | None = None,
) -> dict[str, Any]:
    timestamp = datetime.utcnow().isoformat()
    payload = {
        "user_id": user_id,
        "thread_id": thread_id,
        "source": source,
        "status": status,
        "date": target_date.isoformat(),
        "start_slot": start_slot,
        "end_slot": end_slot,
        "set_home": set_home,
        "question_text": question_text,
        "reason": reason,
        "raw_user_message": raw_user_message,
        "updated_at": timestamp,
    }
    response = get_supabase().table("availability_assistant_actions").insert(payload).execute()
    rows = list(response.data or [])
    return dict(rows[0] if rows else payload)


def _update_action(action_id: str, patch: dict[str, Any]) -> dict[str, Any]:
    patch = {**patch, "updated_at": datetime.utcnow().isoformat()}
    response = (
        get_supabase()
        .table("availability_assistant_actions")
        .update(patch)
        .eq("id", action_id)
        .execute()
    )
    rows = list(response.data or [])
    return dict(rows[0] if rows else {})


def _get_action(user_id: str, action_id: str) -> dict[str, Any] | None:
    response = (
        get_supabase()
        .table("availability_assistant_actions")
        .select("*")
        .eq("id", action_id)
        .eq("user_id", user_id)
        .execute()
    )
    rows = list(response.data or [])
    return dict(rows[0]) if rows else None


def _pending_thread_action(user_id: str, thread_id: str | None) -> dict[str, Any] | None:
    response = (
        get_supabase()
        .table("availability_assistant_actions")
        .select("*")
        .eq("user_id", user_id)
        .eq("status", "pending")
        .execute()
    )
    rows = [dict(row) for row in list(response.data or [])]
    if thread_id:
        rows = [row for row in rows if row.get("thread_id") == thread_id]
    rows.sort(key=lambda row: str(row.get("created_at", "")))
    return rows[0] if rows else None


def _clarification_from_row(row: dict[str, Any]) -> AvailabilityClarification:
    return AvailabilityClarification(
        action_id=str(row["id"]),
        source=str(row["source"]),
        date=_row_date(row["date"]),
        start_slot=int(row["start_slot"]),
        end_slot=int(row["end_slot"]),
        question_text=str(row.get("question_text") or ""),
        set_home=row.get("set_home"),
    )


def _action_summary(
    *,
    status: Literal["pending", "applied", "skipped", "cancelled"],
    summary: str,
    action_id: str | None,
    affected_dates: list[date] | None = None,
    refresh_recommendations: bool = False,
) -> AvailabilityAssistantAction:
    return AvailabilityAssistantAction(
        status=status,
        action_id=action_id,
        affected_dates=affected_dates or [],
        refresh_recommendations=refresh_recommendations,
        summary=summary,
    )


def _state_from_text(message: str) -> Literal["home", "away", "skip", "yes", "no", "unknown"]:
    if _STATE_SKIP_RE.search(message):
        return "skip"
    if _STATE_AWAY_RE.search(message):
        return "away"
    if _STATE_HOME_RE.search(message):
        return "home"
    if _YES_RE.search(message):
        return "yes"
    if _NO_RE.search(message):
        return "no"
    return "unknown"


def _parse_date_phrase(message: str, timezone_name: str | None) -> date | None:
    lowered = message.lower()
    today = _today_local(timezone_name)
    if "today" in lowered:
        return today
    if "tomorrow" in lowered:
        return today + timedelta(days=1)
    iso_match = _DATE_ISO_RE.search(message)
    if iso_match:
        return date.fromisoformat(iso_match.group(1))
    md_match = _MONTH_DAY_RE.search(lowered)
    if not md_match:
        return None
    month = _MONTHS[md_match.group(1).lower()]
    day_num = int(md_match.group(2))
    year = int(md_match.group(3)) if md_match.group(3) else today.year
    parsed = date(year, month, day_num)
    if not md_match.group(3) and parsed < today:
        parsed = date(year + 1, month, day_num)
    return parsed


def _parse_clock_token(raw: str, meridian_hint: str | None = None) -> tuple[int, int] | None:
    cleaned = raw.strip().lower().replace(" ", "")
    match = re.fullmatch(r"(\d{1,2})(?::(\d{2}))?(am|pm)?", cleaned)
    if not match:
        return None
    hour = int(match.group(1))
    minute = int(match.group(2) or "0")
    meridian = match.group(3) or meridian_hint
    if minute not in (0, 30):
        return None
    if meridian:
        if hour < 1 or hour > 12:
            return None
        if meridian == "am":
            hour = 0 if hour == 12 else hour
        else:
            hour = 12 if hour == 12 else hour + 12
    elif hour == 24:
        hour = 0
    elif hour > 23:
        return None
    return hour, minute


def _default_meridian(message: str, start_hour: int, end_hour: int) -> str | None:
    lowered = message.lower()
    if "morning" in lowered:
        return "am"
    if "afternoon" in lowered or "evening" in lowered or "tonight" in lowered:
        return "pm"
    if 1 <= start_hour <= 7 and 1 <= end_hour <= 11:
        return "pm"
    return None


def _slot_from_hour_minute(hour: int, minute: int) -> int:
    return hour * 2 + (1 if minute >= 30 else 0)


def _parse_time_range(message: str) -> tuple[int, int] | None:
    lowered = message.lower()
    if "all day" in lowered:
        return 0, SLOTS_PER_DAY
    match = _TIME_RANGE_RE.search(message)
    if not match:
        return None
    raw_start = match.group("start")
    raw_end = match.group("end")
    start_hour_hint = int(re.match(r"\d{1,2}", raw_start.strip()).group(0))
    end_hour_hint = int(re.match(r"\d{1,2}", raw_end.strip()).group(0))
    default_meridian = _default_meridian(message, start_hour_hint, end_hour_hint)
    end_meridian = re.search(r"(am|pm)\b", raw_end, re.IGNORECASE)
    start_meridian = re.search(r"(am|pm)\b", raw_start, re.IGNORECASE)
    start = _parse_clock_token(
        raw_start,
        meridian_hint=(end_meridian.group(1).lower() if end_meridian and not start_meridian else default_meridian),
    )
    end = _parse_clock_token(
        raw_end,
        meridian_hint=(start_meridian.group(1).lower() if start_meridian and not end_meridian else default_meridian),
    )
    if start is None or end is None:
        return None
    start_slot = _slot_from_hour_minute(*start)
    end_slot = _slot_from_hour_minute(*end)
    if end_slot <= start_slot:
        if end_slot == 0:
            end_slot = SLOTS_PER_DAY
        elif default_meridian == "pm" and start_slot < 24 and end_slot < 24:
            start_slot += 24
            end_slot += 24
        else:
            return None
    if start_slot < 0 or end_slot > SLOTS_PER_DAY:
        return None
    return start_slot, end_slot


def _safe_json_load(raw: str) -> dict[str, Any] | None:
    text = raw.strip()
    if not text:
        return None
    fence = re.search(r"\{.*\}", text, re.DOTALL)
    candidate = fence.group(0) if fence else text
    try:
        data = json.loads(candidate)
    except json.JSONDecodeError:
        return None
    return data if isinstance(data, dict) else None


async def _gemma_json(system_prompt: str, user_prompt: str) -> dict[str, Any] | None:
    settings = get_settings()
    if not settings.google_ai_api_key or genai is None:
        return None
    try:
        client = genai.Client(api_key=settings.google_ai_api_key)
        response = await client.aio.models.generate_content(
            model=settings.gemma_model_name,
            contents=f"{system_prompt}\n\n{user_prompt}",
        )
    except Exception as exc:  # noqa: BLE001
        print(f"availability assistant gemma error: {exc!s}", file=sys.stderr)  # noqa: T201
        return None
    text = getattr(response, "text", None)
    if not isinstance(text, str):
        return None
    return _safe_json_load(text)


def _heuristic_calendar_decision(event: dict[str, str]) -> CalendarEventDecision:
    text = " ".join(
        [event.get("summary", ""), event.get("description", ""), event.get("location", "")]
    ).lower()
    if any(hint in text for hint in _HOME_HINTS):
        return CalendarEventDecision("home", "Calendar details explicitly mention home or remote attendance.", 0.95)
    if any(hint in text for hint in _AWAY_HINTS):
        return CalendarEventDecision("away", "Calendar details strongly suggest the user is away from home.", 0.9)
    location = event.get("location", "").strip()
    if location and "home" not in location.lower():
        return CalendarEventDecision("away", "A non-home location was attached to the event.", 0.82)
    if any(hint in text for hint in _UNCERTAIN_HINTS):
        return CalendarEventDecision("unknown", "The event sounds busy but does not confirm location.", 0.3)
    return CalendarEventDecision("unknown", "The event did not make home presence certain.", 0.2)


async def _calendar_event_decision(event: dict[str, str]) -> CalendarEventDecision:
    heuristic = _heuristic_calendar_decision(event)
    system_prompt = (
        "You classify whether a homeowner is definitely home, definitely away, or unknown "
        "from a calendar event. Return JSON only with keys state, reason, confidence. "
        "Allowed states: home, away, unknown. If there is any ambiguity, choose unknown."
    )
    user_prompt = json.dumps(
        {
            "summary": event.get("summary", ""),
            "description": event.get("description", ""),
            "location": event.get("location", ""),
            "start": event.get("start", ""),
            "end": event.get("end", ""),
            "rules": [
                "Only infer home or away when the event makes it certain.",
                "Meeting or busy without location should be unknown.",
                "WFH, Zoom, virtual, remote, or home can be home.",
                "Dentist, doctor, airport, travel, office, or a clear non-home location can be away.",
            ],
        }
    )
    payload = await _gemma_json(system_prompt, user_prompt)
    if not payload:
        return heuristic
    state = str(payload.get("state") or "").lower()
    if state not in {"home", "away", "unknown"}:
        return heuristic
    confidence = float(payload.get("confidence") or 0.0)
    reason = str(payload.get("reason") or heuristic.reason)
    if state == "unknown":
        return CalendarEventDecision("unknown", reason, confidence)
    if confidence < 0.8:
        return CalendarEventDecision("unknown", "The model was not certain enough to auto-apply the event.", confidence)
    return CalendarEventDecision(state, reason, confidence)


def _heuristic_chat_decision(message: str, timezone_name: str | None) -> ChatDecision:
    state = _state_from_text(message)
    target_date = _parse_date_phrase(message, timezone_name)
    slot_range = _parse_time_range(message)

    if state in {"home", "away"} and target_date and slot_range:
        start_slot, end_slot = slot_range
        return ChatDecision(
            kind="apply_availability_change",
            summary=(
                f"Updating {target_date.isoformat()} from {_slot_window_label(start_slot, end_slot)} "
                f"to {'home' if state == 'home' else 'away'}."
            ),
            target_date=target_date,
            start_slot=start_slot,
            end_slot=end_slot,
            set_home=(state == "home"),
            reason="The message included a concrete date, time range, and home/away state.",
        )

    if state == "skip":
        return ChatDecision(
            kind="not_schedule_related",
            summary="No availability change applied.",
        )

    availability_hint = any(
        token in message.lower()
        for token in ("home", "away", "not home", "wfh", "work from home", "out of town")
    )
    if availability_hint:
        if not target_date:
            return ChatDecision(
                kind="ask_clarification",
                summary="I need a specific date to update your schedule.",
                question_text="What day should I update? I can handle today, tomorrow, or an explicit date.",
            )
        if not slot_range:
            return ChatDecision(
                kind="ask_clarification",
                summary="I need a specific time range to update that day.",
                question_text=f"What time range on {target_date.isoformat()} should I mark as home or away?",
                target_date=target_date,
            )
        if state not in {"home", "away"}:
            start_slot, end_slot = slot_range
            return ChatDecision(
                kind="ask_clarification",
                summary="I know the window but not whether to mark it home or away.",
                question_text=(
                    f"For {target_date.isoformat()} from {_slot_window_label(start_slot, end_slot)}, "
                    "should I mark you as home or away?"
                ),
                target_date=target_date,
                start_slot=start_slot,
                end_slot=end_slot,
            )

    return ChatDecision(
        kind="not_schedule_related",
        summary="This looks like a general chat message rather than an availability edit.",
    )


async def _chat_decision(message: str, timezone_name: str | None) -> ChatDecision:
    heuristic = _heuristic_chat_decision(message, timezone_name)
    system_prompt = (
        "You convert user messages into strict availability actions for a home schedule app. "
        "Return JSON only. Allowed kinds: apply_availability_change, ask_clarification, "
        "not_schedule_related. Never guess missing dates, times, or home/away state."
    )
    user_prompt = json.dumps(
        {
            "message": message,
            "today": _today_local(timezone_name).isoformat(),
            "timezone": timezone_name or "UTC",
            "rules": [
                "Only apply when date, time range, and home/away state are explicit enough.",
                "Support today, tomorrow, and explicit dates only.",
                "If uncertain, ask a clarifying question instead of guessing.",
                "Times must align to 30-minute increments.",
            ],
            "response_shape": {
                "kind": "apply_availability_change | ask_clarification | not_schedule_related",
                "summary": "string",
                "question_text": "string | null",
                "date": "YYYY-MM-DD | null",
                "start_slot": "integer | null",
                "end_slot": "integer | null",
                "set_home": "boolean | null",
                "reason": "string",
            },
        }
    )
    payload = await _gemma_json(system_prompt, user_prompt)
    if not payload:
        return heuristic
    kind = str(payload.get("kind") or "")
    if kind not in {
        "apply_availability_change",
        "ask_clarification",
        "not_schedule_related",
    }:
        return heuristic
    target_date = None
    raw_date = payload.get("date")
    if raw_date:
        try:
            target_date = date.fromisoformat(str(raw_date))
        except ValueError:
            return heuristic
    start_slot = payload.get("start_slot")
    end_slot = payload.get("end_slot")
    set_home = payload.get("set_home")
    if kind == "apply_availability_change":
        if (
            target_date is None
            or not isinstance(start_slot, int)
            or not isinstance(end_slot, int)
            or not isinstance(set_home, bool)
        ):
            return heuristic
        if start_slot < 0 or end_slot > SLOTS_PER_DAY or end_slot <= start_slot:
            return heuristic
    return ChatDecision(
        kind=kind,
        summary=str(payload.get("summary") or heuristic.summary),
        question_text=str(payload.get("question_text") or "") or None,
        target_date=target_date,
        start_slot=int(start_slot) if isinstance(start_slot, int) else None,
        end_slot=int(end_slot) if isinstance(end_slot, int) else None,
        set_home=set_home if isinstance(set_home, bool) else None,
        reason=str(payload.get("reason") or ""),
    )


def _apply_availability_action(
    *,
    user_id: str,
    target_date: date,
    start_slot: int,
    end_slot: int,
    set_home: bool,
    action_id: str | None = None,
    source: str,
    thread_id: str | None = None,
    reason: str | None = None,
    raw_user_message: str | None = None,
) -> tuple[DayAvailability, dict[str, Any]]:
    current = _get_day_slots(user_id, target_date)
    updated = apply_slot_change(current, start_slot, end_slot, set_home)
    day = _upsert_day_slots(user_id, target_date, updated)
    if action_id:
        row = _update_action(
            action_id,
            {
                "status": "applied",
                "set_home": set_home,
                "reason": reason,
                "question_text": None,
            },
        )
        if not row:
            row = _get_action(user_id, action_id) or {}
    else:
        row = _create_action(
            user_id=user_id,
            source=source,
            status="applied",
            target_date=target_date,
            start_slot=start_slot,
            end_slot=end_slot,
            set_home=set_home,
            reason=reason,
            thread_id=thread_id,
            raw_user_message=raw_user_message,
        )
    return day, row


async def sync_calendar_availability(
    user_id: str,
    provider_token: str | None = None,
    timezone_hint: str | None = None,
) -> CalendarSyncResponse:
    _ensure_onboarding_schema_ready(user_id)
    timezone_name = _timezone_for_user(user_id, timezone_hint)
    start_day = _today_local(timezone_name)
    days = [DayAvailability(date=start_day + timedelta(days=i), slots=default_slots_for_day(start_day + timedelta(days=i))) for i in range(7)]
    day_map = {item.date: list(item.slots) for item in days}
    clarifications: list[AvailabilityClarification] = []
    applied_count = 0
    question_count = 0

    _clear_pending_calendar_actions(user_id)

    if provider_token:
        try:
            events = fetch_events_for_local_days(
                provider_token,
                start_day,
                start_day + timedelta(days=7),
                timezone_name,
            )
        except PermissionError:
            raise CalendarSyncFailure(
                "google_calendar_scope_missing",
                "Google Calendar rejected the provider token. Verify the Google provider is enabled in Supabase and includes the calendar.readonly scope.",
                status_code=400,
            ) from None
        except Exception as exc:  # noqa: BLE001
            print(f"calendar sync error: {exc!s}", file=sys.stderr)  # noqa: T201
            raise CalendarSyncFailure(
                "google_calendar_unavailable",
                "Google Calendar sync failed while fetching events. Verify the backend is running and the Google OAuth configuration is complete.",
                status_code=502,
            ) from exc
        for target_date in list(day_map):
            for event in build_day_events_local(events, target_date, timezone_name):
                slot_range = slot_range_for_interval(
                    event.get("start"),
                    event.get("end"),
                    target_date,
                    timezone_name,
                )
                if slot_range is None:
                    continue
                start_slot, end_slot = slot_range
                decision = await _calendar_event_decision(event)
                if decision.state in {"home", "away"}:
                    day_map[target_date] = apply_slot_change(
                        day_map[target_date],
                        start_slot,
                        end_slot,
                        decision.state == "home",
                    )
                    _create_action(
                        user_id=user_id,
                        source="calendar_sync",
                        status="applied",
                        target_date=target_date,
                        start_slot=start_slot,
                        end_slot=end_slot,
                        set_home=(decision.state == "home"),
                        reason=decision.reason,
                        raw_user_message=event.get("summary") or None,
                    )
                    applied_count += 1
                    continue
                question = (
                    f"While analyzing your schedule, I found '{event.get('summary') or 'this event'}' on "
                    f"{target_date.isoformat()} from {_slot_window_label(start_slot, end_slot)} and couldn't tell "
                    "if you'd be home or away. Which should I use?"
                )
                row = _create_action(
                    user_id=user_id,
                    source="calendar_sync",
                    status="pending",
                    target_date=target_date,
                    start_slot=start_slot,
                    end_slot=end_slot,
                    question_text=question,
                    reason=decision.reason,
                    raw_user_message=event.get("summary") or None,
                )
                clarifications.append(_clarification_from_row(row))
                question_count += 1

    stored_days = [
        _upsert_day_slots(user_id, target_date, slots)
        for target_date, slots in sorted(day_map.items(), key=lambda item: item[0])
    ]
    if provider_token:
        summary = (
            f"I reviewed your next 7 days, confidently updated {applied_count} calendar blocks, "
            f"and left {question_count} clarification{'s' if question_count != 1 else ''}."
        )
    else:
        summary = "I set up a default workweek schedule for the next 7 days. You can connect Google Calendar later for smarter availability."
    return CalendarSyncResponse(days=stored_days, clarifications=clarifications, summary=summary)


def _reply_for_resolution(
    target_date: date,
    start_slot: int,
    end_slot: int,
    set_home: bool,
) -> str:
    return (
        f"Marked {target_date.isoformat()} from {_slot_window_label(start_slot, end_slot)} as "
        f"{'home' if set_home else 'away'}."
    )


async def respond_to_action(
    user_id: str,
    action_id: str,
    *,
    resolution: str | None = None,
    message: str | None = None,
) -> AvailabilityActionReplyResponse:
    action = _get_action(user_id, action_id)
    if action is None:
        raise ValueError("Availability action not found")
    if str(action.get("status")) != "pending":
        target_date = _row_date(action["date"])
        summary = _action_summary(
            status=str(action.get("status") or "applied"),
            action_id=str(action["id"]),
            affected_dates=[target_date],
            refresh_recommendations=True,
            summary="That availability item was already resolved.",
        )
        return AvailabilityActionReplyResponse(
            ok=True,
            reply=summary.summary,
            action=summary,
            clarification=None,
            days=[DayAvailability(date=target_date, slots=_get_day_slots(user_id, target_date))],
        )

    effective_resolution = resolution
    if effective_resolution is None and message:
        state = _state_from_text(message)
        if state == "home" or state == "yes":
            effective_resolution = "home"
        elif state == "away" or state == "no":
            effective_resolution = "away"
        elif state == "skip":
            effective_resolution = "skip"

    if effective_resolution == "skip":
        _update_action(str(action["id"]), {"status": "skipped"})
        target_date = _row_date(action["date"])
        summary = _action_summary(
            status="skipped",
            action_id=str(action["id"]),
            affected_dates=[target_date],
            refresh_recommendations=False,
            summary="Skipped that availability question and kept the existing schedule.",
        )
        return AvailabilityActionReplyResponse(
            ok=True,
            reply=summary.summary,
            action=summary,
            clarification=None,
            days=[DayAvailability(date=target_date, slots=_get_day_slots(user_id, target_date))],
        )

    if effective_resolution not in {"home", "away"}:
        clarification = _clarification_from_row(action)
        reply = clarification.question_text
        summary = _action_summary(
            status="pending",
            action_id=str(action["id"]),
            affected_dates=[clarification.date],
            refresh_recommendations=False,
            summary="I still need a home or away answer for that time block.",
        )
        return AvailabilityActionReplyResponse(
            ok=False,
            reply=reply,
            action=summary,
            clarification=clarification,
        )

    target_date = _row_date(action["date"])
    start_slot = int(action["start_slot"])
    end_slot = int(action["end_slot"])
    set_home = effective_resolution == "home"
    day, row = _apply_availability_action(
        user_id=user_id,
        target_date=target_date,
        start_slot=start_slot,
        end_slot=end_slot,
        set_home=set_home,
        action_id=str(action["id"]),
        source=str(action["source"]),
        reason=str(action.get("reason") or ""),
        thread_id=action.get("thread_id"),
    )
    reply = _reply_for_resolution(target_date, start_slot, end_slot, set_home)
    summary = _action_summary(
        status="applied",
        action_id=str(row.get("id") or action["id"]),
        affected_dates=[target_date],
        refresh_recommendations=True,
        summary=reply,
    )
    return AvailabilityActionReplyResponse(
        ok=True,
        reply=reply,
        action=summary,
        clarification=None,
        days=[day],
    )


async def handle_chat_message(
    user_id: str,
    message: str,
    thread_id: str | None,
    timezone_hint: str | None = None,
) -> ChatOutcome | None:
    pending = _pending_thread_action(user_id, thread_id)
    if pending is not None:
        response = await respond_to_action(
            user_id,
            str(pending["id"]),
            message=message,
        )
        return ChatOutcome(
            reply=response.reply,
            action=response.action,
            clarification=response.clarification,
        )

    timezone_name = _timezone_for_user(user_id, timezone_hint)
    decision = await _chat_decision(message, timezone_name)
    if decision.kind == "not_schedule_related":
        return None

    if decision.kind == "apply_availability_change":
        assert decision.target_date is not None
        assert decision.start_slot is not None
        assert decision.end_slot is not None
        assert decision.set_home is not None
        day, row = _apply_availability_action(
            user_id=user_id,
            target_date=decision.target_date,
            start_slot=decision.start_slot,
            end_slot=decision.end_slot,
            set_home=decision.set_home,
            source="chat_edit",
            thread_id=thread_id,
            reason=decision.reason,
            raw_user_message=message,
        )
        reply = _reply_for_resolution(
            decision.target_date,
            decision.start_slot,
            decision.end_slot,
            decision.set_home,
        )
        return ChatOutcome(
            reply=reply,
            action=_action_summary(
                status="applied",
                action_id=str(row.get("id") or ""),
                affected_dates=[day.date],
                refresh_recommendations=True,
                summary=reply,
            ),
        )

    if (
        decision.target_date is not None
        and decision.start_slot is not None
        and decision.end_slot is not None
    ):
        row = _create_action(
            user_id=user_id,
            source="chat_edit",
            status="pending",
            target_date=decision.target_date,
            start_slot=decision.start_slot,
            end_slot=decision.end_slot,
            question_text=decision.question_text,
            reason=decision.reason,
            thread_id=thread_id,
            raw_user_message=message,
        )
        clarification = _clarification_from_row(row)
        return ChatOutcome(
            reply=clarification.question_text,
            action=_action_summary(
                status="pending",
                action_id=clarification.action_id,
                affected_dates=[clarification.date],
                refresh_recommendations=False,
                summary=decision.summary,
            ),
            clarification=clarification,
        )

    return ChatOutcome(
        reply=decision.question_text or decision.summary,
        action=_action_summary(
            status="pending",
            action_id=None,
            affected_dates=[],
            refresh_recommendations=False,
            summary=decision.summary,
        ),
        clarification=None,
    )
