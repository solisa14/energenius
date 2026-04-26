import json
from impact_calculator import compute_impact_report
from pulp_optimization_engine import MultiSolutionEngine

# Load data
with open("mockScheduleData.json") as f:
    data = json.load(f)

# Run optimization
engine = MultiSolutionEngine()
result = engine.solve(data, top_k=1)

optimized_x = result["solutions"][0]["x"]

# Compute impact
report = compute_impact_report(data, optimized_x)

# Print results
print("\n===== BASELINE =====")
print(f"Cost: {report.baseline.cost:.2f}")
print(f"CO2: {report.baseline.emissions:.2f}")
print(f"Energy: {report.baseline.energy_kwh:.2f} kWh")

print("\n===== OPTIMIZED =====")
print(f"Cost: {report.optimized.cost:.2f}")
print(f"CO2: {report.optimized.emissions:.2f}")
print(f"Energy: {report.optimized.energy_kwh:.2f} kWh")

print("\n===== SAVINGS =====")
print(f"Money Saved: {report.savings_cost:.2f}")
print(f"Money Saved %: {report.savings_cost_pct:.1f}%")
print(f"CO2 Reduced: {report.co2_reduction:.2f}")
print(f"CO2 Reduced %: {report.co2_reduction_pct:.1f}%")