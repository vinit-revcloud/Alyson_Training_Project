import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { MetricCard } from "@/components/admin/MetricCard";
import { DEPARTMENTS } from "@/lib/departments";
import { fetchDashboardMetrics } from "@/lib/dashboard-metrics";
import { fetchDashboardSummary } from "@/lib/dashboard-summary-api";
import {
  Users,
  GraduationCap,
  ClipboardCheck,
  AlertTriangle,
  ArrowRight,
  PlusSquare,
  BookOpen,
  Award,
  PlayCircle,
  CheckCircle2,
  TrendingUp,
  UserPlus,
  Mail,
  FileText,
  Activity,
  Sparkles,
  Clock,
} from "lucide-react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  BarChart,
  Bar,
  Cell,
  LineChart,
  Line,
  PieChart,
  Pie,
  Legend,
} from "recharts";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Dashboard — Alyson Training Console" },
      {
        name: "description",
        content:
          "Alyson LMS admin dashboard with real-time learner analytics and quick actions.",
      },
    ],
  }),
  component: Dashboard,
});

const ACCENT = "#3B82F6";
const DONUT_COLORS = ["#3B82F6", "#22C55E", "#F59E0B", "#EF4444", "#8B5CF6"];

const DEPT_FILTERS = ["All", ...DEPARTMENTS] as const;
const ROLES = ["All", ...DEPARTMENTS] as const;
const DATE_RANGES = ["7d", "30d", "90d", "12m"] as const;

type Department = (typeof DEPT_FILTERS)[number];
type RoleFilter = (typeof ROLES)[number];
type DateRange = (typeof DATE_RANGES)[number];

