export interface DemoMonthComparisonAssumptions {
  // "Last month" assumes the user mostly ignored recommendations.
  lastMonthEstimatedBillUsd: number;
  // Carbon emissions estimate for that same baseline month.
  lastMonthEstimatedCo2Kg: number;
}

export const DEMO_MONTH_COMPARISON_ASSUMPTIONS: DemoMonthComparisonAssumptions = {
  lastMonthEstimatedBillUsd: 420,
  lastMonthEstimatedCo2Kg: 175,
};
