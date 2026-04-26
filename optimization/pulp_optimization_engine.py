from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import pulp


@dataclass
class Appliance:
    id: str
    name: str
    duration: int
    power_kw: float
    earliest_start: int
    latest_finish: int
    is_noisy: bool
    requires_presence: bool
    satisfaction_by_time: dict[int, float]


@dataclass
class Weights:
    cost: float
    satisfaction: float
    emissions: float


class MultiSolutionEngine:
    """MILP-based optimization engine for appliance scheduling using PuLP.

    Supports generating the top-k diverse optimal/near-optimal solutions via
    no-good cuts: after each solve the chosen start assignments are forbidden
    from all appearing together again, forcing the next iteration to find a
    genuinely different schedule.
    """

    def solve(self, data: dict[str, Any], top_k: int = 1) -> dict[str, Any]:
        """Solve and return up to *top_k* diverse schedules.

        Parameters
        ----------
        data:
            The problem dictionary (same schema as before).
        top_k:
            How many alternative solutions to generate.  The first entry is
            the global optimum; subsequent entries are the best schedules that
            do not repeat any previously found combination of start times.

        Returns
        -------
        A dict with a ``"solutions"`` list (length ≤ top_k).  Each entry has
        the same keys as the original single-solution return value, plus a
        ``"rank"`` field (1-indexed).  If fewer than top_k feasible distinct
        solutions exist the list is simply shorter.
        """
        if top_k < 1:
            raise ValueError("top_k must be >= 1")

        time_periods: list[int] = data["timePeriods"]
        prices: list[float] = data["prices"]
        carbon: list[float] = data["carbon"]
        circuit_limit: float = data["circuitPowerLimit"]
        quiet_hours: set[int] = set(data.get("quietHours", []))
        availability: list[bool] = [bool(x) for x in data.get("availability", [True] * len(time_periods))]

        weights = Weights(**data["weights"])
        appliances = [self._parse_appliance(a) for a in data["appliances"]]

        self._validate_inputs(time_periods, prices, carbon, appliances, weights, availability)

        horizon = len(time_periods)

        # ------------------------------------------------------------------
        # Build the base problem (constraints that never change across runs)
        # ------------------------------------------------------------------
        prob = pulp.LpProblem("Household_Appliance_Scheduling", pulp.LpMinimize)

        # Decision variables ------------------------------------------------
        s = {
            (a.id, t): pulp.LpVariable(f"s_{a.id}_{t}", cat=pulp.LpBinary)
            for a in appliances
            for t in time_periods
        }
        x = {
            (a.id, t): pulp.LpVariable(f"x_{a.id}_{t}", cat=pulp.LpBinary)
            for a in appliances
            for t in time_periods
        }

        # 1) Non-interruptibility: x[a,t] = Σ s[a,τ] for τ in [t-D+1, t]
        for a in appliances:
            for t in time_periods:
                start_low = max(0, t - a.duration + 1)
                candidate_taus = [
                    tau for tau in range(start_low, t + 1) if tau in time_periods
                ]
                prob += x[(a.id, t)] == pulp.lpSum(
                    s[(a.id, tau)] for tau in candidate_taus
                )

        # 2) Single execution: exactly one start per appliance
        for a in appliances:
            prob += pulp.lpSum(s[(a.id, t)] for t in time_periods) == 1

        # 3) Time-window: forbid starts outside [earliestStart, latestStart]
        for a in appliances:
            latest_start = a.latest_finish - a.duration
            for t in time_periods:
                if not (a.earliest_start <= t <= latest_start):
                    prob += s[(a.id, t)] == 0

        # 4) Circuit power limit each time slot
        for t in time_periods:
            prob += (
                pulp.lpSum(a.power_kw * x[(a.id, t)] for a in appliances)
                <= circuit_limit
            )

        # 5) Quiet hours for noisy appliances
        for a in appliances:
            if a.is_noisy:
                for t in quiet_hours:
                    if t in time_periods:
                        prob += x[(a.id, t)] == 0

        # 6) Presence constraint for appliances that require the user to be home
        for a in appliances:
            if a.requires_presence:
                for t in time_periods:
                    if not availability[t]:
                        prob += x[(a.id, t)] == 0

        # Objective ---------------------------------------------------------
        c_expr = pulp.lpSum(
            prices[t] * a.power_kw * x[(a.id, t)]
            for a in appliances
            for t in time_periods
        )
        s_expr = pulp.lpSum(
            a.satisfaction_by_time.get(t, 0.0) * x[(a.id, t)]
            for a in appliances
            for t in time_periods
        )
        e_expr = pulp.lpSum(
            carbon[t] * a.power_kw * x[(a.id, t)]
            for a in appliances
            for t in time_periods
        )

        total_energy = sum(a.power_kw * a.duration for a in appliances)
        c_max = max(prices) * total_energy if total_energy > 0 else 1.0
        e_max = max(carbon) * total_energy if total_energy > 0 else 1.0
        s_max = sum(a.duration for a in appliances) or 1.0

        c_n = c_expr / c_max
        s_n = s_expr / s_max
        e_n = e_expr / e_max

        objective = (
            (weights.cost * c_n)
            - (weights.satisfaction * s_n)
            + (weights.emissions * e_n)
        )
        prob += objective

        # ------------------------------------------------------------------
        # Iterative solve with no-good cuts
        # ------------------------------------------------------------------
        solutions: list[dict[str, Any]] = []

        for rank in range(1, top_k + 1):
            status = prob.solve(pulp.PULP_CBC_CMD(msg=False))

            if pulp.LpStatus[status] != "Optimal":
                # No more feasible distinct solutions exist — stop early
                break

            # Extract solution ----------------------------------------------
            x_out: dict[str, list[int]] = {}
            s_out: dict[str, list[int]] = {}
            schedule = []

            # Collect the start slot chosen for each appliance in this solution.
            chosen_starts: list[tuple[str, int]] = []

            for a in appliances:
                x_out[a.id] = [
                    int(round(pulp.value(x[(a.id, t)]))) for t in time_periods
                ]
                s_out[a.id] = [
                    int(round(pulp.value(s[(a.id, t)]))) for t in time_periods
                ]

                start_time = next(
                    t for t in time_periods if s_out[a.id][t] == 1
                )
                run_periods = [t for t in time_periods if x_out[a.id][t] == 1]
                schedule.append(
                    {
                        "applianceId": a.id,
                        "startTime": start_time,
                        "runPeriods": run_periods,
                    }
                )
                chosen_starts.append((a.id, start_time))

            cost = float(pulp.value(c_expr))
            satisfaction = float(pulp.value(s_expr))
            emissions = float(pulp.value(e_expr))

            solutions.append(
                {
                    "rank": rank,
                    "schedule": schedule,
                    "x": x_out,
                    "s": s_out,
                    "objective": {
                        "cost": cost,
                        "satisfaction": satisfaction,
                        "emissions": emissions,
                        "normalizedCost": cost / c_max,
                        "normalizedSatisfaction": satisfaction / s_max,
                        "normalizedEmissions": emissions / e_max,
                        "weightedObjective": float(pulp.value(objective)),
                    },
                    "solver": "PuLP (CBC)",
                    "status": pulp.LpStatus[status],
                }
            )

            if rank < top_k:
                # ----------------------------------------------------------
                # Per-appliance hard exclusion cuts.
                #
                # For every appliance, forbid the exact start slot it was
                # assigned in this solution:
                #   s[a, prev_start] == 0   for each appliance a
                #
                # This guarantees that in every subsequent solution EVERY
                # appliance runs at a different start time — not just one.
                # ----------------------------------------------------------
                for aid, prev_start in chosen_starts:
                    prob += s[(aid, prev_start)] == 0

        return {"solutions": solutions}

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _parse_appliance(raw: dict[str, Any]) -> Appliance:
        satisfaction = {
            int(k): float(v) for k, v in raw["satisfactionByTime"].items()
        }
        return Appliance(
            id=raw["id"],
            name=raw.get("name", raw["id"]),
            duration=int(raw["duration"]),
            power_kw=float(raw["powerKw"]),
            earliest_start=int(raw["earliestStart"]),
            latest_finish=int(raw["latestFinish"]),
            is_noisy=bool(raw.get("isNoisy", False)),
            requires_presence=bool(raw.get("requiresPresence", False)),
            satisfaction_by_time=satisfaction,
        )

    @staticmethod
    def _validate_inputs(
        time_periods: list[int],
        prices: list[float],
        carbon: list[float],
        appliances: list[Appliance],
        weights: Weights,
        availability: list[bool],
    ) -> None:
        horizon = len(time_periods)
        if len(prices) != horizon or len(carbon) != horizon:
            raise ValueError(
                "prices and carbon arrays must match the time horizon"
            )
        if len(availability) != horizon:
            raise ValueError("availability must match the time horizon")

        if sorted(time_periods) != list(range(horizon)):
            raise ValueError(
                "timePeriods must be contiguous 0..T-1 for this model"
            )

        weight_sum = weights.cost + weights.satisfaction + weights.emissions
        if abs(weight_sum - 1.0) > 1e-9:
            raise ValueError("weights must sum to 1")

        for a in appliances:
            if a.duration <= 0:
                raise ValueError(f"{a.id}: duration must be > 0")
            if a.latest_finish - a.earliest_start < a.duration:
                raise ValueError(f"{a.id}: infeasible time window")
