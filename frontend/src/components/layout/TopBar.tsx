import { Link, useNavigate } from "react-router-dom";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useTheme } from "@/contexts/ThemeContext";
import { useAuth } from "@/contexts/AuthContext";

export function TopBar() {
  const { theme, toggleTheme } = useTheme();
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  const initials = (user?.user_metadata?.full_name as string | undefined)
    ?.split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase() || "AR";

  return (
    <header className="flex h-16 items-center justify-between gap-4 border-b border-border bg-surface px-6">
      <div className="relative w-full max-w-[480px]">
        <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-[20px] text-text-tertiary">
          search
        </span>
        <Input
          type="search"
          placeholder="Search appliances, recommendations, or ask a question…"
          className="pl-10 pr-3 h-10 text-body-sm placeholder:overflow-hidden placeholder:text-ellipsis"
        />
      </div>

      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={toggleTheme} aria-label="Toggle theme">
          <span className="material-symbols-outlined text-[20px]">
            {theme === "dark" ? "light_mode" : "dark_mode"}
          </span>
        </Button>

        <Button variant="ghost" size="icon" aria-label="Notifications" className="relative">
          <span className="material-symbols-outlined text-[20px]">notifications</span>
          <span className="absolute top-2 right-2 h-2 w-2 rounded-full bg-accent-primary border border-surface" />
        </Button>

        {user ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                title="Open user menu"
                className="flex h-8 w-8 items-center justify-center rounded-full bg-accent-primary text-accent-primary-foreground text-body-sm font-semibold transition-transform hover:scale-105"
              >
                {initials}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>
                <div className="flex flex-col">
                  <span className="text-body-sm text-muted-foreground">{user.email}</span>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => navigate("/dashboard")}>
                Dashboard
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => navigate("/recommendations")}>
                Recommendations
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => navigate("/settings")}>
                Account & Settings
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => signOut()}>
                Log out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <Button size="sm" onClick={() => navigate("/login")}>Log In</Button>
        )}
      </div>
    </header>
  );
}
