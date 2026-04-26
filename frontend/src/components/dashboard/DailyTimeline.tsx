import { useMemo, useRef, useState, type CSSProperties, type MouseEvent, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  formatTimeRange,
  slotIndexFromISO,
  startOfDay,
  TOTAL_SLOTS,
  HOURS,
  formatHourLabel,
  type DayChoice,
  isoDateForChoice,
  readableDateFromISO,
} from "@/lib/timeline/grid";
import { useRecommendations } from "@/hooks/useRecommendations";
import { useApplianceSelectionsStore } from "@/stores/applianceSelections";
import type {
  Appliance,
  ApplianceRecommendation,
  RecommendationLabel,
  RecommendationOption,
  TimelineSlot,
} from "@/lib/api/types";
import { cn } from "@/lib/utils";

const LABEL_COL_W = 160;
const TIMELINE_MIN_W = 768;
const LANE_H = 56;

const LANE_ORDER: Appliance[] = [
  "dishwasher",
  "ev_charger",
  "washing_machine",
  "dryer",
  "water_heater_boost",
];

const RANK: Partial<Record<Appliance, number>> = Object.fromEntries(
  LANE_ORDER.map((k, i) => [k, i]),
);

const APPLIANCE_LABEL: Record<Appliance, string> = {
  dishwasher: "Dishwasher",
  washing_machine: "Washer",
  dryer: "Dryer",
  ev_charger: "EV Charger",
  water_heater_boost: "Water Heater",
  hvac: "HVAC",
};

const APPLIANCE_ICON: Record<Appliance, string> = {
  dishwasher: "local_laundry_service",
  washing_machine: "local_laundry_service",
  dryer: "dry",
  ev_charger: "electric_car",
  water_heater_boost: "water_drop",
  hvac: "thermostat",
};

const OPTION_TITLE: Record<RecommendationLabel, string> = {
  best: "Best",
  balanced: "Balanced",
  convenient: "Convenient",
};

/** Faint dotted vertical guides at each hour, aligned with the 24-column ruler. */
const HOUR_GRID_BG: CSSProperties = {
  backgroundImage: `repeating-linear-gradient(
    90deg,
    hsl(var(--border) / 0.28) 0,
    hsl(var(--border) / 0.28) 1px,
    transparent 1px,
    transparent calc(100% / 24)
  )`,
  WebkitMaskImage: `repeating-linear-gradient(
    to bottom,
    transparent 0 5px,
    black 5px 10px
  )`,
  maskImage: `repeating-linear-gradient(
    to bottom,
    transparent 0 5px,
    black 5px 10px
  )`,
};

function scrollToRecommendationCardset() {
  document
    .getElementById("recommendation-cardset")
    ?.scrollIntoView({ behavior: "smooth", block: "center" });
}

function dayFraction(now: Date, dayStart: Date): number | null {
  const ms = now.getTime() - dayStart.getTime();
  if (ms < 0 || ms > 24 * 60 * 60 * 1000) return null;
  return ms / (24 * 60 * 60 * 1000);
}

function TimelineTrackGrid({ children }: { children: ReactNode }) {
  return (
    <div className="relative h-full w-full min-w-0">
      <div
        className="pointer-events-none absolute inset-0 z-0"
        aria-hidden
        style={HOUR_GRID_BG}
      />
      <div
        className="relative z-[1] grid h-full w-full items-center"
        style={{
          gridTemplateColumns: `repeat(${TOTAL_SLOTS}, minmax(0, 1fr))`,
          minWidth: TIMELINE_MIN_W - LABEL_COL_W,
        }}
      >
        {children}
      </div>
    </div>
  );
}

function pickOption(
  rec: ApplianceRecommendation,
  selected: RecommendationLabel | undefined,
): RecommendationOption {
  if (selected) {
    const match = rec.options.find((o) => o.label === selected);
    if (match) return match;
  }
  return rec.options.find((o) => o.label === "best") ?? rec.options[0];
}

function endSlotIndexFromISO(iso: string, dayStart: Date): number {
  const t = new Date(iso).getTime();
  const minutes = Math.round((t - dayStart.getTime()) / 60000);
  const slot = Math.ceil(minutes / 30);
  return Math.max(0, Math.min(TOTAL_SLOTS, slot));
}

// ---------- Appliance block (neutral bar, details in tooltip) ----------