function Dashboard() {
  const [dateRange, setDateRange] = useState<DateRange>("7d");
  const [department, setDepartment] = useState<Department>("All");
  const [role, setRole] = useState<RoleFilter>("All");

  const { data } = useQuery({
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

  const totalUsers = summary?.totalUsers ?? 0;
  const inProgress = summary?.activeAssignments ?? 0;
  const completed = summary?.completedAssignments ?? 0;
  const avgScore = summary?.avgCompletionPct ?? 0;
  const activeCourses = summary?.activeCourses ?? 0;
  const overdue = summary?.overdueCount ?? data?.atRisk.reduce((s, u) => s + u.overdue, 0) ?? 0;

  const completionByDept = data?.completionByDept ?? [];
  const assignmentStatus = data?.assignmentStatus ?? [];
  const scoreTrend = data?.scoreTrend ?? [];
  const progressTrend = data?.progressTrend ?? [];
  const learnersByDepartment = data?.learnersByDepartment ?? [];

  const behind = data?.atRisk ?? [];
  const lowPerformers = (data?.topPerformers ?? [])
    .filter((u) => u.avgScore < 60)
    .slice(0, 3)
    .map((u) => ({ name: u.name, department: u.department, progress: u.avgScore }));
  const upcomingDeadlines = (data?.upcomingDeadlines ?? []).slice(0, 3);

  const activityIconMap = {
    user: { icon: UserPlus, color: "text-primary" },
    assign: { icon: BookOpen, color: "text-chart-3" },
    test: { icon: CheckCircle2, color: "text-success" },
    alert: { icon: AlertTriangle, color: "text-destructive" },
  } as const;
  const activity = (data?.recentActivity ?? []).map((a) => ({
    ...a,
    ...activityIconMap[a.iconKey],
  }));

  return (
    <AdminLayout
      title="Dashboard"
      subtitle="Real-time learner performance, engagement, and quick actions"
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <Select value={dateRange} onValueChange={(v) => setDateRange(v as DateRange)}>
            <SelectTrigger className="h-9 w-[110px] rounded-lg text-[12px]">
              <SelectValue placeholder="Range" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7d">Last 7 days</SelectItem>
              <SelectItem value="30d">Last 30 days</SelectItem>
              <SelectItem value="90d">Last 90 days</SelectItem>
              <SelectItem value="12m">Last 12 months</SelectItem>
            </SelectContent>
          </Select>
          <Select value={department} onValueChange={(v) => setDepartment(v as Department)}>
            <SelectTrigger className="h-9 w-[140px] rounded-lg text-[12px]">
              <SelectValue placeholder="Department" />
            </SelectTrigger>
            <SelectContent>
              {DEPT_FILTERS.map((d) => (
                <SelectItem key={d} value={d}>
                  {d === "All" ? "All departments" : d}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={role} onValueChange={(v) => setRole(v as RoleFilter)}>
            <SelectTrigger className="h-9 w-[150px] rounded-lg text-[12px]">
              <SelectValue placeholder="Role" />
            </SelectTrigger>
            <SelectContent>
              {ROLES.map((r) => (
                <SelectItem key={r} value={r}>
                  {r === "All" ? "All roles" : r}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      }
    >
      <div className="space-y-6">
        {/* Top metrics row — 6 cards */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
          <MetricCard label="Total Users" value={String(totalUsers)} icon={Users} sub="registered profiles" />
          <MetricCard label="Active Courses" value={String(activeCourses)} icon={GraduationCap} sub="published" />
          <MetricCard label="In Progress" value={String(inProgress)} icon={PlayCircle} sub="active assignments" />
          <MetricCard label="Completed" value={String(completed)} icon={CheckCircle2} sub="passed assignments" />
          <MetricCard label="Completion %" value={`${avgScore}%`} icon={Award} sub="across assignments" />
          <MetricCard label="Overdue" value={String(overdue)} trend={overdue > 0 ? "down" : "flat"} icon={Clock} sub="past due date" />
        </div>

        {/* Quick actions */}
        <Card className="rounded-xl border-border bg-card p-4 shadow-soft">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              <div className="text-[13px] font-semibold text-foreground">Quick actions</div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link to="/classes/new">
                <Button size="sm" className="h-9 gap-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary-glow">
                  <PlusSquare className="h-4 w-4" /> Create Class
                </Button>
              </Link>
              <Link to="/courses">
                <Button size="sm" variant="outline" className="h-9 gap-2 rounded-lg">
                  <BookOpen className="h-4 w-4" /> Assign Course
                </Button>
              </Link>
              <Link to="/assessments/builder">
                <Button size="sm" variant="outline" className="h-9 gap-2 rounded-lg">
                  <FileText className="h-4 w-4" /> Create Test
                </Button>
              </Link>
              <Link to="/invites">
                <Button size="sm" variant="outline" className="h-9 gap-2 rounded-lg">
                  <Mail className="h-4 w-4" /> Invite User
                </Button>
              </Link>
            </div>
          </div>
        </Card>

        {/* Needs attention + Recent activity */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <Card className="rounded-xl border-warning/30 bg-card p-5 shadow-soft lg:col-span-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-md bg-destructive/10 text-destructive">
                  <AlertTriangle className="h-4 w-4" />
                </div>
                <div>
                  <div className="text-[14px] font-semibold text-foreground">Needs attention</div>
                  <div className="text-[11px] text-muted-foreground">At-risk learners, deadlines, and low scores</div>
                </div>
              </div>
              <Link to="/analytics" className="inline-flex items-center gap-1 text-[12px] font-medium text-primary hover:underline">
                Open analytics <ArrowRight className="h-3 w-3" />
              </Link>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
              <AttentionGroup
                title="Behind schedule"
                tone="destructive"
                count={behind.length}
                items={behind.slice(0, 3).map((u) => ({
                  primary: u.name,
                  secondary: `${u.department} · ${u.overdue} overdue`,
                }))}
                emptyText="Everyone on track"
              />
              <AttentionGroup
                title="Upcoming deadlines"
                tone="warning"
                count={upcomingDeadlines.length}
                items={upcomingDeadlines.map((u) => ({
                  primary: u.name,
                  secondary: `${u.department} · due in ${u.daysLeft}d`,
                }))}
                emptyText="No deadlines this week"
              />
              <AttentionGroup
                title="Low performers"
                tone="muted"
                count={lowPerformers.length}
                items={lowPerformers.map((u) => ({
                  primary: u.name,
                  secondary: `${u.department} · ${u.progress}% progress`,
                }))}
                emptyText="No low performers"
              />
            </div>
          </Card>

          <Card className="rounded-xl border-border bg-card p-5 shadow-soft">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Activity className="h-4 w-4 text-primary" />
                <div className="text-[14px] font-semibold text-foreground">Recent activity</div>
              </div>
              <Badge variant="outline" className="rounded-md border-border text-[10px] text-muted-foreground">Live</Badge>
            </div>
            <ul className="mt-4 space-y-3">
              {activity.length === 0 ? (
                <li className="text-[11.5px] text-muted-foreground">No recent activity yet</li>
              ) : (
                activity.map((a, i) => {
                  const Icon = a.icon;
                  return (
                    <li key={i} className="flex items-start gap-3">
                      <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-accent ${a.color}`}>
                        <Icon className="h-3.5 w-3.5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[12.5px] font-medium text-foreground">{a.title}</div>
                        <div className="truncate text-[11px] text-muted-foreground">{a.detail}</div>
                      </div>
                      <div className="shrink-0 text-[10.5px] text-muted-foreground">{a.time}</div>
                    </li>
                  );
                })
              )}
            </ul>
          </Card>
        </div>

        {/* Charts row 1: User progress over time + Avg score trend */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <Card className="rounded-xl border-border bg-card p-5 shadow-soft lg:col-span-2">
            <div className="flex items-baseline justify-between">
              <div>
                <div className="text-[14px] font-semibold text-foreground">User progress over time</div>
                <div className="text-[12px] text-muted-foreground">Daily active vs. completions</div>
              </div>
              <Badge variant="outline" className="rounded-md border-border text-[11px] text-muted-foreground">
                {dateRange.toUpperCase()}
              </Badge>
            </div>
            <div className="mt-4 h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={progressTrend} margin={{ top: 10, right: 12, left: -16, bottom: 0 }}>
                  <defs>
                    <linearGradient id="activeFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={ACCENT} stopOpacity={0.3} />
                      <stop offset="100%" stopColor={ACCENT} stopOpacity={0.02} />
                    </linearGradient>
                    <linearGradient id="completedFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#22C55E" stopOpacity={0.25} />
                      <stop offset="100%" stopColor="#22C55E" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="var(--border)" vertical={false} strokeDasharray="3 3" />
                  <XAxis dataKey="day" tickLine={false} axisLine={false} fontSize={12} stroke="var(--muted-foreground)" />
                  <YAxis tickLine={false} axisLine={false} fontSize={12} stroke="var(--muted-foreground)" />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Area type="monotone" name="Active" dataKey="active" stroke={ACCENT} strokeWidth={2} fill="url(#activeFill)" />
                  <Area type="monotone" name="Completed" dataKey="completed" stroke="#22C55E" strokeWidth={2} fill="url(#completedFill)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <Card className="rounded-xl border-border bg-card p-5 shadow-soft">
            <div className="flex items-baseline justify-between">
              <div>
                <div className="text-[14px] font-semibold text-foreground">Avg score trend</div>
                <div className="text-[12px] text-muted-foreground">Across all assessments</div>
              </div>
              <TrendingUp className="h-4 w-4 text-success" />
            </div>
            <div className="mt-4 h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={scoreTrend} margin={{ top: 10, right: 12, left: -16, bottom: 0 }}>
                  <CartesianGrid stroke="var(--border)" vertical={false} strokeDasharray="3 3" />
                  <XAxis dataKey="day" tickLine={false} axisLine={false} fontSize={12} stroke="var(--muted-foreground)" />
                  <YAxis tickLine={false} axisLine={false} fontSize={12} domain={[40, 100]} stroke="var(--muted-foreground)" />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Line type="monotone" dataKey="score" stroke={ACCENT} strokeWidth={2.5} dot={{ r: 3, fill: ACCENT }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </div>

        {/* Charts row 2: Completion by dept (donut) + Assignment status (bar) */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card className="rounded-xl border-border bg-card p-5 shadow-soft">
            <div className="text-[14px] font-semibold text-foreground">Completion rate by department</div>
            <div className="text-[12px] text-muted-foreground">Average learner progress</div>
            <div className="mt-4 h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => `${v}%`} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Pie
                    data={completionByDept}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={55}
                    outerRadius={90}
                    paddingAngle={2}
                    stroke="var(--card)"
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
            <div className="text-[14px] font-semibold text-foreground">Assignment status</div>
            <div className="text-[12px] text-muted-foreground">Distribution across learners</div>
            <div className="mt-4 h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={assignmentStatus} margin={{ top: 10, right: 8, left: -18, bottom: 0 }}>
                  <CartesianGrid stroke="var(--border)" vertical={false} strokeDasharray="3 3" />
                  <XAxis dataKey="name" tickLine={false} axisLine={false} fontSize={11} stroke="var(--muted-foreground)" />
                  <YAxis tickLine={false} axisLine={false} fontSize={11} stroke="var(--muted-foreground)" />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                    {assignmentStatus.map((s, i) => (
                      <Cell
                        key={i}
                        fill={
                          s.name === "Overdue" || s.name === "Failed"
                            ? "#EF4444"
                            : s.name === "Completed"
                              ? "#22C55E"
                              : ACCENT
                        }
                        fillOpacity={s.name === "In Progress" ? 0.65 : 1}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </div>

        {/* Learners by role */}
        <Card className="rounded-xl border-border bg-card p-5 shadow-soft">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[14px] font-semibold text-foreground">Learners by role</div>
              <div className="text-[12px] text-muted-foreground">Active enrolments by track</div>
            </div>
            <Link to="/users" className="inline-flex items-center gap-1 text-[12px] font-medium text-primary hover:underline">
              View users <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          <div className="mt-4 h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={learnersByDepartment} margin={{ top: 10, right: 8, left: -22, bottom: 0 }}>
                <CartesianGrid stroke="var(--border)" vertical={false} strokeDasharray="3 3" />
                <XAxis dataKey="department" tickLine={false} axisLine={false} fontSize={11} stroke="var(--muted-foreground)" />
                <YAxis tickLine={false} axisLine={false} fontSize={11} stroke="var(--muted-foreground)" />
                <Tooltip contentStyle={tooltipStyle} />
                <Bar dataKey="learners" radius={[6, 6, 0, 0]}>
                  {learnersByDepartment.map((_, i) => (
                    <Cell key={i} fill={ACCENT} fillOpacity={i === 0 ? 1 : 0.45} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>
    </AdminLayout>
  );
}

const tooltipStyle = {
  background: "var(--popover)",
  border: "1px solid var(--border)",
  borderRadius: 10,
  fontSize: 12,
} as const;

function AttentionGroup({
  title,
  count,
  items,
  tone,
  emptyText,
}: {
  title: string;
  count: number;
  items: { primary: string; secondary: string }[];
  tone: "destructive" | "warning" | "muted";
  emptyText: string;
}) {
  const toneClasses =
    tone === "destructive"
      ? "border-destructive/30 bg-destructive/5"
      : tone === "warning"
        ? "border-warning/30 bg-warning/5"
        : "border-border bg-muted/30";
  const badgeClasses =
    tone === "destructive"
      ? "bg-destructive/15 text-destructive"
      : tone === "warning"
        ? "bg-warning/15 text-warning-foreground"
        : "bg-muted text-muted-foreground";
  return (
    <div className={`rounded-lg border p-3 ${toneClasses}`}>
      <div className="flex items-center justify-between">
        <div className="text-[12px] font-semibold uppercase tracking-wide text-foreground">{title}</div>
        <span className={`rounded-md px-1.5 py-0.5 text-[10.5px] font-semibold ${badgeClasses}`}>
          {count}
        </span>
      </div>
      <ul className="mt-2 space-y-1.5">
        {items.length === 0 ? (
          <li className="text-[11.5px] text-muted-foreground">{emptyText}</li>
        ) : (
          items.map((it, i) => (
            <li key={i} className="min-w-0">
              <div className="truncate text-[12px] font-medium text-foreground">{it.primary}</div>
              <div className="truncate text-[10.5px] text-muted-foreground">{it.secondary}</div>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}
