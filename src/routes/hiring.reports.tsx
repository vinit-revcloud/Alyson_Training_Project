import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { Card } from "@/components/ui/card";
import { MetricCard } from "@/components/admin/MetricCard";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  fetchCandidateReportsFn,
  fetchHiringFunnelFn,
} from "@/lib/hiring/hiring-reports.functions";
import { Users, Target, AlertTriangle, CheckCircle2, Video, ArrowRight, Plus } from "lucide-react";
import { HiringWorkflowStrip } from "@/components/hiring/HiringWorkflowStrip";

export const Route = createFileRoute("/hiring/reports")({
  head: () => ({ meta: [{ title: "Hiring Reports — Alyson" }] }),
  component: HiringReportsPage,
});

const REC_LABEL: Record<string, string> = {
  strong_hire: "Strong hire",
  hire: "Hire",
  borderline: "Borderline",
  no_hire: "No hire",
};

function HiringReportsPage() {
  const loadFunnel = useServerFn(fetchHiringFunnelFn);
  const loadCandidates = useServerFn(fetchCandidateReportsFn);

  const funnel = useQuery({ queryKey: ["hiring-funnel"], queryFn: () => loadFunnel() });
  const candidates = useQuery({
    queryKey: ["hiring-candidates"],
    queryFn: () => loadCandidates(),
  });

  const f = funnel.data;
  const rows = candidates.data ?? [];
  const loadError =
    funnel.error instanceof Error
      ? funnel.error.message
      : candidates.error instanceof Error
        ? candidates.error.message
        : null;

  return (
    <AdminLayout
      title="Hiring Reports"
      subtitle="Candidate screening funnel, AI recommendations, and proctoring signals"
      actions={
        <div className="flex flex-wrap gap-2">
          <Link
            to="/interviews/assessments"
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium hover:bg-accent"
          >
            <Plus className="h-3.5 w-3.5" /> Interview tests
          </Link>
          <Link
            to="/interviews"
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium hover:bg-accent"
          >
            <Video className="h-3.5 w-3.5" /> Manage interviews
          </Link>
        </div>
      }
    >
      <HiringWorkflowStrip className="mb-5" />
      <div className="space-y-6">
        <section className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6">
          <MetricCard label="Total sessions" value={String(f?.total ?? 0)} icon={Users} />
          <MetricCard label="Evaluated" value={String(f?.evaluated ?? 0)} icon={CheckCircle2} />
          <MetricCard label="In pipeline" value={String(f?.inProgress ?? 0)} icon={Video} />
          <MetricCard label="Avg AI score" value={f?.avgAiScore != null ? `${f.avgAiScore}%` : "—"} icon={Target} />
          <MetricCard label="Strong hire" value={String(f?.strongHire ?? 0)} icon={CheckCircle2} />
          <MetricCard
            label="Proctor flags"
            value={String(f?.proctoringIncidents ?? 0)}
            icon={AlertTriangle}
            trend={(f?.proctoringIncidents ?? 0) > 0 ? "down" : "flat"}
          />
        </section>

        {f?.byRole?.length ? (
          <Card className="rounded-xl border-border bg-card p-5 shadow-soft">
            <h2 className="text-[14px] font-semibold">By role</h2>
            <div className="mt-3 flex flex-wrap gap-2">
              {f.byRole.map((r) => (
                <Badge key={r.role} variant="outline" className="text-[12px]">
                  {r.role}: {r.count}
                  {r.avgScore != null ? ` · ${r.avgScore}% avg` : ""}
                </Badge>
              ))}
            </div>
          </Card>
        ) : null}

        {loadError ? (
          <Card className="rounded-xl border-rose-200 bg-rose-50 p-4 text-[13px] text-rose-800 shadow-soft">
            Could not load hiring report data: {loadError}
          </Card>
        ) : null}

        <Card className="rounded-xl border-border bg-card p-5 shadow-soft">
          <h2 className="text-[14px] font-semibold">Candidate overview</h2>
          <p className="text-[12px] text-muted-foreground">
            All interview sessions appear here regardless of status. Click a row for AI reasoning,
            proctoring events, and evaluation history.
          </p>
          {candidates.isLoading ? (
            <p className="mt-4 text-[13px] text-muted-foreground">Loading candidates…</p>
          ) : rows.length === 0 && !loadError ? (
            <p className="mt-4 text-[13px] text-muted-foreground">
              No interview sessions yet. Schedule one from{" "}
              <Link to="/interviews" className="font-medium text-primary hover:underline">
                Interviews
              </Link>
              .
            </p>
          ) : null}
          <Table className="mt-4">
            <TableHeader>
              <TableRow>
                <TableHead>Candidate</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Assessment</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>AI score</TableHead>
                <TableHead>Recommendation</TableHead>
                <TableHead>Eval runs</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((c) => (
                <TableRow key={c.id}>
                  <TableCell>
                    <div className="font-medium">{c.candidate_name}</div>
                    <div className="text-[11px] text-muted-foreground">{c.candidate_email}</div>
                  </TableCell>
                  <TableCell className="text-[12px]">
                    {c.role}
                    <div className="text-muted-foreground">{c.level}</div>
                  </TableCell>
                  <TableCell className="text-[12px]">{c.assessment_title}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-[10px] capitalize">
                      {c.status.replace("_", " ")}
                    </Badge>
                  </TableCell>
                  <TableCell>{c.final_score != null ? `${c.final_score}%` : "—"}</TableCell>
                  <TableCell>
                    {c.final_recommendation
                      ? REC_LABEL[c.final_recommendation] ?? c.final_recommendation
                      : "—"}
                  </TableCell>
                  <TableCell>{c.evaluation_runs}</TableCell>
                  <TableCell>
                    <Link
                      to="/interviews/$sessionId"
                      params={{ sessionId: c.id }}
                      className="inline-flex items-center gap-1 text-[12px] font-medium text-primary hover:underline"
                    >
                      Details <ArrowRight className="h-3 w-3" />
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      </div>
    </AdminLayout>
  );
}