function ApplianceBlock({
  option,
  appliance,
  applianceLabel,
  dayStart,
  onNavigate,
}: {
  option: RecommendationOption;
  appliance: Appliance;
  applianceLabel: string;
  dayStart: Date;
  onNavigate: () => void;
}) {
  const slot = option.slot;
  const startSlot = slotIndexFromISO(slot.start, dayStart);
  const endSlot = Math.max(startSlot + 1, endSlotIndexFromISO(slot.end, dayStart));
  const [hoverTooltip, setHoverTooltip] = useState<{
    visible: boolean;
    clientX: number;
    clientY: number;
  }>({ visible: false, clientX: 0, clientY: 0 });

  return (
    <div
      className="flex w-full items-center border-t border-border"
      style={{ height: LANE_H }}
    >
      <div
        className="flex shrink-0 items-center gap-2 pr-3 pl-0"
        style={{ width: LABEL_COL_W }}
      >
        <span className="material-symbols-outlined text-[20px] text-muted-foreground">
          {APPLIANCE_ICON[appliance]}
        </span>
        <span className="text-body text-foreground">{applianceLabel}</span>
      </div>
      <div
        className="min-w-0 flex-1 self-stretch py-2"
        style={{ minWidth: TIMELINE_MIN_W - LABEL_COL_W }}
      >
        <TimelineTrackGrid>
          <div
            className="min-w-0 flex items-center"
            style={{ gridColumn: `${startSlot + 1} / ${endSlot + 1}` }}
          >
            <div className="relative w-full">
              <button
                type="button"
                onClick={onNavigate}
                onMouseEnter={() => setHoverTooltip((prev) => ({ ...prev, visible: true }))}
                onMouseLeave={() => setHoverTooltip((prev) => ({ ...prev, visible: false }))}
                onMouseMove={(event: MouseEvent<HTMLButtonElement>) => {
                  setHoverTooltip({
                    visible: true,
                    clientX: event.clientX,
                    clientY: event.clientY,
                  });
                }}
                className={cn(
                  "group flex h-10 w-full min-w-0 items-center justify-center overflow-hidden rounded-md border border-primary/25 bg-primary/10 px-2 shadow-sm",
                  "text-left transition-colors hover:bg-primary/15",
                  "focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
                )}
              >
                <span className="material-symbols-outlined shrink-0 text-[18px] text-primary">
                  {APPLIANCE_ICON[appliance]}
                </span>
              </button>
              {hoverTooltip.visible && (
                <div
                  className="pointer-events-none fixed z-[120] w-max max-w-[min(90vw,400px)] rounded-lg border border-border p-3 shadow-[var(--shadow-2)]"
                  style={{
                    left: Math.min(hoverTooltip.clientX + 12, window.innerWidth - 320),
                    top: Math.min(hoverTooltip.clientY + 12, window.innerHeight - 180),
                    backgroundColor: "hsl(var(--card) / 0.75)",
                  }}
                >
                <div className="text-h4 text-card-foreground">{applianceLabel}</div>
                <div className="text-body-sm text-muted-foreground mt-1 whitespace-nowrap">
                  {formatTimeRange(slot.start, slot.end)}
                </div>
                <div className="text-body-sm text-card-foreground mt-2 whitespace-nowrap">
                  ${slot.cost_usd.toFixed(2)}
                </div>
                <div className="text-body-sm text-card-foreground mt-1 whitespace-nowrap">
                  {Math.round(option.co2_reduction_grams)} g CO₂ saved
                </div>
                <div className="text-caption text-muted-foreground mt-2 whitespace-nowrap">
                  {OPTION_TITLE[option.label]}
                </div>
                </div>
              )}
            </div>
          </div>
        </TimelineTrackGrid>
      </div>
    </div>
  );
}

// ---------- HVAC lane (multiple blocks) ----------

