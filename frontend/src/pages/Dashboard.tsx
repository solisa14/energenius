import { AppShell } from "@/components/layout/AppShell";
import { StatCardsRow } from "@/components/dashboard/StatCardsRow";
import { ScheduleRecommendationsCard } from "@/components/dashboard/ScheduleRecommendationsCard";
import { SavingsImpactPanel } from "@/components/dashboard/SavingsImpactPanel";

export default function Dashboard() {
  return (
    <AppShell title="Dashboard" breadcrumb="Home / Dashboard">
      <div className="flex flex-col gap-6">
        <StatCardsRow />
        <ScheduleRecommendationsCard />
        <div className="min-w-0">
          <SavingsImpactPanel />
        </div>
      </div>
    </AppShell>
  );
}
