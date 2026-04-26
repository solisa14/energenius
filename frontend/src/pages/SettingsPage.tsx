import { AppShell } from "@/components/layout/AppShell";
import { Card } from "@/components/ui/card";
import { useAuth } from "@/contexts/AuthContext";
import { useProfile } from "@/hooks/useProfile";

export default function SettingsPage() {
  const { user } = useAuth();
  const { profile } = useProfile();

  return (
    <AppShell title="Settings" breadcrumb="Home / Settings">
      <Card className="max-w-lg rounded-2xl p-6 shadow-level-1">
        <h2 className="text-h4 text-foreground">Account</h2>
        <dl className="mt-4 space-y-3 text-body-sm">
          <div>
            <dt className="text-overline text-muted-foreground">Email</dt>
            <dd className="mt-1 text-foreground">{user?.email ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-overline text-muted-foreground">Home ZIP</dt>
            <dd className="mt-1 text-foreground">{profile?.home_zip ?? "—"}</dd>
          </div>
        </dl>
        <p className="text-body-sm text-muted-foreground mt-6">
          Use the dashboard to review schedules and savings, and ask WattBot in the
          sidebar to adjust availability or explain your run times.
        </p>
      </Card>
    </AppShell>
  );
}
