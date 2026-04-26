import { AppShell } from "@/components/layout/AppShell";
import { SavingsImpactPanel } from "@/components/dashboard/SavingsImpactPanel";

export default function Insights() {
  return (
    <AppShell title="Insights" breadcrumb="Home / Insights">
      <SavingsImpactPanel />
    </AppShell>
  );
}
