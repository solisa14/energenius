import { NavLink, useLocation } from "react-router-dom";

const NAV_ITEMS = [
  { to: "/dashboard", icon: "dashboard", label: "Dashboard" },
  { to: "/schedule", icon: "calendar_month", label: "Schedule" },
  { to: "/recommendations", icon: "lightbulb", label: "Recommendations" },
  { to: "/insights", icon: "insights", label: "Insights" },
  { to: "/chat", icon: "chat", label: "Chat" },
  { to: "/settings", icon: "settings", label: "Settings" },
];

export function MobileSidebar() {
  const location = useLocation();
  return (
    <aside className="flex lg:hidden w-[64px] shrink-0 flex-col items-center border-r border-border bg-surface py-6">
      <span className="material-symbols-outlined text-[24px] text-accent-primary" style={{ fontVariationSettings: "'FILL' 1" }}>
        bolt
      </span>
      <nav className="mt-8 flex flex-col gap-2">
        {NAV_ITEMS.map((item) => {
          const active = location.pathname === item.to;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              title={item.label}
              className={`flex h-12 w-12 items-center justify-center rounded-md transition-colors duration-150 ${
                active
                  ? "bg-accent-primary text-accent-primary-foreground"
                  : "text-muted-foreground hover:bg-foreground/[0.04]"
              }`}
            >
              <span className="material-symbols-outlined text-[24px]">{item.icon}</span>
            </NavLink>
          );
        })}
      </nav>
    </aside>
  );
}