function HvacBlock({
  slot,
  dayStart,
}: {
  slot: TimelineSlot;
  dayStart: Date;
}) {
  const startSlot = slotIndexFromISO(slot.start, dayStart);
  const endSlot = Math.max(startSlot + 1, endSlotIndexFromISO(slot.end, dayStart));
  const [hoverTooltip, setHoverTooltip] = useState<{
    visible: boolean;
    clientX: number;
    clientY: number;
  }>({ visible: false, clientX: 0, clientY: 0 });
  const modeLabel =
    slot.appliance === "hvac_heat"
      ? "Heating"
      : slot.appliance === "hvac_cool"
        ? "Cooling"
        : "HVAC";

  return (
    <div
      className="min-w-0 flex items-center"
      style={{ gridColumn: `${startSlot + 1} / ${endSlot + 1}` }}
    >
      <div className="relative w-full">
        <button
          type="button"
          onClick={() => scrollToRecommendationCardset()}
          onMouseEnter={() => setHoverTooltip((prev) => ({ ...prev, visible: true }))}
          onMouseLeave={() => setHoverTooltip((prev) => ({ ...prev, visible: false }))}
          onMouseMove={(event: MouseEvent<HTMLButtonElement>) => {
            setHoverTooltip({
              visible: true,
              clientX: event.clientX,
              clientY: event.clientY,
            });
          }}
          className={cn(
            "group flex h-10 w-full min-w-0 items-center justify-center overflow-hidden rounded-md border border-primary/25 bg-primary/10 px-2 shadow-sm",
            "text-left transition-colors hover:bg-primary/15",
            "focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
          )}
        >
          <span className="material-symbols-outlined shrink-0 text-[18px] text-primary">
            {APPLIANCE_ICON.hvac}
          </span>
        </button>
        {hoverTooltip.visible && (
          <div
            className="pointer-events-none fixed z-[120] w-max max-w-[min(90vw,400px)] rounded-lg border border-border p-3 shadow-[var(--shadow-2)]"
            style={{
              left: Math.min(hoverTooltip.clientX + 12, window.innerWidth - 320),
              top: Math.min(hoverTooltip.clientY + 12, window.innerHeight - 180),
              backgroundColor: "hsl(var(--card) / 0.75)",
            }}
          >
            <div className="text-h4 text-card-foreground whitespace-nowrap">HVAC</div>
            <div className="text-body-sm text-muted-foreground mt-1 whitespace-nowrap">
              {formatTimeRange(slot.start, slot.end)}
            </div>
            <div className="text-body-sm text-card-foreground mt-2 whitespace-nowrap">
              ${slot.cost_usd.toFixed(2)}
            </div>
            <div className="text-body-sm text-card-foreground mt-1 whitespace-nowrap">
              {Math.round(slot.co2_grams)} g CO₂
            </div>
            <div className="text-caption text-muted-foreground mt-2 whitespace-nowrap">{modeLabel}</div>
          </div>
        )}
      </div>
    </div>
  );
}

function HvacLane({
  slots,
  dayStart,
}: {
  slots: TimelineSlot[];
  dayStart: Date;
}) {
  const mergedSlots = useMemo(() => {
    if (slots.length <= 1) return slots;
    const sorted = [...slots].sort(
      (a, b) => new Date(a.start).getTime() - new Date(b.start).getTime(),
    );
    const merged: TimelineSlot[] = [];
    for (const current of sorted) {
      const prev = merged[merged.length - 1];
      if (!prev) {
        merged.push(current);
        continue;
      }
      const sameMode = prev.appliance === current.appliance;
      const touches =
        new Date(prev.end).getTime() === new Date(current.start).getTime();
      if (sameMode && touches) {
        merged[merged.length - 1] = {
          ...prev,
          end: current.end,
          cost_usd: prev.cost_usd + current.cost_usd,
          co2_grams: prev.co2_grams + current.co2_grams,
          score: current.score,
        };
      } else {
        merged.push(current);
      }
    }
    return merged;
  }, [slots]);

  return (
    <div
      className="flex w-full items-center border-t border-border"
      style={{ height: LANE_H }}
    >
      <div
        className="flex shrink-0 items-center gap-2 pr-3"
        style={{ width: LABEL_COL_W }}
      >
        <span className="material-symbols-outlined text-[20px] text-muted-foreground">
          {APPLIANCE_ICON.hvac}
        </span>
        <span className="text-body text-foreground">HVAC</span>
      </div>
      <div
        className="min-w-0 flex-1 self-stretch py-2"
        style={{ minWidth: TIMELINE_MIN_W - LABEL_COL_W }}
      >
        <TimelineTrackGrid>
          {mergedSlots.map((s, i) => (
            <HvacBlock key={`${s.start}-${i}`} slot={s} dayStart={dayStart} />
          ))}
        </TimelineTrackGrid>
      </div>
    </div>
  );
}

// ---------- Ruler + Now ----------

function HourRulerRow() {
  return (
    <div className="flex w-full border-b border-border">
      <div className="shrink-0" style={{ width: LABEL_COL_W }} aria-hidden />
      <div
        className="grid min-w-0 flex-1 text-center"
        style={{
          gridTemplateColumns: `repeat(${HOURS}, minmax(0, 1fr))`,
          minWidth: TIMELINE_MIN_W - LABEL_COL_W,
        }}
      >
        {Array.from({ length: HOURS }).map((_, h) => (
          <div
            key={h}
            className={cn(
              "py-2 text-body-sm font-semibold",
              h % 2 === 0 ? "text-foreground/80" : "text-transparent",
            )}
            aria-label={formatHourLabel(h)}
          >
            {h % 2 === 0 ? formatHourLabel(h) : "·"}
          </div>
        ))}
      </div>
    </div>
  );
}

