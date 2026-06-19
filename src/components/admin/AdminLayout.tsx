import { Link, useNavigate, useRouterState, type LinkProps } from "@tanstack/react-router";
import { Bell, LogOut, Menu, Search } from "lucide-react";
import { useEffect, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { NAV_ITEMS } from "@/lib/admin-data";
import { listClassesForCounts } from "@/lib/classes-api";
import { countProfilesFn } from "@/lib/nav.functions";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { signOut, useSession } from "@/lib/auth";
import { AUTH_SEARCH_DEFAULTS } from "@/lib/auth-constants";
import { NoAccessPanel } from "@/components/auth/NoAccessPanel";
import { canAccessAdminRoute, hiringManagerHomePath, isHiringManagerOnly, isTraineeOnly, navItemsForRoles } from "@/lib/role-access";
import { useViewMode } from "@/lib/view-mode";
import alysonLogo from "@/assets/alyson-logo.svg";

export function AdminLayout({
  title,
  subtitle,
  actions,
  children,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();
  const { session, loading, bootstrapping, user, roles, bootstrapError, retryBootstrap } = useSession();
  const { mode, setMode } = useViewMode();
  const traineeOnly = isTraineeOnly(roles);
  const visibleNav = navItemsForRoles(roles);

  useEffect(() => {
    if (loading || bootstrapping) return;
    if (traineeOnly && mode !== "student") {
      setMode("student");
      navigate({ to: "/learn" });
    }
  }, [loading, bootstrapping, traineeOnly, mode, setMode, navigate]);

  useEffect(() => {
    if (loading || bootstrapping) return;
    if (session && roles.length > 0 && !canAccessAdminRoute(pathname, roles)) {
      navigate({
        to: traineeOnly ? "/learn" : isHiringManagerOnly(roles) ? hiringManagerHomePath() : "/",
      });
    }
  }, [loading, bootstrapping, session, roles, pathname, navigate, traineeOnly]);

  useEffect(() => {
    if (loading || bootstrapping) return;
    if (!session) navigate({ to: "/auth", search: AUTH_SEARCH_DEFAULTS });
  }, [session, loading, bootstrapping, navigate]);

  const { data: classes = [] } = useQuery({
    queryKey: ["classes", "counts"],
    queryFn: listClassesForCounts,
    enabled: !!session,
  });
  const { data: userCount = 0 } = useQuery({
    queryKey: ["nav", "user-count"],
    queryFn: () => countProfilesFn(),
    enabled: !!session,
    staleTime: 60_000,
  });

  const reviewCount = classes.filter((c) => c.status === "in-review").length;
  const draftCount = classes.filter((c) => c.status === "draft").length;

  const dynamicBadge = (to: string): string | undefined => {
    if (to === "/users" && userCount > 0) return String(userCount);
    if (to === "/courses" && reviewCount > 0) return `${reviewCount} review`;
    if (to === "/classes/new" && draftCount > 0) return `${draftCount} draft`;
    return undefined;
  };

  if (loading || bootstrapping || !session) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-muted-foreground">
        Loading…
      </div>
    );
  }

  if (roles.length === 0) {
    return (
      <NoAccessPanel
        email={user?.email}
        detail={bootstrapError}
        onRetry={retryBootstrap}
        onSignOut={() => navigate({ to: "/auth", search: AUTH_SEARCH_DEFAULTS })}
      />
    );
  }

  const initials =
    (user?.user_metadata?.display_name as string | undefined)
      ?.split(" ")
      .map((p) => p[0])
      .slice(0, 2)
      .join("")
      .toUpperCase() ??
    user?.email?.slice(0, 2).toUpperCase() ??
    "AT";

  const navList = (
    <ul className="space-y-0.5">
      {visibleNav.map((item) => {
        const active = item.to === "/" ? pathname === "/" : pathname.startsWith(item.to);
        const Icon = item.icon;
        return (
          <li key={item.to}>
            <Link
              to={item.to as LinkProps["to"]}
              className={`group flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-all ${
                active
                  ? "bg-card text-foreground font-semibold shadow-soft"
                  : "text-muted-foreground hover:bg-card/60 hover:text-foreground"
              }`}
            >
              <Icon
                className={`h-4 w-4 ${active ? "text-primary" : "text-muted-foreground group-hover:text-foreground"}`}
                strokeWidth={1.75}
              />
              <span className="flex-1">{item.label}</span>
              {dynamicBadge(item.to) ? (
                <span className="rounded-md bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                  {dynamicBadge(item.to)}
                </span>
              ) : null}
            </Link>
          </li>
        );
      })}
    </ul>
  );

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-60 flex-col border-r border-border bg-sidebar md:flex">
        <div className="flex h-16 items-center gap-2.5 border-b border-border px-5">
          <img src={alysonLogo} alt="Alyson" className="h-8 w-auto" />
          <div className="leading-tight">
            <div className="text-[13px] font-semibold tracking-tight">Alyson</div>
            <div className="text-[11px] text-muted-foreground">Training Project</div>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4">
          <div className="px-2 pb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Workspace
          </div>
          {navList}
        </nav>

        <div className="border-t border-border p-3 space-y-2">
          <button
            type="button"
            onClick={() => {
              const next = mode === "creator" ? "student" : "creator";
              setMode(next);
              if (next === "student") navigate({ to: "/learn" });
            }}
            className="w-full rounded-lg bg-primary/10 px-3 py-2 text-xs font-semibold text-primary"
          >
            {mode === "creator" ? "Creator mode" : "Student mode"}
          </button>
          <div className="flex items-center gap-2.5 rounded-lg p-2 hover:bg-card/60">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-primary to-primary-glow text-xs font-semibold text-primary-foreground">
              {initials}
            </div>
            <div className="min-w-0 flex-1 leading-tight">
              <div className="truncate text-[13px] font-medium">
                {(user?.user_metadata?.display_name as string | undefined) ?? "Trainer"}
              </div>
              <div className="truncate text-[11px] text-muted-foreground">{user?.email}</div>
            </div>
            <button
              onClick={async () => {
                await signOut();
                navigate({ to: "/auth", search: AUTH_SEARCH_DEFAULTS });
              }}
              className="text-muted-foreground hover:text-foreground"
              title="Sign out"
            >
              <LogOut className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </aside>

      <div className="flex min-h-screen flex-1 flex-col md:ml-60">
        <header className="sticky top-0 z-10 flex h-16 items-center gap-4 border-b border-border bg-background/85 px-4 backdrop-blur md:px-6">
          <Sheet>
            <SheetTrigger className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-card md:hidden">
              <Menu className="h-4 w-4" />
            </SheetTrigger>
            <SheetContent side="left" className="w-60 p-0">
              <div className="border-b border-border p-4">
                <img src={alysonLogo} alt="Alyson" className="h-8 w-auto" />
              </div>
              <nav className="p-3">{navList}</nav>
            </SheetContent>
          </Sheet>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-[22px] font-semibold tracking-tight text-foreground">
              {title}
            </h1>
            {subtitle ? (
              <p className="truncate text-[12px] text-muted-foreground">{subtitle}</p>
            ) : null}
          </div>
          <div className="relative hidden md:block">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search courses, users…"
              className="h-9 w-64 rounded-lg border-border bg-card pl-8 text-sm"
            />
          </div>
          <button className="relative inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground transition hover:text-foreground">
            <Bell className="h-4 w-4" strokeWidth={1.75} />
            <span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-primary" />
          </button>
          {actions}
        </header>

        <main className="flex-1 p-6 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
