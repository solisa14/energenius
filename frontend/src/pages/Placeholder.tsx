import { AppShell } from "@/components/layout/AppShell";
import { Card } from "@/components/ui/card";

export function PlaceholderPage({ title, breadcrumb }: { title: string; breadcrumb: string }) {
  return (
    <AppShell title={title} breadcrumb={breadcrumb}>
      <Card>
        <p className="text-body text-muted-foreground">{title} content lands here in a later phase.</p>
      </Card>
    </AppShell>
  );
}
