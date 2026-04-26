import { Card } from "@/components/ui/card";

export default function Onboarding() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-6">
      <Card className="max-w-[480px] w-full">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-[24px] text-accent-primary" style={{ fontVariationSettings: "'FILL' 1" }}>
            bolt
          </span>
          <span className="text-h3 text-foreground">EnerGenius</span>
        </div>
        <h1 className="text-h2 text-foreground mt-6">Welcome</h1>
        <p className="text-body text-muted-foreground mt-3">
          Onboarding lands here in a later phase.
        </p>
      </Card>
    </div>
  );
}
