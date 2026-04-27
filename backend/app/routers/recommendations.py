"""
GET /api/recommendations?date=yyyy-mm-dd

Data flow: JWT -> profile/appliances/availability -> mock external data ->
`generate_three_options` (PuLP) -> `hvac_schedule` -> grid mix -> `DailyRecommendation`.
"""
from __future__ import annotations

import json
from datetime import date, datetime, timezone
from typing import Any, cast

from fastapi import APIRouter, Depends, HTTPException, Query

from backend.app.auth import get_current_user_id
from backend.app.database import get_supabase
from backend.app.models.schemas import (
    ApplianceConfig,
    ApplianceName,
    ApplianceRecommendation,
    DailyRecommendation,
    GridMixSnapshot,
    SavingsSummary,
    UserWeights,
)
from backend.app.services.external_data import get_grid_mix_now, get_mock_external_data
from backend.app.services.calendar_parser import default_slots_for_day
from backend.app.services.hvac import hvac_schedule
from backend.app.services.scoring import generate_three_options

router = APIRouter()

_DEFAULT_ZIP = "85718"


def _satisfaction_map(raw: object) -> dict[str, float]:
    if raw is None:
        return {str(i): 0.7 for i in range(48)}
    if isinstance(raw, str):
        try:
            raw = json.loads(raw)
        except json.JSONDecodeError:
            return {str(i): 0.7 for i in range(48)}
    if isinstance(raw, dict):
        return {str(k): float(v) for k, v in raw.items()}
    return {str(i): 0.7 for i in range(48)}


def _appliance_id(row: dict[str, Any]) -> str:
    raw_id = str(row.get("id", ""))
    name = str(row.get("name") or raw_id)
    normalized = name.strip().lower().replace("-", "_").replace(" ", "_")
    aliases = {
        "dishwasher": "dishwasher",
        "washer": "washing_machine",
        "washing_machine": "washing_machine",
        "dryer": "dryer",
        "ev": "ev_charger",
        "ev_charger": "ev_charger",
        "water_heater": "water_heater_boost",
        "water_heater_boost": "water_heater_boost",
    }
    return aliases.get(normalized, raw_id)


def _row_to_config(row: dict[str, Any]) -> ApplianceConfig:
    duration = row.get("duration")
    if duration is None:
        duration_hours = float(row.get("duration_hours", 2.0))
        duration = max(1, round(duration_hours * 2))
    earliest_start = int(row.get("earliest_start", 0))
    latest_finish = int(row.get("latest_finish", 48))
    return ApplianceConfig(
        id=_appliance_id(row),
        name=str(row.get("name", "")),
        duration=int(duration),
        powerKw=float(row["power_kw"]),
        earliestStart=earliest_start,
        latestFinish=latest_finish,
        isNoisy=bool(row.get("is_noisy", False)),
        requiresPresence=bool(row.get("requires_presence", False)),
        satisfactionByTime=_satisfaction_map(row.get("satisfaction_by_time")),
    )


def _default_appliances() -> list[ApplianceConfig]:
    base = {str(i): 0.7 for i in range(48)}
    return [
        ApplianceConfig(
            id="dishwasher",
            name="Dishwasher",
            duration=4,
            powerKw=1.3,
            earliestStart=34,
            latestFinish=44,
            isNoisy=True,
            requiresPresence=True,
            satisfactionByTime=dict(base),
        ),
        ApplianceConfig(
            id="ev_charger",
            name="EV charger",
            duration=8,
            powerKw=1.9,
            earliestStart=0,
            latestFinish=16,
            isNoisy=False,
            requiresPresence=False,
            satisfactionByTime=dict(base),
        ),
        ApplianceConfig(
            id="water_heater_boost",
            name="Water heater",
            duration=4,
            powerKw=2.0,
            earliestStart=20,
            latestFinish=40,
            isNoisy=False,
            requiresPresence=False,
            satisfactionByTime=dict(base),
        ),
    ]


