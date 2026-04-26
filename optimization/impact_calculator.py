import random

class ImpactTotals:
    def __init__(self, cost, emissions, energy_kwh):
        self.cost = cost
        self.emissions = emissions
        self.energy_kwh = energy_kwh


class ImpactReport:
    def __init__(self, baseline, optimized, savings_cost, savings_cost_pct, co2_reduction, co2_reduction_pct):
        self.baseline = baseline
        self.optimized = optimized
        self.savings_cost = savings_cost
        self.savings_cost_pct = savings_cost_pct
        self.co2_reduction = co2_reduction
        self.co2_reduction_pct = co2_reduction_pct


def is_starts_feasible(data, starts):
    horizon = len(data["timePeriods"])
    quiet = set(data.get("quietHours", []))
    load = [0.0] * horizon

    for appliance in data["appliances"]:
        start = starts.get(appliance["id"])
        if start is None:
            return False

        for dt in range(appliance["duration"]):
            t = start + dt

            if t < appliance["earliestStart"] or t >= appliance["latestFinish"] or t >= horizon:
                return False

            if appliance.get("isNoisy", False) and t in quiet:
                return False

            load[t] += appliance["powerKw"]
            if load[t] > data["circuitPowerLimit"] + 1e-9:
                return False

    return True


def generate_random_baseline_starts(data, max_attempts=500):
    for _ in range(max_attempts):
        starts = {}

        for appliance in data["appliances"]:
            latest_start = min(
                len(data["timePeriods"]) - appliance["duration"],
                appliance["latestFinish"] - appliance["duration"],
            )

            starts[appliance["id"]] = random.randint(
                appliance["earliestStart"], latest_start
            )

        if is_starts_feasible(data, starts):
            return starts

    raise Exception("Could not generate feasible baseline")


def starts_to_x(data, starts):
    horizon = len(data["timePeriods"])
    x = {}

    for appliance in data["appliances"]:
        start = starts[appliance["id"]]
        x[appliance["id"]] = [0] * horizon

        for dt in range(appliance["duration"]):
            x[appliance["id"]][start + dt] = 1

    return x


def compute_totals(data, x):
    slot_minutes = data.get("slotMinutes", 60)
    slot_hours = slot_minutes / 60

    cost = 0.0
    emissions = 0.0
    energy_kwh = 0.0

    for appliance in data["appliances"]:
        for t in data["timePeriods"]:
            if x[appliance["id"]][t] == 0:
                continue

            energy = appliance["powerKw"] * slot_hours
            energy_kwh += energy
            cost += data["prices"][t] * energy
            emissions += data["carbon"][t] * energy

    return ImpactTotals(cost, emissions, energy_kwh)


def compute_impact_report(data, optimized_x, baseline_starts=None):
    starts = baseline_starts or generate_random_baseline_starts(data)
    baseline_x = starts_to_x(data, starts)

    baseline = compute_totals(data, baseline_x)
    optimized = compute_totals(data, optimized_x)

    savings_cost = baseline.cost - optimized.cost
    co2_reduction = baseline.emissions - optimized.emissions

    savings_cost_pct = (savings_cost / baseline.cost * 100) if baseline.cost > 0 else 0
    co2_reduction_pct = (co2_reduction / baseline.emissions * 100) if baseline.emissions > 0 else 0

    return ImpactReport(
        baseline,
        optimized,
        savings_cost,
        savings_cost_pct,
        co2_reduction,
        co2_reduction_pct,
    )