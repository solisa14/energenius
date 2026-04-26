import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useRecommendations } from "@/hooks/useRecommendations";
import { useFeedback } from "@/hooks/useFeedback";
import { qk } from "@/lib/api/queryKeys";
import { useApplianceSelectionsStore } from "@/stores/applianceSelections";
import { formatTime } from "@/lib/timeline/grid";
import type {
  Appliance,
  ApplianceRecommendation,
  DailyRecommendation,
  RecommendationLabel,
  RecommendationOption,
} from "@/lib/api/types";
import { cn } from "@/lib/utils";

const APPLIANCE_LABEL: Record<Appliance, string> = {
  dishwasher: "Dishwasher",
  washing_machine: "Washer",
  dryer: "Dryer",
  ev_charger: "EV Charger",
  water_heater_boost: "Water Heater",
  hvac: "HVAC",
};

const APPLIANCE_ICON: Record<Appliance, string> = {
  dishwasher: "dishwasher_gen",
  washing_machine: "local_laundry_service",
  dryer: "dry_cleaning",
  ev_charger: "ev_station",
  water_heater_boost: "water_heater",
  hvac: "hvac",
};

function formatApplianceDuration(slots: number): string {
  const hours = slots / 2;
  return Number.isInteger(hours) ? String(hours) : hours.toFixed(1);
}

const BADGE_LABEL: Record<RecommendationLabel, string> = {
  best: "Best",
  balanced: "Balanced",
  convenient: "Convenient",
};

function notifyFeedback() {
  toast("Got it — I'll remember this for next time.", {
    duration: 3000,
    position: "bottom-right",
    className: "border-l-4 border-l-accent-primary",
  });
}

// ---------- Badge ----------

/** Matches stat-card chip width (~162px) so labels align with dashboard hero badges. */
const OPTION_BADGE_W = "w-[162px]";

function OptionBadge({ label }: { label: RecommendationLabel }) {
  return (
    <span
      className={cn(
        "inline-flex items-center justify-center rounded-sm px-2 py-1 text-caption font-semibold whitespace-nowrap",
        OPTION_BADGE_W,
        "border border-border bg-card text-card-foreground",
      )}
    >
      {BADGE_LABEL[label]}
    </span>
  );
}

// ---------- Reschedule dialog ----------

function RescheduleDialog({
  open,
  onOpenChange,
  defaultStart,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  defaultStart: string;
  onConfirm: (iso: string) => void;
}) {
  const initial = (() => {
    const d = new Date(defaultStart);
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  })();
  const [time, setTime] = useState(initial);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Suggest a different time</DialogTitle>
        </DialogHeader>
        <div className="mt-2">
          <label className="text-body-sm font-medium block mb-2">
            Preferred start time
          </label>
          <input
            type="time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            className="h-12 w-full rounded-md border border-border bg-background px-3 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-secondary"
          />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              const [hh, mm] = time.split(":").map((n) => parseInt(n, 10));
              const d = new Date();
              d.setHours(hh || 0, mm || 0, 0, 0);
              onConfirm(d.toISOString());
            }}
          >
            Confirm
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------- Option card (time-hero, flat) ----------

function OptionCard({
  option,
  isSelected,
  isFadedSibling,
  onSelect,
}: {
  option: RecommendationOption;
  isSelected: boolean;
  isFadedSibling: boolean;
  onSelect: (option: RecommendationOption) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(option)}
      className={cn(
        "relative flex flex-col gap-3 rounded-lg border p-4 text-left transition-all duration-200",
        "border-border bg-card",
        "cursor-pointer hover:shadow-level-2 hover:border-accent-primary hover:border-2 hover:p-[15px]",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-secondary",
        isSelected && "ring-2 ring-accent-primary",
        isFadedSibling && "opacity-50",
      )}
    >
      <OptionBadge label={option.label} />

      <div className="flex flex-col items-center mt-1">
        <div className="text-h2 text-foreground tabular-nums">
          {formatTime(option.slot.start)}
        </div>
        <div className="text-body-sm text-muted-foreground mt-1">
          to {formatTime(option.slot.end)}
        </div>
      </div>

      <div className="h-px bg-border" />

      <div className="grid grid-cols-3 gap-3">
        <div>
          <div className="text-caption text-muted-foreground">Cost</div>
          <div className="text-h4 text-foreground tabular-nums mt-1">
            ${option.slot.cost_usd.toFixed(2)}
          </div>
        </div>
        <div>
          <div className="text-caption text-muted-foreground">Saves</div>
          <div className="text-h4 text-accent-secondary tabular-nums mt-1">
            ${option.savings_vs_baseline_usd.toFixed(2)}
          </div>
        </div>
        <div>
          <div className="text-caption text-muted-foreground">CO₂</div>
          <div className="text-h4 text-foreground tabular-nums mt-1">
            {Math.round(option.co2_reduction_grams)} g
          </div>
        </div>
      </div>
    </button>
  );
}

