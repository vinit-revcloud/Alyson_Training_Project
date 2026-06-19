import { Link, useRouterState } from "@tanstack/react-router";
import { ClipboardCheck, FileText, Video } from "lucide-react";
import { cn } from "@/lib/utils";

const STEPS = [
  {
    to: "/assessments",
    label: "Assessments",
    hint: "Course tests for learners",
    icon: ClipboardCheck,
    match: (path: string) =>
      path === "/assessments" ||
      (path.startsWith("/assessments/") &&
        !path.startsWith("/assessments/builder") &&
        path !== "/assessments/templates"),
  },
  {
    to: "/assignments",
    label: "Assignments",
    hint: "Assign tests to trainees",
    icon: FileText,
    match: (path: string) => path === "/assignments",
  },
] as const;

/** Links training assessment + assignment pages for trainers. */
export function TrainingWorkflowStrip({ className }: { className?: string }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <nav
      className={cn("rounded-xl border border-border bg-muted/30 p-3", className)}
      aria-label="Training workflow"
    >
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        Employee training workflow
      </p>
      <ol className="flex flex-col gap-2 sm:flex-row sm:items-stretch">
        {STEPS.map((step) => {
          const active = step.match(pathname);
          const Icon = step.icon;
          return (
            <li key={step.to} className="min-w-0 flex-1 sm:max-w-xs">
              <Link
                to={step.to}
                className={cn(
                  "flex h-full flex-col rounded-lg border px-3 py-2 transition-colors",
                  active
                    ? "border-primary/30 bg-card shadow-sm"
                    : "border-transparent bg-card/60 hover:border-border hover:bg-card",
                )}
              >
                <span className="flex items-center gap-1.5 text-[12px] font-semibold">
                  <Icon className="h-3.5 w-3.5 shrink-0 text-primary" />
                  {step.label}
                </span>
                <span className="mt-0.5 text-[11px] text-muted-foreground">{step.hint}</span>
              </Link>
            </li>
          );
        })}
        <li className="flex min-w-0 flex-1 items-center sm:max-w-sm">
          <Link
            to="/interviews"
            className="flex w-full items-center gap-2 rounded-lg border border-dashed border-violet-300/80 bg-violet-50/40 px-3 py-2 text-[11px] text-violet-900 hover:bg-violet-50 dark:border-violet-800 dark:bg-violet-950/20 dark:text-violet-200"
          >
            <Video className="h-3.5 w-3.5 shrink-0" />
            <span>
              <span className="font-semibold">Hiring / interviews</span>
              <span className="text-muted-foreground"> — external candidates, separate workflow</span>
            </span>
          </Link>
        </li>
      </ol>
    </nav>
  );
}
