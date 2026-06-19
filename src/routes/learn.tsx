import { createFileRoute, Link, Outlet, useNavigate } from "@tanstack/react-router";
import { BookOpen, ClipboardList, LogOut } from "lucide-react";
import { useEffect } from "react";
import { NoAccessPanel } from "@/components/auth/NoAccessPanel";
import { signOut, useSession } from "@/lib/auth";
import { AUTH_SEARCH_DEFAULTS } from "@/lib/auth-constants";
import { canAccessLearnRoute } from "@/lib/role-access";
import { useViewMode } from "@/lib/view-mode";
import alysonLogo from "@/assets/alyson-logo.svg";

export const Route = createFileRoute("/learn")({
  component: LearnLayout,
});

function LearnLayout() {
  const navigate = useNavigate();
  const { session, loading, bootstrapping, user, roles, bootstrapError, retryBootstrap } = useSession();
  const { mode, setMode } = useViewMode();

  useEffect(() => {
    if (!loading && !session) navigate({ to: "/auth", search: AUTH_SEARCH_DEFAULTS });
  }, [session, loading, navigate]);

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
      <header className="sticky top-0 z-10 flex h-14 items-center justify-between border-b border-border bg-background/90 px-4 backdrop-blur">
        <div className="flex items-center gap-2">
          <img src={alysonLogo} alt="Alyson" className="h-7 w-auto" />
          <span className="text-sm font-semibold">My Learning</span>
        </div>
        <nav className="flex items-center gap-1">
          <Link
            to="/learn"
            className="flex items-center gap-1 rounded-lg px-3 py-2 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <ClipboardList className="h-4 w-4" />
            Assignments
          </Link>
          <Link
            to="/learn/courses"
            className="flex items-center gap-1 rounded-lg px-3 py-2 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <BookOpen className="h-4 w-4" />
            Courses
          </Link>
          <button
            onClick={() => void signOut()}
            className="ml-1 rounded-lg p-2 text-muted-foreground hover:text-foreground"
            title="Sign out"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </nav>
      </header>

      <main className="flex-1">
        <Outlet />
      </main>

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
    </div>
  );
}
