import { Link, useRouterState } from "@tanstack/react-router";
import {
  Activity,
  BookOpen,
  ClipboardList,
  ScrollText,
} from "lucide-react";
import { type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { LearnSidebarNav } from "@/components/learn/LearnSidebar";
import { LearnMobileNav } from "@/components/learn/LearnMobileNav";
import { useSession } from "@/lib/auth";
import { isCandidateOnly } from "@/lib/role-access";

function FooterNavLink({
  to,
  pathname,
  icon: Icon,
  label,
}: {
  to: string;
  pathname: string;
  icon: typeof Activity;
  label: string;
}) {
  const active = pathname === to || pathname.startsWith(`${to}/`);
  return (
    <Link
      to={to}
      className={cn(
        "flex items-center gap-2 rounded-md px-2 py-1.5 text-xs font-medium",
        active ? "bg-[var(--learn-card)] text-foreground" : "text-muted-foreground hover:bg-[var(--learn-card)]/80",
      )}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </Link>
  );
}

export function DocsLearnLayout({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { roles } = useSession();
  const showTrial = isCandidateOnly(roles);

  const footerLinks = (
    <>
      <FooterNavLink to="/learn/assignments" pathname={pathname} icon={ClipboardList} label="Assessments" />
      <FooterNavLink to="/learn/policies" pathname={pathname} icon={ScrollText} label="Policies" />
      {showTrial ? (
        <FooterNavLink to="/learn/trial" pathname={pathname} icon={BookOpen} label="Trial project" />
      ) : null}
    </>
  );

  return (
    <div className="learn-shell flex min-h-[calc(100dvh-3.5rem)] flex-col bg-[var(--learn-bg)]">
      <LearnMobileNav footerLinks={footerLinks} />
      <div className="flex min-h-0 flex-1">
        <aside className="learn-sidebar hidden w-[var(--learn-sidebar-width)] shrink-0 flex-col border-r border-[var(--learn-border)] bg-[var(--learn-sidebar-bg)] md:flex">
          <div className="border-b border-[var(--learn-border)] p-3">
            <Link
              to="/learn/dashboard"
              className={cn(
                "flex items-center gap-2 rounded-[10px] border px-3 py-2 text-sm transition-colors",
                pathname.startsWith("/learn/dashboard")
                  ? "border-[var(--learn-accent)]/30 bg-[var(--learn-card)] shadow-sm"
                  : "border-transparent hover:bg-[var(--learn-card)]/80",
              )}
            >
              <Activity className="h-4 w-4 text-[var(--learn-accent)]" />
              <div>
                <p className="font-medium">Dashboard</p>
                <p className="text-xs text-muted-foreground">Your progress</p>
              </div>
            </Link>
          </div>
          <LearnSidebarNav />
          <div className="space-y-1 border-t border-[var(--learn-border)] p-2">{footerLinks}</div>
        </aside>
        <div id="learn-main" className="flex min-w-0 flex-1 flex-col">{children}</div>
      </div>
    </div>
  );
}