function nowLeftStyle(fraction: number): string {
  return `calc(${LABEL_COL_W}px + (100% - ${LABEL_COL_W}px) * ${fraction})`;
}

function NowLabelAboveRuler({ fraction, show }: { fraction: number; show: boolean }) {
  if (!show) return null;
  const left = nowLeftStyle(fraction);
  return (
    <div className="pointer-events-none relative h-6 w-full">
      <div
        className="absolute bottom-0 z-20 -translate-x-1/2 rounded-sm bg-accent-primary px-1.5 py-0.5 text-caption font-medium text-accent-primary-foreground"
        style={{ left }}
      >
        Now
      </div>
    </div>
  );
}

function NowDashedLine({
  fraction,
  show,
}: {
  fraction: number;
  show: boolean;
}) {
  if (!show) return null;
  const left = nowLeftStyle(fraction);
  return (
    <div
      className="pointer-events-none absolute bottom-0 top-0 z-[1] w-0 -translate-x-1/2"
      style={{
        left,
        background: `repeating-linear-gradient(
          to bottom,
          hsl(var(--accent-primary) / 0.5) 0px,
          hsl(var(--accent-primary) / 0.5) 5px,
          transparent 5px,
          transparent 9px
        )`,
        width: 2,
      }}
    />
  );
}

function MouseGuideLine({
  show,
  lineRef,
}: {
  show: boolean;
  lineRef: React.RefObject<HTMLDivElement>;
}) {
  if (!show) return null;
  return (
    <div
      ref={lineRef}
      className="pointer-events-none absolute bottom-0 top-0 z-[6] w-0 -translate-x-1/2 border-l-2 border-accent-secondary"
      style={{
        left: LABEL_COL_W,
        borderColor: "hsl(var(--accent-secondary) / 0.5)",
      }}
    />
  );
}

// ---------- States ----------

function TimelineLoading() {
  return (
    <div className="mt-4 space-y-0 [&_.animate-pulse]:animate-timeline-shimmer">
      <div className="flex border-b border-border">
        <div className="shrink-0" style={{ width: LABEL_COL_W }} />
        <Skeleton className="h-10 flex-1 rounded-none" style={{ minWidth: TIMELINE_MIN_W - LABEL_COL_W }} />
      </div>
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <div
          key={i}
          className="flex items-center border-t border-border"
          style={{ height: LANE_H }}
        >
          <Skeleton className="mx-2 h-5 shrink-0 rounded-md" style={{ width: LABEL_COL_W - 16 }} />
          <Skeleton className="mx-2 h-10 flex-1 rounded-md" style={{ minWidth: TIMELINE_MIN_W - LABEL_COL_W }} />
        </div>
      ))}
    </div>
  );
}

function TimelineError({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3">
      <p className="text-body-sm text-foreground">
        Couldn&apos;t load schedule. Please try again.
      </p>
      <Button size="sm" variant="secondary" type="button" onClick={onRetry}>
        Retry
      </Button>
    </div>
  );
}

function TimelineEmpty() {
  return (
    <div className="py-12 text-center">
      <p className="text-body text-muted-foreground">
        No appliances configured. Add one in Settings.
      </p>
      <Button asChild className="mt-4">
        <Link to="/settings">Add Appliance</Link>
      </Button>
    </div>
  );
}

// ---------- Main ----------

export interface DailyTimelinePanelProps {
  targetDateISO: string;
  day: DayChoice;
  onDayChange: (next: DayChoice) => void;
}

