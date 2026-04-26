import { useState } from "react";
import { Card } from "@/components/ui/card";
import { DailyTimelinePanel } from "@/components/dashboard/DailyTimeline";
import { RecommendationCardSet } from "@/components/dashboard/RecommendationCardSet";
import { isoDateForChoice, type DayChoice } from "@/lib/timeline/grid";

interface ScheduleRecommendationsCardProps {
  timelineFirst?: boolean;
}

export function ScheduleRecommendationsCard({
  timelineFirst = false,
}: ScheduleRecommendationsCardProps) {
  const [day, setDay] = useState<DayChoice>("today");
  const targetDateISO = isoDateForChoice(day);
  const timeline = (
    <DailyTimelinePanel
      targetDateISO={targetDateISO}
      day={day}
      onDayChange={setDay}
    />
  );
  const recommendations = (
    <RecommendationCardSet date={targetDateISO} embed layout="single" />
  );

  return (
    <Card className="rounded-2xl p-6 shadow-level-1">
      {timelineFirst ? (
        <>
          {timeline}
          <div className="mt-6 border-t border-border pt-6">{recommendations}</div>
        </>
      ) : (
        <>
          {recommendations}
          <div className="mt-6 border-t border-border pt-6">{timeline}</div>
        </>
      )}
    </Card>
  );
}
