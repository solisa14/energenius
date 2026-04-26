import CountUp from "react-countup";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useRecommendations } from "@/hooks/useRecommendations";

const TODAY_BASELINE_USD = 4.81;

function MetricCell({
  label,
  caption,
  children,
}: {
  label: string;
  caption: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-overline text-muted-foreground">{label}</span>
      <div className="text-display text-foreground tabular-nums leading-none">
        {children}
      </div>
      <span className="text-caption text-muted-foreground">{caption}</span>
    </div>
  );
}

export function SavingsImpactPanel() {
  const { data, isLoading, error } = useRecommendations();

  if (isLoading) {
    return (
      <Card>
        <Skeleton className="h-7 w-40" />
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="flex flex-col gap-2">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-10 w-32" />
              <Skeleton className="h-3 w-28" />
            </div>
          ))}
        </div>
      </Card>
    );
  }

  if (error || !data) {
    return (
      <Card>
        <p className="text-body-sm text-muted-foreground">
          Couldn't load impact summary.
        </p>
      </Card>
    );
  }

  const { totals } = data;
  const todayCost = totals.total_daily_cost_usd ?? 0;
  const monthlySavings = totals.estimated_monthly_savings_usd ?? 0;
  const co2Today = totals.co2_reduction_grams_today ?? 0;
  const co2MonthlyKg = (totals.co2_reduction_grams_monthly ?? 0) / 1000;

  return (
    <Card>
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <h2 className="text-h2 text-foreground">Your Impact</h2>
        <span className="text-caption text-muted-foreground">
          Updates as you choose recommendations
        </span>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCell label="Today's Cost" caption={`vs $${TODAY_BASELINE_USD.toFixed(2)} baseline`}>
          <CountUp
            end={todayCost}
            duration={0.6}
            decimals={2}
            prefix="$"
            preserveValue
            useEasing
          />
        </MetricCell>
        <MetricCell label="Monthly Savings" caption="projected">
          <CountUp
            end={monthlySavings}
            duration={0.6}
            decimals={2}
            prefix="$"
            preserveValue
            useEasing
          />
        </MetricCell>
        <MetricCell label="CO₂ Today" caption="saved vs baseline">
          <>
            <CountUp end={co2Today} duration={0.6} preserveValue useEasing /> g
          </>
        </MetricCell>
        <MetricCell label="CO₂ Monthly" caption="= 0.6 trees planted">
          <>
            <CountUp end={co2MonthlyKg} duration={0.6} decimals={1} preserveValue useEasing /> kg
          </>
        </MetricCell>
      </div>

    </Card>
  );
}