export function DailyTimelinePanel({
  targetDateISO,
  day,
  onDayChange,
}: DailyTimelinePanelProps) {
  const targetDate = new Date(targetDateISO + "T00:00:00");
  const dayStart = startOfDay(targetDate);

  const recs = useRecommendations(targetDateISO);
  const setTimelineFocus = useApplianceSelectionsStore((s) => s.setTimelineFocus);
  const selectionsByDate = useApplianceSelectionsStore((s) => s.selectionsByDate);
  const dateSelections = selectionsByDate[targetDateISO];

  const isLoading = recs.isLoading;
  const error = recs.error;
  const data = recs.data;

  const sortedAppliances = useMemo(() => {
    if (!data) return [];
    return [...data.appliances].sort(
      (a, b) =>
        (RANK[a.appliance] ?? 99) - (RANK[b.appliance] ?? 99),
    );
  }, [data]);

  const hasHvac = Boolean(data?.hvac_schedule.length);
  const isEmpty = !isLoading && !error && data && sortedAppliances.length === 0 && !hasHvac;

  const now = new Date();
  const fraction = dayFraction(now, dayStart);
  const showNow = day === "today" && fraction !== null;
  const [showMouseGuide, setShowMouseGuide] = useState(false);
  const lanesRef = useRef<HTMLDivElement>(null);
  const mouseGuideRef = useRef<HTMLDivElement>(null);

  const navigateAppliance = (appliance: Appliance) => {
    setTimelineFocus(appliance);
    scrollToRecommendationCardset();
  };

  return (
    <>
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-baseline gap-3 flex-wrap">
          <h3 className="text-h3 text-foreground">Today&apos;s Schedule</h3>
          <span className="text-body-sm text-muted-foreground">
            {readableDateFromISO(targetDateISO)}
          </span>
        </div>
        <ToggleGroup
          type="single"
          value={day}
          onValueChange={(v) => v && onDayChange(v as DayChoice)}
          className="bg-muted rounded-full p-1"
        >
          <ToggleGroupItem
            value="today"
            className="rounded-full px-4 h-8 text-body-sm data-[state=on]:bg-accent-primary data-[state=on]:text-accent-primary-foreground"
          >
            Today
          </ToggleGroupItem>
          <ToggleGroupItem
            value="tomorrow"
            className="rounded-full px-4 h-8 text-body-sm data-[state=on]:bg-accent-primary data-[state=on]:text-accent-primary-foreground"
          >
            Tomorrow
          </ToggleGroupItem>
        </ToggleGroup>
      </div>

      <div className="mt-6">
        {error && !isLoading && (
          <TimelineError onRetry={() => recs.refetch()} />
        )}

        {isLoading && <TimelineLoading />}

        {!isLoading && !error && isEmpty && <TimelineEmpty />}

        {!isLoading && !error && data && !isEmpty && (
          <div className="overflow-x-auto scrollbar-thin">
              <div
                className="relative"
                style={{ minWidth: LABEL_COL_W + TIMELINE_MIN_W }}
              >
                <NowLabelAboveRuler fraction={fraction ?? 0} show={showNow} />
                <HourRulerRow />
                <div
                  ref={lanesRef}
                  className="relative"
                  onMouseMove={(event) => {
                    const el = lanesRef.current;
                    if (!el) return;
                    const rect = el.getBoundingClientRect();
                    if (rect.width <= LABEL_COL_W) {
                      setShowMouseGuide(false);
                      return;
                    }
                    const x = event.clientX - rect.left;
                    if (x < LABEL_COL_W || x > rect.width) {
                      setShowMouseGuide(false);
                      return;
                    }
                    setShowMouseGuide(true);
                    if (mouseGuideRef.current) {
                      mouseGuideRef.current.style.left = `${x}px`;
                    }
                  }}
                  onMouseLeave={() => setShowMouseGuide(false)}
                >
                  <MouseGuideLine show={showMouseGuide} lineRef={mouseGuideRef} />
                  <NowDashedLine fraction={fraction ?? 0} show={showNow} />
                  {sortedAppliances.map((rec) => {
                    const opt = pickOption(rec, dateSelections?.[rec.appliance]);
                    return (
                      <ApplianceBlock
                        key={rec.appliance}
                        option={opt}
                        appliance={rec.appliance}
                        applianceLabel={APPLIANCE_LABEL[rec.appliance]}
                        dayStart={dayStart}
                        onNavigate={() => navigateAppliance(rec.appliance)}
                      />
                    );
                  })}
                  {hasHvac && data.hvac_schedule.length > 0 && (
                    <HvacLane slots={data.hvac_schedule} dayStart={dayStart} />
                  )}
                </div>
              </div>
          </div>
        )}
      </div>
    </>
  );
}

/** Standalone schedule card (same content as embedded panel). */
export function DailyTimeline() {
  const [day, setDay] = useState<DayChoice>("today");
  const targetDateISO = isoDateForChoice(day);
  return (
    <Card className="rounded-2xl p-6 shadow-level-1">
      <DailyTimelinePanel
        targetDateISO={targetDateISO}
        day={day}
        onDayChange={setDay}
      />
    </Card>
  );
}
