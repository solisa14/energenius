import { AppShell } from "@/components/layout/AppShell";
import { ScheduleRecommendationsCard } from "@/components/dashboard/ScheduleRecommendationsCard";

export default function Schedule() {
  return (
    <AppShell title="Schedule" breadcrumb="Home / Schedule">
      <ScheduleRecommendationsCard />
    </AppShell>
  );
}
