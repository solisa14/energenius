import { useRef, useState, type MouseEvent, type ReactNode } from "react";
import { Bar, BarChart, ResponsiveContainer, Tooltip } from "recharts";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useRecommendations } from "@/hooks/useRecommendations";
import { synthesizeDailySeries, type DailyPoint } from "@/lib/charts/synthesizeHistory";
import { formatPercentBadge, getDemoMonthComparison } from "@/lib/demo/monthComparison";
import { cn } from "@/lib/utils";

type BadgeTone = "yellow" | "green";

interface StatCardProps {
  label: string;
  metric: string;
  badgeText: string;
  badgeTone: BadgeTone;
  series: DailyPoint[];
  chartType?: "pie" | "bar";
  barColor?: string;
  tooltipSeriesName?: string;
  tooltipValueFormatter?: (value: number) => string;
  caption: string;
  explanation: ReactNode;
}

function polarToCartesian(cx: number, cy: number, radius: number, angleDeg: number) {
  const angleRad = (Math.PI / 180) * (angleDeg - 90);
  return {
    x: cx + radius * Math.cos(angleRad),
    y: cy + radius * Math.sin(angleRad),
  };
}

function coxcombSlicePath(
  cx: number,
  cy: number,
  radius: number,
  startAngle: number,
  endAngle: number,
) {
  if (radius <= 0) return "";
  const start = polarToCartesian(cx, cy, radius, startAngle);
  const end = polarToCartesian(cx, cy, radius, endAngle);
  const largeArcFlag = endAngle - startAngle > 180 ? 1 : 0;
  return `M ${cx} ${cy} L ${start.x} ${start.y} A ${radius} ${radius} 0 ${largeArcFlag} 1 ${end.x} ${end.y} Z`;
}

