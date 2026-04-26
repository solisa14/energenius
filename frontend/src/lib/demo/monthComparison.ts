import { DEMO_MONTH_COMPARISON_ASSUMPTIONS } from "@/lib/demo/monthComparisonAssumptions";

interface DemoMonthComparison {
  savingsPercentVsLastMonth: number;
  co2PercentVsLastMonth: number;
}

function clampPercent(value: number): number {
  return Math.max(0, Math.min(99, value));
}

function computeReductionPercent(
  reductionAmount: number,
  baselineAmount: number,
): number {
  if (baselineAmount <= 0) return 0;
  return clampPercent((reductionAmount / baselineAmount) * 100);
}

export function getDemoMonthComparison(
  monthlySavingsUsd: number,
  monthlyCo2ReductionKg: number,
): DemoMonthComparison {
  const { lastMonthEstimatedBillUsd, lastMonthEstimatedCo2Kg } =
    DEMO_MONTH_COMPARISON_ASSUMPTIONS;

  return {
    savingsPercentVsLastMonth: computeReductionPercent(
      monthlySavingsUsd,
      lastMonthEstimatedBillUsd,
    ),
    co2PercentVsLastMonth: computeReductionPercent(
      monthlyCo2ReductionKg,
      lastMonthEstimatedCo2Kg,
    ),
  };
}

export function formatPercentBadge(value: number): string {
  const rounded = Math.round(value);
  return `+${rounded}% vs last month`;
}
