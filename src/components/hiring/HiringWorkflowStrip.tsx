import { Link, useRouterState } from "@tanstack/react-router";
import { BarChart3, ClipboardCheck, Video } from "lucide-react";
import { cn } from "@/lib/utils";

const STEPS = [
  {
    to: "/interviews/assessments",
    label: "1. Interview tests",
    hint: "Build screening assessments",
    icon: ClipboardCheck,
    match: (path: string) => path.startsWith("/interviews/assessments") || path.includes("/assessments/builder"),
  },
  {
    to: "/interviews",
    label: "2. Schedule & proctor",
    hint: "Send magic links to candidates",
    icon: Video,
    match: (path: string) =>
      path === "/interviews" || (path.startsWith("/interviews/") && !path.startsWith("/interviews/assessments")),
  },
  {
    to: "/hiring/reports",
    label: "3. Hiring reports",
    hint: "Scores, recommendations, funnel",
    icon: BarChart3,
    match: (path: string) => path.startsWith("/hiring"),
  },
] as const;

/** Step-by-step nav for HR / hiring managers across interview workflow pages. */
export function HiringWorkflowStrip({ className }: { className?: string }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <nav
      className={cn(
        "rounded-xl border border-violet-200/80 bg-violet-50/50 p-3 dark:border-violet-900/40 dark:bg-violet-950/20",
        className,
      )}
      aria-label="Hiring workflow"
    >
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-violet-800 dark:text-violet-300">
        Candidate screening workflow
      </p>
      <ol className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-stretch">
        {STEPS.map((step) => {
          const active = step.match(pathname);
          const Icon = step.icon;
          return (
            <li key={step.to} className="min-w-0 flex-1 sm:min-w-[10rem]">
              <Link
                to={step.to}
                className={cn(
                  "flex h-full flex-col rounded-lg border px-3 py-2 transition-colors",
                  active
                    ? "border-violet-400 bg-white shadow-sm dark:border-violet-600 dark:bg-background"
                    : "border-transparent bg-white/60 hover:border-violet-200 hover:bg-white dark:bg-background/40 dark:hover:border-violet-800",
                )}
              >
                <span className="flex items-center gap-1.5 text-[12px] font-semibold text-foreground">
                  <Icon className="h-3.5 w-3.5 shrink-0 text-violet-600" />
                  {step.label}
                </span>
                <span className="mt-0.5 text-[11px] text-muted-foreground">{step.hint}</span>
              </Link>
            </li>
          );
        })}
      </ol>
      <p className="mt-2 text-[11px] text-muted-foreground">
        Training assignments for employees live under{" "}
        <Link to="/assignments" className="font-medium text-foreground underline-offset-2 hover:underline">
          Assignments
        </Link>
        {" "}— separate from candidate interviews.
      </p>
    </nav>
  );
}