function StatCard({
  label,
  metric,
  badgeText,
  badgeTone,
  series,
  chartType = "pie",
  barColor = "hsl(var(--accent-secondary))",
  tooltipSeriesName = "Metric",
  tooltipValueFormatter = (value) => value.toFixed(2),
  caption,
  explanation,
}: StatCardProps) {
  const [open, setOpen] = useState(false);
  const [sliceTooltip, setSliceTooltip] = useState<{
    day: string;
    value: number;
    x: number;
    y: number;
  } | null>(null);
  const chartWrapRef = useRef<HTMLDivElement>(null);
  const values = series.map((point) => point.value);
  const maxValue = Math.max(...values, 1);

  const badgeClasses = cn(
    "inline-flex items-center rounded-sm px-2 py-1 text-caption font-semibold whitespace-nowrap",
    badgeTone === "yellow" && "bg-accent-primary text-accent-primary-foreground",
    badgeTone === "green" && "bg-accent-secondary text-accent-secondary-foreground",
  );

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="block h-full w-full text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-secondary focus-visible:ring-offset-2 rounded-lg"
        aria-label={`${label}: ${metric}. Open explanation.`}
      >
        <Card className="h-full hover:shadow-level-2 transition-shadow duration-200 ease-in-out cursor-pointer">
          <div className="flex items-start justify-between gap-3">
            <span className="text-overline text-muted-foreground">{label}</span>
            <span className={badgeClasses}>{badgeText}</span>
          </div>

          {chartType === "pie" ? (
            <div className="mt-4 flex justify-center">
              <div className="relative h-56 w-56" ref={chartWrapRef} aria-hidden="true">
                <svg viewBox="0 0 240 240" className="h-full w-full">
                  <circle
                    cx="120"
                    cy="120"
                    r="119"
                    fill="none"
                    stroke="hsl(var(--border))"
                    strokeWidth="2"
                  />
                  {values.map((value, i) => {
                    const sliceAngle = 360 / values.length;
                    const gap = Math.min(1.5, sliceAngle * 0.2);
                    const startAngle = i * sliceAngle + gap / 2;
                    const endAngle = (i + 1) * sliceAngle - gap / 2;
                    const radius = (value / maxValue) * 120;
                    const path = coxcombSlicePath(120, 120, radius, startAngle, endAngle);
                    if (!path) return null;
                    return (
                      <path
                        key={`${series[i].day}-${i}`}
                        d={path}
                        fill="hsl(var(--accent-secondary))"
                        stroke="hsl(var(--border))"
                        strokeWidth={1}
                        onMouseMove={(e: MouseEvent<SVGPathElement>) => {
                          const box = chartWrapRef.current?.getBoundingClientRect();
                          if (!box) return;
                          setSliceTooltip({
                            day: `Day ${i + 1}`,
                            value,
                            x: e.clientX - box.left,
                            y: e.clientY - box.top,
                          });
                        }}
                        onMouseLeave={() => setSliceTooltip(null)}
                      />
                    );
                  })}
                </svg>
                {sliceTooltip && (
                  <div
                    className="pointer-events-none absolute z-10 w-max max-w-[min(90vw,280px)] whitespace-nowrap rounded-md border border-border bg-popover px-2 py-1 text-xs text-popover-foreground shadow-md"
                    style={{
                      left: Math.min(Math.max(sliceTooltip.x + 10, 8), 184),
                      top: Math.min(Math.max(sliceTooltip.y - 48, 8), 200),
                    }}
                  >
                    <div className="font-medium">{sliceTooltip.day}</div>
                    <div>Daily savings: ${sliceTooltip.value.toFixed(2)}</div>
                  </div>
                )}
                <div className="absolute inset-[26%] flex items-center justify-center rounded-full border border-border bg-card px-2 text-center">
                  <span className="text-h2 text-foreground tabular-nums">{metric}</span>
                </div>
              </div>
            </div>
          ) : (
            <>
              <div className="text-display text-foreground mt-3 tabular-nums">{metric}</div>
              <div className="mt-6 h-16 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={series} barCategoryGap={2}>
                    <Tooltip
                      cursor={{ fill: "hsl(var(--muted))" }}
                      contentStyle={{
                        background: "hsl(var(--popover))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: 8,
                        fontSize: 12,
                        whiteSpace: "nowrap",
                        maxWidth: "none",
                      }}
                      formatter={(v: number) => [
                        tooltipValueFormatter(v),
                        tooltipSeriesName,
                      ]}
                      labelFormatter={() => ""}
                    />
                    <Bar dataKey="value" fill={barColor} radius={[2, 2, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </>
          )}
          <div className="mt-1 flex justify-between text-caption text-text-tertiary">
            <span>{chartType === "pie" ? "Day 1" : "14d ago"}</span>
            <span>{chartType === "pie" ? `Day ${series.length}` : "Today"}</span>
          </div>

          <p className="text-caption text-muted-foreground mt-4">{caption}</p>
        </Card>
      </button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>How we calculate this</SheetTitle>
            <SheetDescription>{label}</SheetDescription>
          </SheetHeader>
          <div className="mt-6 space-y-4 text-body text-foreground">{explanation}</div>
          <a
            href="#"
            className="mt-6 inline-block text-body-sm font-medium text-foreground underline"
            // TODO: wire to raw data view in a later phase
            onClick={(e) => e.preventDefault()}
          >
            View raw data →
          </a>
        </SheetContent>
      </Sheet>
    </>
  );
}

function StatCardSkeleton() {
  return (
    <Card>
      <div className="flex items-start justify-between gap-3">
        <Skeleton className="h-3 w-40" />
        <Skeleton className="h-6 w-28 rounded-sm" />
      </div>
      <Skeleton className="h-10 w-32 mt-3" />
      <Skeleton className="h-16 w-full mt-6" />
      <div className="mt-1 flex justify-between">
        <Skeleton className="h-3 w-12" />
        <Skeleton className="h-3 w-10" />
      </div>
      <Skeleton className="h-3 w-48 mt-4" />
    </Card>
  );
}

function ErrorCard({ onRetry }: { onRetry: () => void }) {
  return (
    <Card>
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-overline text-destructive">Couldn't load</div>
          <p className="text-body-sm text-muted-foreground mt-2">
            We couldn't load your stats. Please try again.
          </p>
        </div>
        <Button size="sm" variant="secondary" onClick={onRetry}>
          Retry
        </Button>
      </div>
    </Card>
  );
}

export function StatCardsRow() {
  const { data, isLoading, error, refetch } = useRecommendations();

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <StatCardSkeleton />
        <StatCardSkeleton />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <ErrorCard onRetry={() => refetch()} />
        <ErrorCard onRetry={() => refetch()} />
      </div>
    );
  }

  const { totals } = data;
  const now = new Date();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const daysElapsedInMonth = now.getDate();
  const monthlySavings = totals.estimated_monthly_savings_usd;
  const monthlyCo2Kg = totals.co2_reduction_grams_monthly / 1000;
  const demoMonthComparison = getDemoMonthComparison(monthlySavings, monthlyCo2Kg);

  const savingsSeries = synthesizeDailySeries(
    monthlySavings / daysInMonth,
    daysElapsedInMonth,
    1,
  );
  const co2Series = synthesizeDailySeries(
    totals.co2_reduction_grams_monthly / daysInMonth,
    daysInMonth,
    2,
  );

  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
      <StatCard
        label="Estimated Monthly Savings"
        metric={`$${monthlySavings.toFixed(2)}`}
        badgeText={formatPercentBadge(demoMonthComparison.savingsPercentVsLastMonth)}
        badgeTone="green"
        series={savingsSeries}
        chartType="pie"
        caption="Daily savings distribution so far this month."
        explanation={
          <>
            <p>
              Your estimated monthly savings compares the cost of running your
              appliances at our recommended times against running them at the most
              expensive hours of the day.
            </p>
            <p>
              We project today's optimization across a 30-day window using your home's
              ZIP code, hourly electricity prices, and your appliance schedule.
            </p>
          </>
        }
      />
      <StatCard
        label="CO₂ Reduction This Month"
        metric={`${monthlyCo2Kg.toFixed(1)} kg`}
        badgeText={formatPercentBadge(demoMonthComparison.co2PercentVsLastMonth)}
        badgeTone="yellow"
        series={co2Series}
        chartType="bar"
        barColor="hsl(var(--accent-primary))"
        tooltipSeriesName="CO₂ reduced"
        tooltipValueFormatter={(value) => `${(value / 1000).toFixed(2)} kg`}
        caption="Equivalent to planting 0.6 trees."
        explanation={
          <>
            <p>
              CO₂ reduction is the difference between the grid carbon intensity at
              your scheduled times versus baseline times, multiplied by each
              appliance's energy use.
            </p>
            <p>
              We use real-time grid mix data to estimate how clean the electricity is
              hour-by-hour, then project savings forward over a month.
            </p>
          </>
        }
      />
    </div>
  );
}
