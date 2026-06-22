import { createFileRoute, Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { LogOut } from "lucide-react";
import { useEffect } from "react";
import { NoAccessPanel } from "@/components/auth/NoAccessPanel";
import { DocsLearnLayout } from "@/components/learn/DocsLearnLayout";
import { signOut, useSession } from "@/lib/auth";
import { AUTH_SEARCH_DEFAULTS } from "@/lib/auth-constants";
import { canAccessLearnRoute, canAccessLearnSubroute, isLearnerOnly } from "@/lib/role-access";
import { useViewMode } from "@/lib/view-mode";
import alysonLogo from "@/assets/alyson-logo.svg";

export const Route = createFileRoute("/learn")({
  component: LearnLayout,
});

function LearnLayout() {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { session, loading, bootstrapping, user, roles, bootstrapError, retryBootstrap } =
    useSession();
  const { mode, setMode } = useViewMode();
  const learnerOnly = isLearnerOnly(roles);

  useEffect(() => {
    if (!loading && !session) navigate({ to: "/auth", search: AUTH_SEARCH_DEFAULTS });
  }, [session, loading, navigate]);

  useEffect(() => {
    if (loading || !session || !roles.length) return;
    if (!canAccessLearnSubroute(pathname, roles)) {
      navigate({ to: "/learn/dashboard" });
    }
  }, [pathname, roles, session, loading, navigate]);

  if (loading || bootstrapping || !session) {
    return (
      <div className="flex min-h-dvh items-center justify-center text-muted-foreground">
        Loading…
      </div>
    );
  }

  if (!canAccessLearnRoute(roles)) {
    return (
      <NoAccessPanel
        email={user?.email}
        detail={bootstrapError}
        onRetry={retryBootstrap}
        onSignOut={() => navigate({ to: "/auth", search: AUTH_SEARCH_DEFAULTS })}
      />
    );
  }

  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <a
        href="#learn-main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-primary focus:px-3 focus:py-2 focus:text-primary-foreground"
      >
        Skip to main content
      </a>
      <header className="sticky top-0 z-10 flex h-14 items-center justify-between border-b border-border bg-background/90 px-4 backdrop-blur">
        <div className="flex items-center gap-2">
          <img src={alysonLogo} alt="Alyson" className="h-7 w-auto" />
          <span className="text-sm font-semibold">Alyson Learning</span>
        </div>
        <button
          onClick={() => void signOut()}
          className="rounded-lg p-2 text-muted-foreground hover:text-foreground"
          title="Sign out"
        >
          <LogOut className="h-4 w-4" />
        </button>
      </header>

      <DocsLearnLayout>
        <Outlet />
      </DocsLearnLayout>

      {!learnerOnly ? (
        <footer className="sticky bottom-0 flex items-center justify-between border-t border-border bg-card px-4 py-2">
          <button
            type="button"
            onClick={() => setMode(mode === "student" ? "creator" : "student")}
            className="rounded-lg bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary"
          >
            {mode === "student" ? "Student mode" : "Creator mode"}
          </button>
          <span className="truncate text-xs text-muted-foreground">{user?.email}</span>
          {mode === "creator" ? (
            <Link to="/" className="text-xs font-medium text-primary hover:underline">
              Admin console
            </Link>
          ) : null}
        </footer>
      ) : (
        <footer className="border-t border-border px-4 py-2 text-center text-xs text-muted-foreground">
          {user?.email}
        </footer>
      )}
    </div>
  );
}
