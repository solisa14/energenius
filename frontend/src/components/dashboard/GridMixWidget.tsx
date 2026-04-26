import { useMemo, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useRecommendations } from "@/hooks/useRecommendations";
import { useExternalData } from "@/hooks/useExternalData";
import { cn } from "@/lib/utils";

// Hardcoded region label (no real region API — see spec).
const REGION_LABEL = "Tucson, AZ · TEP";

type SourceKey =
  | "nuclear"
  | "solar"
  | "wind"
  | "hydro"
  | "gas"
  | "coal"
  | "oil"
  | "other";

const SOURCE_COLOR: Record<SourceKey, string> = {
  nuclear: "hsl(var(--accent-primary))",
  solar: "hsl(var(--warning))",
  wind: "hsl(var(--accent-secondary))",
  hydro: "hsl(var(--info))",
  gas: "hsl(var(--text-tertiary))",
  coal: "hsl(var(--foreground))",
  oil: "hsl(var(--muted-foreground))",
  other: "hsl(var(--muted-foreground))",
};

const SOURCE_ICON: Record<SourceKey, string> = {
  nuclear: "bolt",
  solar: "wb_sunny",
  wind: "air",
  hydro: "water_drop",
  gas: "local_fire_department",
  coal: "factory",
  oil: "oil_barrel",
  other: "category",
};

const SOURCE_LABEL: Record<SourceKey, string> = {
  nuclear: "Nuclear",
  solar: "Solar",
  wind: "Wind",
  hydro: "Hydro",
  gas: "Gas",
  coal: "Coal",
  oil: "Oil",
  other: "Other",
};

export function getGridMixSummary(mix: Record<string, number>): string {
  const renewable = (mix.solar ?? 0) + (mix.wind ?? 0) + (mix.hydro ?? 0);
  const zeroCarbon = renewable + (mix.nuclear ?? 0);
  const nuclearPct = Math.round((mix.nuclear ?? 0) * 100);
  const renewablePct = Math.round(renewable * 100);
  if (zeroCarbon > 0.5) {
    return `Right now, ${nuclearPct}% of your electricity is nuclear and ${renewablePct}% is renewable — that's a great window for high-power tasks.`;
  }
  return `Grid carbon is elevated right now (${nuclearPct}% nuclear, ${renewablePct}% renewable). Consider shifting flexible loads to midday.`;
}

function isSourceKey(k: string): k is SourceKey {
  return k in SOURCE_COLOR;
}

export function GridMixWidget() {
  const { data, isLoading, error } = useRecommendations();
  const [open, setOpen] = useState(false);

  const today = new Date().toISOString().slice(0, 10);
  // Zip is unknown client-side at this phase; mocks ignore it. Pass a placeholder
  // so the query is enabled. TODO: pipe profile.home_zip in once available.
  const { data: external } = useExternalData("00000", today);

  const sortedEntries = useMemo(() => {
    const mix = data?.grid_mix_now ?? {};
    return Object.entries(mix)
      .filter(([k, v]) => isSourceKey(k) && v > 0)
      .sort((a, b) => b[1] - a[1]) as Array<[SourceKey, number]>;
  }, [data]);

  if (isLoading) {
    return (
      <Card className="space-y-4">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-24 w-full" />
      </Card>
    );
  }

  if (error || !data) {
    return (
      <Card>
        <p className="text-body-sm text-muted-foreground">
          Couldn't load grid mix.
        </p>
      </Card>
    );
  }

  if (sortedEntries.length === 0) {
    return (
      <Card>
        <p className="text-body-sm text-muted-foreground">
          No grid mix data available.
        </p>
      </Card>
    );
  }

  const summary = getGridMixSummary(data.grid_mix_now);

  return (
    <>
      <Card
        role="button"
        tabIndex={0}
        onClick={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setOpen(true);
          }
        }}
        className="cursor-pointer transition-shadow duration-200 hover:shadow-[var(--shadow-2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {/* Header */}
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[hsl(var(--accent-secondary))] opacity-75" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[hsl(var(--accent-secondary))]" />
            </span>
            <span className="text-body-sm text-muted-foreground">{REGION_LABEL}</span>
          </div>
          <h3 className="text-h3 text-foreground">Grid Mix Right Now</h3>
        </div>

        {/* Vertical legend */}
        <div className="mt-4 space-y-2">
          {sortedEntries.map(([key, value]) => {
            const pct = Math.round(value * 100);
            const isNuclear = key === "nuclear";
            return (
              <div
                key={key}
                className={cn(
                  "flex h-10 items-center justify-between rounded-lg px-3",
                  isNuclear && "border border-accent-primary",
                )}
              >
                <div className="flex min-w-0 items-center gap-2">
                  <span
                    className="material-symbols-outlined shrink-0"
                    style={{ fontSize: 20 }}
                  >
                    {SOURCE_ICON[key]}
                  </span>
                  <span className="text-body text-foreground truncate">
                    {SOURCE_LABEL[key]}
                  </span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {isNuclear && (
                    <span className="text-overline rounded-lg bg-accent-primary px-2 py-1 text-accent-primary-foreground">
                      Zero-carbon
                    </span>
                  )}
                  <span className="text-h4 text-foreground tabular-nums">
                    {pct}%
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Summary */}
        <p className="mt-4 text-body-sm text-muted-foreground">{summary}</p>
      </Card>

      {/* Detail sheet */}
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="w-full sm:max-w-md">
          <SheetHeader>
            <SheetTitle>Carbon intensity today</SheetTitle>
            <SheetDescription>
              Grams of CO₂ per kWh, hour by hour. The marker shows the current hour.
            </SheetDescription>
          </SheetHeader>
          <div className="mt-6 h-64 w-full">
            {external ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={external.carbon.map((carbon, slotIdx) => ({
                    slotIdx,
                    carbon,
                  }))}
                  margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis
                    dataKey="slotIdx"
                    tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                    tickFormatter={(slotIdx) => `${Math.floor(Number(slotIdx) / 2)}:00`}
                    interval={5}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                    width={40}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "hsl(var(--popover))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: 8,
                      fontSize: 12,
                      whiteSpace: "nowrap",
                      maxWidth: "none",
                    }}
                    formatter={(v: number) => [`${v} g/kWh`, "Carbon"]}
                    labelFormatter={(slotIdx) => {
                      const s = Number(slotIdx);
                      const h = Math.floor(s / 2);
                      const m = s % 2 === 0 ? "00" : "30";
                      return `${h}:${m}`;
                    }}
                  />
                  <ReferenceLine
                    x={Math.min(
                      47,
                      new Date().getHours() * 2 +
                        (new Date().getMinutes() >= 30 ? 1 : 0),
                    )}
                    stroke="hsl(var(--accent-secondary))"
                    strokeDasharray="4 2"
                    label={{
                      value: "Now",
                      position: "top",
                      fill: "hsl(var(--accent-secondary))",
                      fontSize: 11,
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="carbon"
                    stroke="hsl(var(--foreground))"
                    strokeWidth={2}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <Skeleton className="h-full w-full" />
            )}
          </div>
          <p className="mt-6 text-body-sm text-muted-foreground">
            Renewable mix on most grids peaks in the middle of the day, when solar
            output is highest. Wind often rises overnight. Shifting flexible loads
            (laundry, dishwasher, EV charging) into the lowest-carbon hours can cut
            your home's emissions without changing how much energy you use.
          </p>
        </SheetContent>
      </Sheet>
    </>
  );
}