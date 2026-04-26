import { useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { RecommendationCardSet } from "@/components/dashboard/RecommendationCardSet";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { isoDateForChoice, readableDateFromISO, type DayChoice } from "@/lib/timeline/grid";

export default function Recommendations() {
  const [day, setDay] = useState<DayChoice>("today");
  const targetDateISO = isoDateForChoice(day);

  return (
    <AppShell title="Recommendations" breadcrumb="Home / Recommendations">
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-end gap-3">
          <span className="text-body-sm text-muted-foreground">
            {readableDateFromISO(targetDateISO)}
          </span>
          <ToggleGroup
            type="single"
            value={day}
            onValueChange={(v) => v && setDay(v as DayChoice)}
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
        <RecommendationCardSet date={targetDateISO} />
      </div>
    </AppShell>
  );
}
