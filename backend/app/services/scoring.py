"""Backend adapter for the custom PuLP optimizer in `optimization/`."""

from __future__ import annotations

from datetime import datetime, timedelta
from typing import Any, cast

from backend.app.models.schemas import (
    ApplianceConfig,
    RecommendationLabel,
    RecommendationOption,
    TimelineSlot,
    UserWeights,
)
from optimization.pulp_optimization_engine import MultiSolutionEngine

_EPS = 1e-9


def _run_usd(
    a: ApplianceConfig, start_slot: int, prices: list[float]
) -> float:
    t = 0.0
    for h in range(start_slot, start_slot + a.duration):
        t += 0.5 * a.powerKw * prices[h]
    return t


def _run_co2_grams(
    a: ApplianceConfig, start_slot: int, carbon: list[float]
) -> float:
    # carbon: kg CO2 / kWh -> grams
    kg = 0.0
    for h in range(start_slot, start_slot + a.duration):
        kg += 0.5 * a.powerKw * carbon[h]
    return max(0.0, kg * 1000.0)


def _mean_satisfaction(a: ApplianceConfig, start_slot: int) -> float:
    acc = 0.0
    for h in range(start_slot, start_slot + a.duration):
        acc += float(
            a.satisfactionByTime.get(str(h), 0.5)
        )
    return acc / max(a.duration, 1)


def score_slot(
    start_slot: int,
    appliance: ApplianceConfig,
    prices: list[float],
    carbon: list[float],
    weights: UserWeights,
) -> float:
    """Score a single start window using the same objective terms as the engine."""
    s_lo = appliance.earliestStart
    s_hi = appliance.latestFinish - appliance.duration
    if s_lo > s_hi or start_slot < s_lo or start_slot > s_hi:
        return 1.0
    cost_expr = sum(
        prices[t] * appliance.powerKw
        for t in range(start_slot, start_slot + appliance.duration)
    )
    emissions_expr = sum(
        carbon[t] * appliance.powerKw
        for t in range(start_slot, start_slot + appliance.duration)
    )
    satisfaction_expr = sum(
        float(appliance.satisfactionByTime.get(str(t), 0.0))
        for t in range(start_slot, start_slot + appliance.duration)
    )
    total_energy = appliance.powerKw * appliance.duration
    c_max = max(prices) * total_energy if total_energy > 0 else 1.0
    e_max = max(carbon) * total_energy if total_energy > 0 else 1.0
    s_max = appliance.duration or 1.0
    return (
        weights.cost * (cost_expr / (c_max + _EPS))
        - weights.satisfaction * (satisfaction_expr / (s_max + _EPS))
        + weights.emissions * (emissions_expr / (e_max + _EPS))
    )


def _slot_datetimes(
    base: datetime, start_slot: int, duration: int
) -> tuple[datetime, datetime]:
    start = base + timedelta(minutes=30 * start_slot)
    end = start + timedelta(minutes=30 * duration)
    return start, end


def _worst_baseline_usd(
    a: ApplianceConfig, prices: list[float]
) -> float:
    s_lo = a.earliestStart
    s_hi = a.latestFinish - a.duration
    if s_lo > s_hi:
        return 0.0
    return max(
        _run_usd(a, s, prices) for s in range(s_lo, s_hi + 1)
    )


def _worst_baseline_co2(
    a: ApplianceConfig, carbon: list[float]
) -> float:
    s_lo = a.earliestStart
    s_hi = a.latestFinish - a.duration
    if s_lo > s_hi:
        return 0.0
    return max(
        _run_co2_grams(a, s, carbon) for s in range(s_lo, s_hi + 1)
    )


def _optimizer_payload(
    appliances: list[ApplianceConfig],
    prices: list[float],
    carbon: list[float],
    weights: UserWeights,
    circuit_power_limit: float,
    quiet_hours: list[int],
) -> dict[str, Any]:
    return {
        "timePeriods": list(range(48)),
        "slotMinutes": 30,
        "prices": prices,
        "carbon": carbon,
        "circuitPowerLimit": circuit_power_limit,
        "quietHours": quiet_hours,
        "weights": {
            "cost": weights.cost,
            "satisfaction": weights.satisfaction,
            "emissions": weights.emissions,
        },
        "appliances": [
            {
                "id": a.id,
                "name": a.name,
                "duration": a.duration,
                "powerKw": a.powerKw,
                "earliestStart": a.earliestStart,
                "latestFinish": a.latestFinish,
                "isNoisy": a.isNoisy,
                "satisfactionByTime": a.satisfactionByTime,
            }
            for a in appliances
        ],
    }


