import { useState } from "react";
import { Card } from "@/components/ui/card";
import { DailyTimelinePanel } from "@/components/dashboard/DailyTimeline";
import { RecommendationCardSet } from "@/components/dashboard/RecommendationCardSet";
import { isoDateForChoice, type DayChoice } from "@/lib/timeline/grid";

export function ScheduleRecommendationsCard() {
  const [day, setDay] = useState<DayChoice>("today");
  const targetDateISO = isoDateForChoice(day);

  return (
    <Card className="rounded-2xl p-6 shadow-level-1">
      <RecommendationCardSet date={targetDateISO} embed layout="single" />
      <div className="mt-6 border-t border-border pt-6">
        <DailyTimelinePanel
          targetDateISO={targetDateISO}
          day={day}
          onDayChange={setDay}
        />
      </div>
    </Card>
  );
}
