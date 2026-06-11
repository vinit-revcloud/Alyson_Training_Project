import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MetricCard } from "@/components/admin/MetricCard";
import { DEPARTMENTS } from "@/lib/departments";
import { fetchDashboardMetrics } from "@/lib/dashboard-metrics";
import { fetchDashboardSummary } from "@/lib/dashboard-summary-api";
import { getAssignmentMetrics } from "@/lib/test-assignments-api";
import { fetchEmailDeliverySummaryFn } from "@/lib/email/email-settings.functions";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  LineChart,
  Line,
  BarChart,
  Bar,
  Cell,
  PieChart,
  Pie,
  Legend,
} from "recharts";
import {
  Users,
  GraduationCap,
  Target,
  AlertTriangle,
  TrendingUp,
  Mail,
  Send,
  Clock,
  CheckCircle2,
  BookOpen,
  ArrowRight,
} from "lucide-react";

export const Route = createFileRoute("/analytics")({
  head: () => ({
    meta: [
      { title: "Analytics — Alyson Training" },
      {
        name: "description",
        content: "Live learner performance, assignment health, study engagement, and email delivery.",
      },
    ],
  }),
  component: AnalyticsPage,
});

const ACCENT = "#3B82F6";
const DONUT_COLORS = ["#3B82F6", "#22C55E", "#F59E0B", "#EF4444", "#8B5CF6"];

const DEPT_FILTERS = ["All", ...DEPARTMENTS] as const;
type Department = (typeof DEPT_FILTERS)[number];

const tooltipStyle = {
  background: "var(--popover)",
  border: "1px solid var(--border)",
  borderRadius: 10,
  fontSize: 12,
} as const;