def _normalize_weights(
    c: float, e: float, s: float
) -> UserWeights:
    t = c + e + s
    if t <= 0:
        return UserWeights(cost=0.4, emissions=0.2, satisfaction=0.4)
    return UserWeights(
        cost=c / t, emissions=e / t, satisfaction=s / t
    )


@router.get("/recommendations", response_model=DailyRecommendation)
def get_recommendations(
    date_param: date | None = Query(
        None, alias="date", description="ISO date; default today (UTC)"
    ),
    user_id: str = Depends(get_current_user_id),
) -> DailyRecommendation:
    supabase = get_supabase()
    d = date_param or datetime.now(tz=timezone.utc).date()
    date_iso = d.isoformat()

    prof_res = (
        supabase.table("profiles")
        .select("*")
        .eq("id", user_id)
        .limit(1)
        .execute()
    )
    prof_rows = list(prof_res.data or [])
    profile: dict[str, Any] = (
        cast(dict[str, Any], prof_rows[0]) if prof_rows else {}
    )
    c_w = float(profile.get("cost_weight", 0.4))
    e_w = float(profile.get("emissions_weight", profile.get("carbon_weight", 0.2)))
    s_w = float(
        profile.get("satisfaction_weight", profile.get("comfort_weight", 0.4))
    )
    weights = _normalize_weights(c_w, e_w, s_w)
    t_min = int(profile.get("t_min_f", 68))
    t_max = int(profile.get("t_max_f", 76))
    home_zip = str(profile.get("home_zip") or _DEFAULT_ZIP)
    circuit = float(profile.get("circuit_power_limit", 7.2))
    qh = profile.get("quiet_hours")
    if not isinstance(qh, list) or not qh:
        qh = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 44, 45, 46, 47]
    quiet_list = [int(x) for x in qh]

    a_res = (
        supabase.table("appliances")
        .select("*")
        .eq("user_id", user_id)
        .eq("enabled", True)
        .execute()
    )
    rows = list(a_res.data or [])
    apps = [_row_to_config(r) for r in rows] if rows else _default_appliances()

    av_res = (
        supabase.table("availability")
        .select("*")
        .eq("user_id", user_id)
        .eq("date", date_iso)
        .execute()
    )
    ar = (av_res.data or [])
    if ar:
        slot_row = ar[0].get("slots")
        if isinstance(slot_row, list) and len(slot_row) == 48:
            availability = [bool(x) for x in slot_row]
        else:
            availability = default_slots_for_day(d)
    else:
        availability = default_slots_for_day(d)

    ed = get_mock_external_data(home_zip, date_iso)
    opts = generate_three_options(
        apps,
        ed.prices,
        ed.carbon,
        weights,
        circuit,
        quiet_list,
        d,
        availability,
    )
    ar_list: list[ApplianceRecommendation] = []
    for cfg in apps:
        triple = opts.get(cfg.id) or []
        if len(triple) != 3:
            continue
        ar_list.append(
            ApplianceRecommendation(
                appliance=cast(ApplianceName, cfg.id),
                duration=cfg.duration,
                powerKw=cfg.powerKw,
                options=triple,
            )
        )

    hv = hvac_schedule(
        [float(x) for x in ed.hourly_temp_f],
        t_min,
        t_max,
        availability,
        date_iso,
    )
    grid: GridMixSnapshot = dict(get_grid_mix_now(home_zip))

    total_cost = 0.0
    save_sum = 0.0
    co2_today = 0.0
    for cfg in apps:
        ts = opts.get(cfg.id) or []
        if not ts:
            continue
        best = ts[0]
        total_cost += best.slot.cost_usd
        save_sum += best.savings_vs_baseline_usd
        co2_today += best.co2_reduction_grams

    totals = SavingsSummary(
        total_daily_cost_usd=total_cost,
        estimated_monthly_savings_usd=save_sum * 30.0,
        co2_reduction_grams_today=co2_today,
        co2_reduction_grams_monthly=co2_today * 30.0,
    )
    return DailyRecommendation(
        date=d,
        appliances=ar_list,
        hvac_schedule=hv,
        grid_mix_now=grid,
        totals=totals,
    )
