import { Link } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertCircle,
  BookOpen,
  CheckCircle2,
  Clock,
  LayoutDashboard,
} from "lucide-react";
import { MetricCard } from "@/components/admin/MetricCard";
import type { LearnerDashboardStats } from "@/lib/onboarding/onboarding-nav.server";

const STATUS_BADGE: Record<
  string,
  { label: string; variant: "default" | "secondary" | "destructive" | "outline" }
> = {
  not_started: { label: "Not started", variant: "outline" },
  in_progress: { label: "In progress", variant: "secondary" },
  completed: { label: "Completed", variant: "default" },
  overdue: { label: "Overdue", variant: "destructive" },
  pending_assessment: { label: "Assessment pending", variant: "secondary" },
};

export function LearnDashboard({
  data,
  isLoading,
  policyPending,
  resumeCourseId,
  resumeSectionId,
}: {
  data: LearnerDashboardStats | undefined;
  isLoading: boolean;
  policyPending: number;
  resumeCourseId?: string | null;
  resumeSectionId?: string | null;
}) {
  return (
    <div className="learn-panel mx-auto max-w-3xl flex-1 space-y-6 p-6">
      <div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <LayoutDashboard className="h-3.5 w-3.5" />
          Learning dashboard
        </div>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Your onboarding progress</h1>
        <p className="text-sm text-muted-foreground">Generated {new Date().toLocaleString()}</p>
      </div>

      {resumeCourseId && resumeSectionId ? (
        <Card className="learn-card border-[var(--learn-border)] p-4">
          <p className="text-sm font-medium">Pick up where you left off</p>
          <Button asChild className="mt-3 bg-[var(--learn-accent)] hover:bg-[var(--learn-accent)]/90">
            <Link
              to="/learn/guide/$courseId/$sectionId"
              params={{ courseId: resumeCourseId, sectionId: resumeSectionId }}
            >
              Continue learning
            </Link>
          </Button>
        </Card>
      ) : null}

      {policyPending > 0 ? (
        <Card className="learn-card border-amber-200 bg-amber-50 p-4 dark:border-amber-900 dark:bg-amber-950">
          <p className="text-sm font-medium">
            {policyPending} policy document(s) require your acknowledgement.
          </p>
          <Link to="/learn/policies" className="mt-2 inline-block text-sm text-[var(--learn-accent)] hover:underline">
            Review policies →
          </Link>
        </Card>
      ) : null}

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (
        <>
          <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <MetricCard label="Total modules" value={String(data?.totalModules ?? 0)} icon={BookOpen} />
            <MetricCard label="Completed" value={String(data?.completed ?? 0)} icon={CheckCircle2} />
            <MetricCard label="In progress" value={String(data?.inProgress ?? 0)} icon={Clock} />
            <MetricCard label="Overdue tests" value={String(data?.overdueAssessments ?? 0)} icon={AlertCircle} />
          </section>

          <section>
            <h2 className="mb-3 text-sm font-semibold">Your learning items</h2>
            <div className="space-y-2">
              {(data?.items ?? []).length === 0 ? (
                <Card className="learn-card p-6 text-center text-sm text-muted-foreground">
                  No modules assigned yet. Your trainer will publish onboarding content soon.
                </Card>
              ) : (
                data?.items.map((item) => {
                  const badge = STATUS_BADGE[item.status] ?? STATUS_BADGE.not_started;
                  const isGuide = item.href.startsWith("/learn/guide");
                  return (
                    <Card
                      key={item.id}
                      className="learn-card flex items-center justify-between gap-3 border-[var(--learn-border)] p-4"
                    >
                      <div className="min-w-0">
                        <Link
                          to={isGuide ? "/learn/guide/$courseId/$sectionId" : "/attempt/$assignmentId"}
                          params={
                            isGuide
                              ? {
                                  courseId: item.href.split("/")[3]!,
                                  sectionId: item.href.split("/")[4]!,
                                }
                              : { assignmentId: item.id }
                          }
                          className="text-sm font-medium text-[var(--learn-accent)] hover:underline"
                        >
                          {item.title}
                        </Link>
                        <p className="text-xs text-muted-foreground">{item.subtitle}</p>
                      </div>
                      <Badge variant={badge.variant} className="shrink-0 text-xs">
                        {badge.label}
                      </Badge>
                    </Card>
                  );
                })
              )}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