// ---------- Skeletons / states ----------

function CardSkeleton() {
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4">
      <Skeleton className="h-6 w-[162px] rounded-sm" />
      <div className="flex flex-col items-center mt-1 gap-1">
        <Skeleton className="h-7 w-24" />
        <Skeleton className="h-4 w-20" />
      </div>
      <div className="h-px bg-border" />
      <div className="grid grid-cols-3 gap-3">
        {[0, 1, 2].map((i) => (
          <div key={i}>
            <Skeleton className="h-3 w-12" />
            <Skeleton className="h-5 w-16 mt-1" />
          </div>
        ))}
      </div>
    </div>
  );
}

function LoadingCard({ embed }: { embed?: boolean }) {
  const inner = (
    <>
      <Skeleton className="h-12 w-full mb-4" />
      <div className="grid gap-4 grid-cols-1 min-[900px]:grid-cols-3">
        <CardSkeleton />
        <CardSkeleton />
        <CardSkeleton />
      </div>
      <Skeleton className="h-4 w-40 mt-4" />
    </>
  );
  if (embed) return inner;
  return <Card>{inner}</Card>;
}

// ---------- Main ----------

export function RecommendationCardSet({
  date,
  embed = false,
}: {
  date: string;
  embed?: boolean;
}) {
  const qc = useQueryClient();
  const { data, isLoading, error, refetch } = useRecommendations(date);
  const { submitAsync, isLoading: feedbackPending } = useFeedback();
  const setStoreSelection = useApplianceSelectionsStore((s) => s.setSelection);
  const selectionsByDate = useApplianceSelectionsStore((s) => s.selectionsByDate);

  const [activeAppliance, setActiveAppliance] = useState<Appliance | null>(null);

  // Reschedule dialog state (single, shared by the popover)
  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const [popoverOpen, setPopoverOpen] = useState(false);

  const appliances = useMemo(() => data?.appliances ?? [], [data]);
  const timelineFocusAppliance = useApplianceSelectionsStore(
    (s) => s.timelineFocusAppliance,
  );
  const timelineFocusNonce = useApplianceSelectionsStore(
    (s) => s.timelineFocusNonce,
  );

  useEffect(() => {
    if (!timelineFocusAppliance || appliances.length === 0) return;
    const exists = appliances.some((a) => a.appliance === timelineFocusAppliance);
    if (exists) {
      setActiveAppliance(timelineFocusAppliance);
    }
  }, [timelineFocusAppliance, timelineFocusNonce, appliances]);

  const current: ApplianceRecommendation | undefined = useMemo(() => {
    if (appliances.length === 0) return undefined;
    const key = activeAppliance ?? appliances[0].appliance;
    return appliances.find((a) => a.appliance === key) ?? appliances[0];
  }, [appliances, activeAppliance]);

  const selectedLabel: RecommendationLabel | null = current
    ? (selectionsByDate[date]?.[current.appliance] ?? null)
    : null;

  const bestOption = current?.options.find((o) => o.label === "best") ?? current?.options[0];

  const handleSelect = async (option: RecommendationOption) => {
    if (!current || !data) return;
    setStoreSelection(date, current.appliance, option.label);

    // Optimistic stat bump
    qc.setQueryData<DailyRecommendation>(qk.recommendations(date), (prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        totals: {
          ...prev.totals,
          estimated_monthly_savings_usd:
            prev.totals.estimated_monthly_savings_usd +
            option.savings_vs_baseline_usd * 30,
          co2_reduction_grams_monthly:
            prev.totals.co2_reduction_grams_monthly +
            option.co2_reduction_grams * 30,
        },
      };
    });

    try {
      await submitAsync({
        appliance: current.appliance,
        chosen_option: option.label,
        response: "yes",
        suggested_time: option.slot.start,
      });
    } catch {
      void 0;
    }
    notifyFeedback();
  };

  const handleDoesntWork = async () => {
    if (!current || !bestOption) return;
    setPopoverOpen(false);
    try {
      await submitAsync({
        appliance: current.appliance,
        chosen_option: "best",
        response: "no",
        suggested_time: bestOption.slot.start,
      });
    } catch {
      void 0;
    }
    notifyFeedback();
  };

  const handleRescheduleConfirm = async (iso: string) => {
    if (!current || !bestOption) return;
    setRescheduleOpen(false);
    try {
      await submitAsync({
        appliance: current.appliance,
        chosen_option: "best",
        response: "different_time",
        suggested_time: iso,
      });
    } catch {
      void 0;
    }
    notifyFeedback();
  };

  // ---- States ----

  if (isLoading) return <LoadingCard embed={embed} />;

  if (error || !data) {
    const errorInner = (
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-overline text-destructive">
            Couldn't load recommendations
          </div>
          <p className="text-body-sm text-muted-foreground mt-2">
            We couldn't load your recommendations. Please try again.
          </p>
        </div>
        <Button size="sm" variant="secondary" onClick={() => refetch()}>
          Retry
        </Button>
      </div>
    );
    if (embed) {
      return (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4">
          {errorInner}
        </div>
      );
    }
    return <Card>{errorInner}</Card>;
  }

  if (!current) {
    const emptyInner = (
      <p className="text-body text-muted-foreground text-center py-8">
        No appliances configured yet.
      </p>
    );
    if (embed) return emptyInner;
    return <Card>{emptyInner}</Card>;
  }

  // ---- Render ----

  const triggerSubtitle = `${formatApplianceDuration(current.duration)} hr · ${current.powerKw} kW`;

  const body = (
    <>
      <h3 className="text-h3 text-foreground">Recommended Times</h3>
      <Select
        value={current.appliance}
        onValueChange={(v) => setActiveAppliance(v as Appliance)}
      >
        <SelectTrigger className="mt-4 h-12 w-full sm:w-[360px]">
          <SelectValue>
            <span className="flex items-center gap-2">
              <span className="material-symbols-outlined text-[20px] text-foreground">
                {APPLIANCE_ICON[current.appliance]}
              </span>
              <span className="text-body font-medium text-foreground">
                {APPLIANCE_LABEL[current.appliance]}
              </span>
              <span className="text-body-sm text-muted-foreground">
                · {triggerSubtitle}
              </span>
            </span>
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {appliances.map((a) => (
            <SelectItem key={a.appliance} value={a.appliance}>
              <span className="flex items-center gap-2">
                <span className="material-symbols-outlined text-[20px]">
                  {APPLIANCE_ICON[a.appliance]}
                </span>
                <span className="text-body font-medium">
                  {APPLIANCE_LABEL[a.appliance]}
                </span>
                <span className="text-body-sm text-muted-foreground">
                  · {formatApplianceDuration(a.duration)} hr · {a.powerKw} kW
                </span>
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <div className="grid gap-4 grid-cols-1 min-[900px]:grid-cols-3 mt-4">
        {current.options.map((opt) => {
          const isSelected = selectedLabel === opt.label;
          const isFadedSibling = !!selectedLabel && !isSelected;
          return (
            <OptionCard
              key={opt.label}
              option={opt}
              isSelected={isSelected}
              isFadedSibling={isFadedSibling}
              onSelect={handleSelect}
            />
          );
        })}
      </div>

      <div className="mt-4 flex items-center justify-center">
        <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              disabled={feedbackPending}
              className="text-body-sm text-muted-foreground hover:text-foreground underline-offset-4 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-secondary rounded-sm px-2 py-1"
            >
              Not the right time?
            </button>
          </PopoverTrigger>
          <PopoverContent align="center" className="w-64 p-2">
            <button
              type="button"
              onClick={handleDoesntWork}
              className="w-full text-left text-body-sm px-3 py-2 rounded-sm hover:bg-muted focus:outline-none focus-visible:bg-muted"
            >
              This doesn't work
            </button>
            <button
              type="button"
              onClick={() => {
                setPopoverOpen(false);
                setRescheduleOpen(true);
              }}
              className="w-full text-left text-body-sm px-3 py-2 rounded-sm hover:bg-muted focus:outline-none focus-visible:bg-muted"
            >
              Suggest a different time
            </button>
          </PopoverContent>
        </Popover>
      </div>
    </>
  );

  return (
    <>
      {embed ? (
        <div id="recommendation-cardset">{body}</div>
      ) : (
        <Card id="recommendation-cardset">{body}</Card>
      )}

      {bestOption && (
        <RescheduleDialog
          open={rescheduleOpen}
          onOpenChange={setRescheduleOpen}
          defaultStart={bestOption.slot.start}
          onConfirm={handleRescheduleConfirm}
        />
      )}
    </>
  );
}