def _solution_start_map(solution: dict[str, Any]) -> dict[str, int]:
    return {
        str(item["applianceId"]): int(item["startTime"])
        for item in solution.get("schedule", [])
        if "applianceId" in item and "startTime" in item
    }


def generate_three_options(
    appliances: list[ApplianceConfig],
    prices: list[float],
    carbon: list[float],
    weights: UserWeights,
    circuit_power_limit: float,
    quiet_hours: list[int],
    base_datetime: datetime,
) -> dict[str, list[RecommendationOption]]:
    """
    Build three options from `optimization.MultiSolutionEngine`.

    The optimization algorithm itself is the custom engine from the
    `optimization/` directory: s/x variables, non-interruptibility constraints,
    circuit/quiet-hour constraints, and top-k no-good cuts.
    """
    if len(prices) != 48 or len(carbon) != 48:
        raise ValueError("prices and carbon must have length 48")
    if not appliances:
        return {}
    order: tuple[RecommendationLabel, ...] = (
        "best",
        "balanced",
        "convenient",
    )
    result = MultiSolutionEngine().solve(
        _optimizer_payload(
            appliances,
            prices,
            carbon,
            weights,
            circuit_power_limit,
            quiet_hours,
        ),
        top_k=3,
    )
    solutions = list(result.get("solutions", []))
    if not solutions:
        result = MultiSolutionEngine().solve(
            _optimizer_payload(
                appliances,
                prices,
                carbon,
                weights,
                max(circuit_power_limit, 1e6),
                [],
            ),
            top_k=3,
        )
        solutions = list(result.get("solutions", []))
    why_map: dict[RecommendationLabel, str] = {
        "best": "Top-ranked schedule from the custom PuLP optimizer.",
        "balanced": "Second diverse schedule from the custom PuLP optimizer.",
        "convenient": "Third diverse schedule from the custom PuLP optimizer.",
    }
    out: dict[str, list[RecommendationOption]] = {}
    for a in appliances:
        row: list[RecommendationOption] = []
        last_start = a.earliestStart
        for idx, m in enumerate(order):
            sol = solutions[idx] if idx < len(solutions) else None
            sol_m = _solution_start_map(sol) if isinstance(sol, dict) else {}
            if a.id in sol_m:
                start_slot = sol_m[a.id]
                last_start = start_slot
                base_why = why_map[m]
            else:
                start_slot = last_start
                base_why = "Best available given your schedule."
            c_usd = _run_usd(a, start_slot, prices)
            g_g = _run_co2_grams(a, start_slot, carbon)
            w_usd = _worst_baseline_usd(a, prices)
            w_g = _worst_baseline_co2(a, carbon)
            sc = score_slot(start_slot, a, prices, carbon, weights)
            st, en = _slot_datetimes(base_datetime, start_slot, a.duration)
            slot = TimelineSlot(
                start=st,
                end=en,
                appliance=a.id,
                cost_usd=c_usd,
                co2_grams=g_g,
                score=sc,
            )
            row.append(
                RecommendationOption(
                    label=cast(RecommendationLabel, m),
                    slot=slot,
                    savings_vs_baseline_usd=max(0.0, w_usd - c_usd),
                    co2_reduction_grams=max(0.0, w_g - g_g),
                    why=base_why,
                )
            )
        out[a.id] = row
    return out


if __name__ == "__main__":
    from backend.app.models.schemas import ApplianceConfig, UserWeights
    from backend.app.services.external_data import get_mock_external_data

    _ed = get_mock_external_data("85718", "2026-04-26")
    _w = UserWeights(cost=0.4, emissions=0.2, satisfaction=0.4)
    _base = datetime(2026, 4, 26, 0, 0, 0)

    _opts = generate_three_options(
        [
            ApplianceConfig(
                id="dishwasher",
                name="Dishwasher",
                duration=4,
                powerKw=1.3,
                earliestStart=34,
                latestFinish=44,
                isNoisy=True,
                satisfactionByTime={"39": 1.0, "38": 0.946},
            )
        ],
        _ed.prices,
        _ed.carbon,
        _w,
        7.2,
        [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 44, 45, 46, 47],
        _base,
    )
    for _app_id, _lst in _opts.items():
        for _o in _lst:
            print(_o.label, _o.slot.start, _o.savings_vs_baseline_usd)
