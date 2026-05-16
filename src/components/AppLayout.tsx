import { Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  BarChart3,
  Upload,
  Users2,
  CalendarDays,
  FileBarChart,
  LogOut,
  Menu,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useEffect, useState } from "react";

const nav = [
  { to: "/", label: "Dashboard", icon: BarChart3 },
  { to: "/upload", label: "Upload", icon: Upload },
  { to: "/mapping", label: "Mapping", icon: Users2 },
  { to: "/calendar", label: "Calendar", icon: CalendarDays },
  { to: "/reports", label: "Reports", icon: FileBarChart },
] as const;

import { AUTH_STORAGE_KEY } from "@/constants";

export function AppLayout() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [mobileOpen, setMobileOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/login" });
  }, [loading, user, navigate]);

  if (loading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary/20 border-t-primary" />
          <span className="text-sm text-muted-foreground animate-pulse">Loading dashboard…</span>
        </div>
      </div>
    );
  }

  const handleSignOut = async () => {
    localStorage.removeItem(AUTH_STORAGE_KEY);
    await supabase.auth.signOut();
    navigate({ to: "/login" });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50/30 dark:from-slate-950 dark:via-slate-900 dark:to-blue-950/30">
      {/* Premium header */}
      <header className={`sticky top-0 z-50 border-b bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl transition-all duration-700 ${mounted ? "translate-y-0 opacity-100" : "-translate-y-full opacity-0"}`}>
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-4 px-4 lg:px-6">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-2.5 group">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 shadow-md shadow-blue-500/20 transition-transform group-hover:scale-110 group-hover:rotate-3">
              <BarChart3 className="h-5 w-5 text-white" />
            </div>
            <span className="font-bold tracking-tight text-lg bg-gradient-to-r from-slate-900 to-slate-600 dark:from-white dark:to-slate-300 bg-clip-text text-transparent">
              SSJ Brokerage PA
            </span>
          </Link>

          {/* Desktop nav */}
          <nav className="hidden md:flex flex-1 items-center gap-1 ml-6">
            {nav.map((n, idx) => {
              const Icon = n.icon;
              const active = pathname === n.to;
              return (
                <Link
                  key={n.to}
                  to={n.to}
                  className={cn(
                    "inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition-all duration-300",
                    "text-muted-foreground hover:text-foreground hover:bg-slate-100/80 dark:hover:bg-slate-800/80",
                    active && "bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950/50 dark:to-indigo-950/50 text-blue-700 dark:text-blue-300 shadow-sm",
                    mounted ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0"
                  )}
                  style={{ transitionDelay: `${(idx + 1) * 80}ms` }}
                >
                  <Icon className={cn("h-4 w-4", active && "text-blue-600 dark:text-blue-400")} />
                  {n.label}
                </Link>
              );
            })}
          </nav>

          {/* User info & sign out */}
          <div className="flex items-center gap-3 ml-auto">
            <div className="hidden sm:flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-blue-100 to-indigo-100 dark:from-blue-900 dark:to-indigo-900 text-xs font-bold text-blue-700 dark:text-blue-300">
                {(user.email?.[0] ?? "G").toUpperCase()}
              </div>
              <span className="text-xs text-muted-foreground font-medium max-w-32 truncate">{user.email}</span>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleSignOut}
              className="text-muted-foreground hover:text-destructive hover:bg-destructive/5 transition-colors"
            >
              <LogOut className="mr-1.5 h-4 w-4" /> Sign out
            </Button>

            {/* Mobile hamburger */}
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden"
              onClick={() => setMobileOpen(!mobileOpen)}
            >
              {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </Button>
          </div>
        </div>

        {/* Mobile nav */}
        {mobileOpen && (
          <div className="md:hidden border-t bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl animate-slide-down">
            <nav className="flex flex-col p-2 gap-0.5">
              {nav.map((n) => {
                const Icon = n.icon;
                const active = pathname === n.to;
                return (
                  <Link
                    key={n.to}
                    to={n.to}
                    onClick={() => setMobileOpen(false)}
                    className={cn(
                      "flex items-center gap-3 rounded-lg px-4 py-3 text-sm font-medium transition-colors",
                      "text-muted-foreground hover:text-foreground hover:bg-slate-100/80",
                      active && "bg-blue-50 text-blue-700",
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    {n.label}
                  </Link>
                );
              })}
            </nav>
          </div>
        )}
      </header>

      {/* Main content with enter animation */}
      <main className={`mx-auto max-w-7xl px-4 lg:px-6 py-6 transition-all duration-700 delay-300 ${mounted ? "translate-y-0 opacity-100" : "translate-y-8 opacity-0"}`}>
        <Outlet />
      </main>
    </div>
  );
}
