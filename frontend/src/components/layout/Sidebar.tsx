import { NavLink, useLocation } from "react-router-dom";
import { WattBotSidebarPanel } from "@/components/dashboard/ChatPanel";

const NAV_ITEMS = [
  { to: "/dashboard", label: "Dashboard", icon: "dashboard" },
  { to: "/recommendations", label: "Recommendations", icon: "lightbulb" },
  { to: "/schedule", label: "Schedule", icon: "calendar_month" },
  { to: "/insights", label: "Insights", icon: "insights" },
  { to: "/chat", label: "Chat", icon: "chat" },
  { to: "/settings", label: "Settings", icon: "settings" },
];

export function Sidebar() {
  const location = useLocation();
  return (
    <aside className="relative z-30 hidden lg:flex sticky top-0 h-[100dvh] max-h-screen w-[240px] shrink-0 flex-col overflow-hidden border-r border-border bg-surface px-4 py-6">
      <div className="flex shrink-0 items-center gap-2 px-3">
        <span className="material-symbols-outlined text-[24px] text-accent-primary" style={{ fontVariationSettings: "'FILL' 1" }}>
          bolt
        </span>
        <span className="text-h3 text-foreground">EnerGenius</span>
      </div>
      <div className="mt-8 shrink-0 px-3 text-body-sm font-medium text-muted-foreground">Main Menu</div>
      <nav className="mt-3 flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto scrollbar-thin">
        {NAV_ITEMS.map((item) => {
          const active = location.pathname === item.to;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              className={`flex h-12 shrink-0 items-center gap-3 rounded-md px-3 text-body transition-colors duration-150 ${
                active
                  ? "bg-accent-primary text-accent-primary-foreground font-semibold"
                  : "text-muted-foreground hover:bg-foreground/[0.04]"
              }`}
            >
              <span className="material-symbols-outlined text-[20px]">{item.icon}</span>
              <span>{item.label}</span>
            </NavLink>
          );
        })}
      </nav>
      <div className="mt-4 shrink-0 border-t border-border pt-4">
        <WattBotSidebarPanel />
      </div>
    </aside>
  );
}
