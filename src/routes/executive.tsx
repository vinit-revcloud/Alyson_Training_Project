import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { QueryLoadError } from "@/components/admin/QueryLoadError";
import { Card } from "@/components/ui/card";
import { MetricCard } from "@/components/admin/MetricCard";
import { fetchExecutiveSummaryFn } from "@/lib/executive.functions";
import { Users, GraduationCap, Target, Mail, Sparkles, BarChart3, ArrowRight } from "lucide-react";

export const Route = createFileRoute("/executive")({
  head: () => ({ meta: [{ title: "Executive — Alyson Training" }] }),
  component: ExecutivePage,
});

function ExecutivePage() {
  const load = useServerFn(fetchExecutiveSummaryFn);
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["executive-summary"],
    queryFn: () => load(),
  });

  const s = data;

  return (
    <AdminLayout
      title="Executive overview"
      subtitle="Training health, hiring funnel, and platform costs"
      actions={
        <div className="flex gap-2">
          <Link to="/analytics">
            <span className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-sm hover:bg-muted">
              <BarChart3 className="h-4 w-4" /> Analytics
            </span>
          </Link>
          <Link to="/hiring/reports">
            <span className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-sm hover:bg-muted">
              Hiring reports <ArrowRight className="h-3.5 w-3.5" />
            </span>
          </Link>
        </div>
      }
    >
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading executive metrics…</p>
      ) : isError ? (
        <QueryLoadError message="Could not load executive summary" onRetry={() => void refetch()} />
      ) : (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <MetricCard label="Active users (30d)" value={String(s?.activeUsers30d ?? 0)} icon={Users} />
            <MetricCard label="Published classes" value={String(s?.publishedClasses ?? 0)} icon={GraduationCap} />
            <MetricCard label="Assignment completion" value={`${s?.assignmentCompletionRate ?? 0}%`} icon={Target} />
            <MetricCard label="Email success (30d)" value={`${s?.emailSuccessRate ?? 0}%`} icon={Mail} />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="rounded-xl border-border p-5 shadow-soft">
              <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
                <Sparkles className="h-4 w-4 text-primary" /> AI usage (30 days)
              </h3>
              <p className="text-2xl font-bold">${(s?.ai.last30DaysCostUsd ?? 0).toFixed(2)}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {s?.ai.totalCalls ?? 0} total calls · est. cost
              </p>
              <ul className="mt-4 space-y-1 text-sm text-muted-foreground">
                {(s?.ai.byFeature ?? []).slice(0, 5).map((f) => (
                  <li key={f.feature} className="flex justify-between">
                    <span>{f.feature}</span>
                    <span>${f.costUsd.toFixed(2)} ({f.calls})</span>
                  </li>
                ))}
              </ul>
            </Card>

            <Card className="rounded-xl border-border p-5 shadow-soft">
              <h3 className="mb-3 text-sm font-semibold">Hiring funnel</h3>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-muted-foreground">Sessions</p>
                  <p className="text-xl font-semibold">{s?.hiring.total ?? 0}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Evaluated</p>
                  <p className="text-xl font-semibold">{s?.hiring.evaluated ?? 0}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Classes in review</p>
                  <p className="text-xl font-semibold">{s?.inReviewClasses ?? 0}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Strong hire</p>
                  <p className="text-xl font-semibold">{s?.hiring.strongHire ?? 0}</p>
                </div>
              </div>
            </Card>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