function AnalyticsPage() {
  const loadEmailSummary = useServerFn(fetchEmailDeliverySummaryFn);
  const [department, setDepartment] = useState<Department>("All");

  const { data: metrics, isLoading: metricsLoading } = useQuery({
    queryKey: ["dashboard-metrics"],
    queryFn: fetchDashboardMetrics,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });
  const { data: summary } = useQuery({
    queryKey: ["dashboard-summary"],
    queryFn: fetchDashboardSummary,
    refetchInterval: 60_000,
  });
  const { data: assignments } = useQuery({
    queryKey: ["assignment-metrics"],
    queryFn: getAssignmentMetrics,
    refetchInterval: 60_000,
  });
  const { data: emailStats } = useQuery({
    queryKey: ["email-delivery-summary-analytics"],
    queryFn: () => loadEmailSummary(),
    refetchInterval: 60_000,
  });

  const filterDept = (dept: string) => department === "All" || dept === department;

  const atRisk = useMemo(
    () => (metrics?.atRisk ?? []).filter((u) => filterDept(u.department)),
    [metrics?.atRisk, department],
  );
  const topPerformers = useMemo(
    () => (metrics?.topPerformers ?? []).filter((u) => filterDept(u.department)),
    [metrics?.topPerformers, department],
  );
  const learnersByDept = useMemo(
    () =>
      department === "All"
        ? (metrics?.learnersByDepartment ?? [])
        : (metrics?.learnersByDepartment ?? []).filter((d) => d.department === department),
    [metrics?.learnersByDepartment, department],
  );
  const completionByDept = useMemo(
    () =>
      department === "All"
        ? (metrics?.completionByDept ?? [])
        : (metrics?.completionByDept ?? []).filter((d) => d.name === department),
    [metrics?.completionByDept, department],
  );
  const scoresByDept = useMemo(
    () =>
      department === "All"
        ? (assignments?.scoresByDepartment ?? [])
        : (assignments?.scoresByDepartment ?? []).filter((d) => d.department === department),
    [assignments?.scoresByDepartment, department],
  );

  return (
    <AdminLayout
      title="Platform Analytics"
      subtitle="Live learner performance, assignment health, study engagement, and email delivery"
      actions={
        <select
          value={department}
          onChange={(e) => setDepartment(e.target.value as Department)}
          className="h-9 rounded-lg border border-border bg-card px-3 text-[12px]"
        >
          {DEPT_FILTERS.map((d) => (
            <option key={d} value={d}>
              {d === "All" ? "All departments" : d}
            </option>
          ))}
        </select>
      }
    >
      <div className="space-y-6">
        {/* Platform overview */}
        <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
          <MetricCard
            label="Total users"
            value={String(summary?.totalUsers ?? 0)}
            icon={Users}
            sub="registered profiles"
          />
          <MetricCard
            label="Active courses"
            value={String(summary?.activeCourses ?? 0)}
            icon={GraduationCap}
            sub="published"
          />
          <MetricCard
            label="In progress"
            value={String(summary?.activeAssignments ?? 0)}
            icon={Clock}
            sub="open assignments"
          />
          <MetricCard
            label="Completed"
            value={String(summary?.completedAssignments ?? 0)}
            icon={CheckCircle2}
            sub="passed assignments"
          />
          <MetricCard
            label="Completion %"
            value={`${summary?.avgCompletionPct ?? 0}%`}
            icon={Target}
            sub="across assignments"
          />
          <MetricCard
            label="Overdue"
            value={String(summary?.overdueCount ?? 0)}
            trend={(summary?.overdueCount ?? 0) > 0 ? "down" : "flat"}
            icon={AlertTriangle}
            sub="past due date"
          />
        </section>

        {/* Assignment health */}
        <section>
          <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Assignment health
          </h2>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <MetricCard
              label="Total assignments"
              value={String(assignments?.total ?? 0)}
              icon={BookOpen}
              sub={`${assignments?.passed ?? 0} passed`}
            />
            <MetricCard
              label="Completion rate"
              value={`${assignments?.completionPct ?? 0}%`}
              icon={TrendingUp}
              sub={`${assignments?.in_progress ?? 0} in progress`}
            />
            <MetricCard
              label="Failed / capped"
              value={String(assignments?.failed_capped ?? 0)}
              trend="down"
              icon={AlertTriangle}
              sub={`${assignments?.failureRetakeRate ?? 0}% retake rate`}
            />
            <MetricCard
              label="Expired"
              value={String(assignments?.expired ?? 0)}
              trend="down"
              icon={Clock}
              sub="overdue assignments"
            />
          </div>
        </section>

        {/* Trends */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card className="rounded-xl border-border bg-card p-5 shadow-soft">
            <div className="text-[14px] font-semibold text-foreground">Learner activity (7 days)</div>
            <div className="text-[12px] text-muted-foreground">Daily active learners vs completions</div>
            <div className="mt-4 h-56">
              {metricsLoading ? (
                <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                  Loading…
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={metrics?.progressTrend ?? []} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                    <defs>
                      <linearGradient id="analyticsActive" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={ACCENT} stopOpacity={0.3} />
                        <stop offset="100%" stopColor={ACCENT} stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke="var(--border)" vertical={false} strokeDasharray="3 3" />
                    <XAxis dataKey="day" tickLine={false} axisLine={false} fontSize={11} />
                    <YAxis tickLine={false} axisLine={false} fontSize={11} />
                    <Tooltip contentStyle={tooltipStyle} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Area
                      type="monotone"
                      name="Active"
                      dataKey="active"
                      stroke={ACCENT}
                      strokeWidth={2}
                      fill="url(#analyticsActive)"
                    />
                    <Area
                      type="monotone"
                      name="Completed"
                      dataKey="completed"
                      stroke="#22C55E"
                      strokeWidth={2}
                      fill="#22C55E22"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>
          </Card>

          <Card className="rounded-xl border-border bg-card p-5 shadow-soft">
            <div className="text-[14px] font-semibold text-foreground">Average score trend</div>
            <div className="text-[12px] text-muted-foreground">Graded attempts by day</div>
            <div className="mt-4 h-56">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={metrics?.scoreTrend ?? []} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                  <CartesianGrid stroke="var(--border)" vertical={false} strokeDasharray="3 3" />
                  <XAxis dataKey="day" tickLine={false} axisLine={false} fontSize={11} />
                  <YAxis tickLine={false} axisLine={false} fontSize={11} domain={[0, 100]} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Line type="monotone" dataKey="score" stroke={ACCENT} strokeWidth={2.5} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </div>

        {/* Distribution charts */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <Card className="rounded-xl border-border bg-card p-5 shadow-soft">
            <div className="text-[14px] font-semibold text-foreground">Assignment status</div>
            <div className="mt-4 h-52">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={metrics?.assignmentStatus ?? []} margin={{ top: 8, left: -18, right: 4 }}>
                  <CartesianGrid stroke="var(--border)" vertical={false} strokeDasharray="3 3" />
                  <XAxis dataKey="name" tickLine={false} axisLine={false} fontSize={10} />
                  <YAxis tickLine={false} axisLine={false} fontSize={10} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Bar dataKey="count" radius={[6, 6, 0, 0]} fill={ACCENT} fillOpacity={0.85} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <Card className="rounded-xl border-border bg-card p-5 shadow-soft">
            <div className="text-[14px] font-semibold text-foreground">Completion by department</div>
            <div className="mt-4 h-52">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => `${v}%`} />
                  <Pie
                    data={completionByDept}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={45}
                    outerRadius={75}
                    paddingAngle={2}
                  >
                    {completionByDept.map((_, i) => (
                      <Cell key={i} fill={DONUT_COLORS[i % DONUT_COLORS.length]} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <Card className="rounded-xl border-border bg-card p-5 shadow-soft">
            <div className="text-[14px] font-semibold text-foreground">Score distribution</div>
            <div className="mt-4 h-52">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={assignments?.scoreDistribution ?? []} margin={{ top: 8, left: -18, right: 4 }}>
                  <CartesianGrid stroke="var(--border)" vertical={false} strokeDasharray="3 3" />
                  <XAxis dataKey="bucket" tickLine={false} axisLine={false} fontSize={10} />
                  <YAxis tickLine={false} axisLine={false} fontSize={10} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Bar dataKey="count" fill="#8B5CF6" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </div>

        {/* Department breakdown */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card className="rounded-xl border-border bg-card p-5 shadow-soft">
            <div className="text-[14px] font-semibold text-foreground">Learners by department</div>
            <div className="mt-4 h-48">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={learnersByDept} margin={{ top: 8, left: -22, right: 4 }}>
                  <CartesianGrid stroke="var(--border)" vertical={false} strokeDasharray="3 3" />
                  <XAxis dataKey="department" tickLine={false} axisLine={false} fontSize={10} />
                  <YAxis tickLine={false} axisLine={false} fontSize={10} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Bar dataKey="learners" fill={ACCENT} radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <Card className="rounded-xl border-border bg-card p-5 shadow-soft">
            <div className="text-[14px] font-semibold text-foreground">Avg score by department</div>
            <div className="mt-4 h-48">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={scoresByDept} margin={{ top: 8, left: -22, right: 4 }}>
                  <CartesianGrid stroke="var(--border)" vertical={false} strokeDasharray="3 3" />
                  <XAxis dataKey="department" tickLine={false} axisLine={false} fontSize={10} />
                  <YAxis tickLine={false} axisLine={false} fontSize={10} domain={[0, 100]} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Bar dataKey="avgScore" fill="#22C55E" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </div>

        {/* Learner insights */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card className="rounded-xl border-border bg-card p-5 shadow-soft">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-[14px] font-semibold text-foreground">At-risk learners</div>
                <div className="text-[12px] text-muted-foreground">Overdue or low progress</div>
              </div>
              <Link to="/users" className="text-[12px] font-medium text-primary hover:underline">
                View users <ArrowRight className="inline h-3 w-3" />
              </Link>
            </div>
            <ul className="mt-4 space-y-2">
              {atRisk.length === 0 ? (
                <li className="text-[12px] text-muted-foreground">Everyone on track</li>
              ) : (
                atRisk.map((u) => (
                  <li
                    key={u.userId}
                    className="flex items-center justify-between rounded-lg border border-border bg-background px-3 py-2"
                  >
                    <div>
                      <div className="text-[13px] font-medium">{u.name}</div>
                      <div className="text-[11px] text-muted-foreground">
                        {u.department} · {u.overdue} overdue · {u.progressPct}% complete
                      </div>
                    </div>
                    <Badge variant="outline" className="text-[10px] text-destructive">
                      At risk
                    </Badge>
                  </li>
                ))
              )}
            </ul>
          </Card>

          <Card className="rounded-xl border-border bg-card p-5 shadow-soft">
            <div className="text-[14px] font-semibold text-foreground">Top performers</div>
            <div className="text-[12px] text-muted-foreground">Highest average scores</div>
            <ul className="mt-4 space-y-2">
              {(topPerformers.length ? topPerformers : metrics?.topPerformers ?? []).length === 0 ? (
                <li className="text-[12px] text-muted-foreground">No graded attempts yet</li>
              ) : (
                (topPerformers.length ? topPerformers : metrics?.topPerformers ?? []).map((u) => (
                  <li
                    key={u.userId}
                    className="flex items-center justify-between rounded-lg border border-border bg-background px-3 py-2"
                  >
                    <div>
                      <div className="text-[13px] font-medium">{u.name}</div>
                      <div className="text-[11px] text-muted-foreground">
                        {u.department} · {u.attempts} attempts
                      </div>
                    </div>
                    <span className="text-[13px] font-semibold text-success">{u.avgScore}%</span>
                  </li>
                ))
              )}
            </ul>
          </Card>
        </div>

        {/* Study engagement + quality signals */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <Card className="rounded-xl border-border bg-card p-5 shadow-soft">
            <div className="text-[14px] font-semibold text-foreground">Study engagement</div>
            <div className="mt-3 space-y-2 text-[12px]">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Cards read (7d)</span>
                <span className="font-medium">{metrics?.studyEffort.totalCardsRead ?? 0}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Avg seconds / card</span>
                <span className="font-medium">{metrics?.studyEffort.avgSecondsPerCard ?? 0}s</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Active learners (7d)</span>
                <span className="font-medium">{metrics?.studyEffort.totalLearners ?? 0}</span>
              </div>
            </div>
          </Card>

          <Card className="rounded-xl border-border bg-card p-5 shadow-soft">
            <div className="text-[14px] font-semibold text-foreground">Flagged questions</div>
            <ul className="mt-3 space-y-2">
              {(metrics?.flaggedQuestions ?? []).length === 0 ? (
                <li className="text-[12px] text-muted-foreground">No open flags</li>
              ) : (
                metrics?.flaggedQuestions.map((q) => (
                  <li key={q.questionId} className="text-[11px]">
                    <div className="truncate font-medium">{q.prompt}</div>
                    <div className="text-muted-foreground">{q.flags} flag(s)</div>
                  </li>
                ))
              )}
            </ul>
          </Card>

          <Card className="rounded-xl border-border bg-card p-5 shadow-soft">
            <div className="text-[14px] font-semibold text-foreground">Easy tests</div>
            <div className="text-[11px] text-muted-foreground">High avg score — review difficulty</div>
            <ul className="mt-3 space-y-2">
              {(metrics?.easyTests ?? []).length === 0 ? (
                <li className="text-[12px] text-muted-foreground">None flagged</li>
              ) : (
                metrics?.easyTests.map((t) => (
                  <li key={t.assessmentId} className="text-[11px]">
                    <div className="truncate font-medium">{t.title}</div>
                    <div className="text-muted-foreground">
                      {t.avgScore}% avg · {t.attempts} attempts
                    </div>
                  </li>
                ))
              )}
            </ul>
          </Card>
        </div>

        {/* Email delivery */}
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Email delivery
            </h2>
            <Link to="/notifications" className="text-[12px] font-medium text-primary hover:underline">
              Notifications <ArrowRight className="inline h-3 w-3" />
            </Link>
          </div>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            <MetricCard label="Sent" value={String(emailStats?.sent ?? 0)} icon={Send} sub="delivered" />
            <MetricCard label="Pending" value={String(emailStats?.pending ?? 0)} icon={Mail} sub="queued" />
            <MetricCard label="Failed" value={String(emailStats?.failed ?? 0)} icon={AlertTriangle} sub="errors" />
            <MetricCard label="Queue depth" value={String(emailStats?.queueDepth ?? 0)} icon={Clock} sub="awaiting send" />
            <MetricCard
              label="Suppressed"
              value={String(emailStats?.suppressedCount ?? 0)}
              icon={AlertTriangle}
              sub="bounces / complaints"
            />
          </div>
        </section>
      </div>
    </AdminLayout>
  );
}
