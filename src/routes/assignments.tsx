import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { QueryLoadError } from "@/components/admin/QueryLoadError";
import { TrainingWorkflowStrip } from "@/components/training/TrainingWorkflowStrip";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MetricCard } from "@/components/admin/MetricCard";
import {
  listAssignments,
  createManualAssignment,
  autoAssignCourseToDepartment,
  getAssignmentMetrics,
  type AssignmentDetail,
} from "@/lib/test-assignments-api";
import { getCourseDepartments, listUsersWithAssignments } from "@/lib/assignments-api";
import { listCourseTitlesFn, listPickableAssessmentsFn } from "@/lib/assignments.functions";
import { toast } from "sonner";
import {
  ClipboardCheck,
  Clock,
  CheckCircle2,
  AlertTriangle,
  PlayCircle,
  Plus,
  Shuffle,
  Users,
} from "lucide-react";

export const Route = createFileRoute("/assignments")({
  head: () => ({ meta: [{ title: "Assignments — Alyson" }] }),
  validateSearch: (search: Record<string, unknown>) => ({
    department:
      typeof search.department === "string" && search.department.trim()
        ? search.department.trim()
        : undefined,
  }),
  component: AssignmentsPage,
});

const STATUS_STYLE: Record<string, string> = {
  assigned: "border-blue-200 bg-blue-50 text-blue-700",
  in_progress: "border-amber-200 bg-amber-50 text-amber-800",
  passed: "border-emerald-200 bg-emerald-50 text-emerald-700",
  failed_capped: "border-rose-200 bg-rose-50 text-rose-700",
  expired: "border-slate-200 bg-slate-100 text-slate-600",
};

const STATUS_LABEL: Record<string, string> = {
  assigned: "Assigned",
  in_progress: "In progress",
  passed: "Passed",
  failed_capped: "Failed (capped)",
  expired: "Expired",
};

function daysUntil(iso: string) {
  const ms = new Date(iso).getTime() - Date.now();
  return Math.ceil(ms / (1000 * 60 * 60 * 24));
}

function AssignmentsPage() {
  const qc = useQueryClient();
  const { department: deptFilter } = Route.useSearch();
  const [openManual, setOpenManual] = useState(false);
  const [openAuto, setOpenAuto] = useState(false);

  const {
    data: assignments = [],
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ["assignments"],
    queryFn: listAssignments,
  });
  const {
    data: metrics,
    isError: metricsError,
    refetch: refetchMetrics,
  } = useQuery({
    queryKey: ["assignment-metrics"],
    queryFn: getAssignmentMetrics,
  });

  const filtered = useMemo(() => {
    if (!deptFilter) return assignments;
    return assignments.filter((a) => a.learner.department === deptFilter);
  }, [assignments, deptFilter]);

  const grouped = useMemo(() => {
    const byStatus: Record<string, AssignmentDetail[]> = {
      assigned: [],
      in_progress: [],
      passed: [],
      failed_capped: [],
      expired: [],
    };
    for (const a of filtered) byStatus[a.status]?.push(a);
    return byStatus;
  }, [filtered]);

  const loadFailed = isError || metricsError;

  return (
    <AdminLayout
      title="Test Assignments"
      subtitle={
        deptFilter
          ? `Showing learners in ${deptFilter} — external candidates use Interviews instead`
          : "Assign training tests to employees — external candidates use Interviews instead"
      }
      actions={
        <div className="flex gap-2">
          <Dialog open={openAuto} onOpenChange={setOpenAuto}>
            <DialogTrigger asChild>
              <Button variant="outline" className="h-9 gap-2 rounded-lg">
                <Users className="h-4 w-4" /> Auto-assign by dept
              </Button>
            </DialogTrigger>
            <AutoAssignDialog onDone={() => setOpenAuto(false)} />
          </Dialog>
          <Dialog open={openManual} onOpenChange={setOpenManual}>
            <DialogTrigger asChild>
              <Button className="h-9 gap-2 rounded-lg bg-[#3B82F6] text-white hover:bg-[#3B82F6]/90">
                <Plus className="h-4 w-4" /> Assign test
              </Button>
            </DialogTrigger>
            <ManualAssignDialog onDone={() => setOpenManual(false)} />
          </Dialog>
        </div>
      }
    >
      <TrainingWorkflowStrip className="mb-1" />
      <div className="space-y-5">
        {loadFailed ? (
          <QueryLoadError
            message="Could not load assignment data"
            onRetry={() => {
              void refetch();
              void refetchMetrics();
            }}
          />
        ) : null}
        {deptFilter ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Badge variant="outline">Department: {deptFilter}</Badge>
            <Link to="/assignments" className="text-primary hover:underline">
              Clear filter
            </Link>
          </div>
        ) : null}
        <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
          <MetricCard
            label="Total assigned"
            value={String(metrics?.total ?? 0)}
            icon={ClipboardCheck}
            sub="all-time"
          />
          <MetricCard
            label="In progress"
            value={String((metrics?.in_progress ?? 0) + (metrics?.assigned ?? 0))}
            icon={Clock}
            sub="not yet graded"
          />
          <MetricCard
            label="Passed"
            value={String(metrics?.passed ?? 0)}
            icon={CheckCircle2}
            sub={`${metrics?.completionPct ?? 0}% completion`}
          />
          <MetricCard
            label="Failed (capped)"
            value={String(metrics?.failed_capped ?? 0)}
            icon={AlertTriangle}
            sub="needs admin review"
          />
          <MetricCard
            label="Retake rate"
            value={`${metrics?.failureRetakeRate ?? 0}%`}
            icon={Shuffle}
            sub="of graded attempts"
          />
        </div>

        <Card className="rounded-[12px] border border-[#E5E7EB] bg-white p-0">
          <div className="flex items-center justify-between border-b border-[#E5E7EB] p-4">
            <div>
              <div className="text-[14px] font-semibold text-[#0F172A]">All assignments</div>
              <div className="text-[12px] text-[#6B7280]">
                {isLoading
                  ? "Loading…"
                  : `${filtered.length}${deptFilter ? ` in ${deptFilter}` : ""} · ${assignments.length} total`}
              </div>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-[12.5px]">
              <thead className="bg-[#F8FAFC] text-left text-[11px] uppercase tracking-wide text-[#6B7280]">
                <tr>
                  <th className="px-4 py-2.5">Learner</th>
                  <th className="px-4 py-2.5">Test</th>
                  <th className="px-4 py-2.5">Dept</th>
                  <th className="px-4 py-2.5">Status</th>
                  <th className="px-4 py-2.5">Attempts</th>
                  <th className="px-4 py-2.5">Due</th>
                  <th className="px-4 py-2.5">Source</th>
                  <th className="px-4 py-2.5"></th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-12 text-center text-[12.5px] text-[#6B7280]">
                      Loading assignments…
                    </td>
                  </tr>
                ) : isError ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-12 text-center text-[12.5px] text-[#6B7280]">
                      Assignment list unavailable — use Retry above.
                    </td>
                  </tr>
                ) : (
                filtered.map((a) => {
                  const days = daysUntil(a.due_at);
                  return (
                    <tr key={a.id} className="border-t border-[#E5E7EB]">
                      <td className="px-4 py-2.5 font-medium text-[#0F172A]">
                        {a.learner.display_name ?? "—"}
                      </td>
                      <td className="px-4 py-2.5 text-[#374151]">{a.assessment.title}</td>
                      <td className="px-4 py-2.5 text-[#6B7280]">
                        {a.learner.department ?? "—"}
                      </td>
                      <td className="px-4 py-2.5">
                        <Badge variant="outline" className={STATUS_STYLE[a.status]}>
                          {STATUS_LABEL[a.status]}
                        </Badge>
                      </td>
                      <td className="px-4 py-2.5 text-[#374151]">
                        {a.attempts_used} / {a.max_attempts}
                      </td>
                      <td className="px-4 py-2.5">
                        <span
                          className={
                            days < 0
                              ? "text-rose-600"
                              : days <= 3
                                ? "text-amber-700"
                                : "text-[#374151]"
                          }
                        >
                          {days < 0 ? `${-days}d overdue` : `${days}d left`}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-[11px] text-[#6B7280]">
                        {a.source === "auto_department" ? "Auto (dept)" : "Manual"}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <Button
                          asChild
                          size="sm"
                          variant="ghost"
                          className="h-7 gap-1 text-[#3B82F6]"
                        >
                          <Link
                            to="/assessments/builder"
                            search={{ classId: a.assessment.class_id }}
                          >
                            <PlayCircle className="h-3.5 w-3.5" /> Preview
                          </Link>
                        </Button>
                      </td>
                    </tr>
                  );
                })
                )}
                {!isLoading && !isError && filtered.length === 0 ? (
                  <tr>
                    <td
                      colSpan={8}
                      className="px-4 py-12 text-center text-[12.5px] text-[#6B7280]"
                    >
                      {deptFilter
                        ? `No assignments for ${deptFilter}.`
                        : "No assignments yet. Use “Assign test” or “Auto-assign by dept” above."}
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </Card>

        <Card className="rounded-[12px] border border-[#E5E7EB] bg-white p-5">
          <div className="text-[14px] font-semibold text-[#0F172A]">Status breakdown</div>
          <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-5">
            {(["assigned", "in_progress", "passed", "failed_capped", "expired"] as const).map(
              (s) => (
                <div
                  key={s}
                  className="rounded-[12px] border border-[#E5E7EB] p-3"
                  style={{ backgroundColor: "#F8FAFC" }}
                >
                  <div className="text-[11px] uppercase tracking-wide text-[#6B7280]">
                    {STATUS_LABEL[s]}
                  </div>
                  <div className="mt-1 text-[22px] font-semibold text-[#0F172A]">
                    {grouped[s].length}
                  </div>
                </div>
              ),
            )}
          </div>
        </Card>
      </div>
    </AdminLayout>
  );
}

function ManualAssignDialog({ onDone }: { onDone: () => void }) {
  const qc = useQueryClient();
  const [userId, setUserId] = useState("");
  const [assessmentId, setAssessmentId] = useState("");
  const [days, setDays] = useState(14);
  const [maxAttempts, setMaxAttempts] = useState(3);

  const { data: users = [] } = useQuery({
    queryKey: ["users-assignments"],
    queryFn: listUsersWithAssignments,
  });
  const learners = useMemo(
    () => users.filter((u) => u.roles.includes("trainee")),
    [users],
  );
  const { data: assessments = [] } = useQuery({
    queryKey: ["assessments-pickable"],
    queryFn: () => listPickableAssessmentsFn(),
  });

  const submit = useMutation({
    mutationFn: () =>
      createManualAssignment({
        learnerUserId: userId,
        assessmentId,
        dueAt: new Date(Date.now() + days * 86400_000).toISOString(),
        maxAttempts,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["assignments"] });
      qc.invalidateQueries({ queryKey: ["assignment-metrics"] });
      toast.success("Test assigned");
      onDone();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  return (
    <DialogContent className="max-w-md">
      <DialogHeader>
        <DialogTitle>Assign test to learner</DialogTitle>
      </DialogHeader>
      <div className="space-y-3">
        <div>
          <label className="text-[11px] font-medium uppercase text-[#6B7280]">Learner</label>
          <Select value={userId} onValueChange={setUserId}>
            <SelectTrigger className="mt-1 h-9">
              <SelectValue placeholder="Pick a learner" />
            </SelectTrigger>
            <SelectContent>
              {learners.map((u) => (
                <SelectItem key={u.user_id} value={u.user_id}>
                  {u.display_name ?? u.email ?? u.user_id.slice(0, 8)}
                  {u.department ? ` · ${u.department}` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-[11px] font-medium uppercase text-[#6B7280]">Test</label>
          <Select value={assessmentId} onValueChange={setAssessmentId}>
            <SelectTrigger className="mt-1 h-9">
              <SelectValue placeholder="Pick a validated/published test" />
            </SelectTrigger>
            <SelectContent>
              {assessments.map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  {a.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-[11px] font-medium uppercase text-[#6B7280]">
              Window (days)
            </label>
            <Input
              type="number"
              value={days}
              min={1}
              max={60}
              onChange={(e) => setDays(Number(e.target.value))}
              className="mt-1 h-9"
            />
          </div>
          <div>
            <label className="text-[11px] font-medium uppercase text-[#6B7280]">
              Max attempts
            </label>
            <Input
              type="number"
              value={maxAttempts}
              min={1}
              max={10}
              onChange={(e) => setMaxAttempts(Number(e.target.value))}
              className="mt-1 h-9"
            />
          </div>
        </div>
      </div>
      <DialogFooter>
        <Button variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <Button
          disabled={!userId || !assessmentId || submit.isPending}
          onClick={() => submit.mutate()}
          className="bg-[#3B82F6] text-white hover:bg-[#3B82F6]/90"
        >
          {submit.isPending ? "Assigning…" : "Assign"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

function AutoAssignDialog({ onDone }: { onDone: () => void }) {
  const qc = useQueryClient();
  const [courseId, setCourseId] = useState("");
  const [department, setDepartment] = useState("");

  const { data: courses = [] } = useQuery({
    queryKey: ["courses-list"],
    queryFn: () => listCourseTitlesFn(),
  });

  const { data: courseDepartments = [], isLoading: deptsLoading } = useQuery({
    queryKey: ["course-departments", courseId],
    queryFn: () => getCourseDepartments(courseId),
    enabled: Boolean(courseId),
  });

  useEffect(() => {
    setDepartment("");
  }, [courseId]);

  const run = useMutation({
    mutationFn: () => autoAssignCourseToDepartment(courseId, department),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["assignments"] });
      qc.invalidateQueries({ queryKey: ["assignment-metrics"] });
      toast.success(
        `Touched ${res.usersTouched} learner(s) · ${res.assignmentsCreated} assignment(s)` +
          (res.emailsQueued ? ` · ${res.emailsQueued} email(s) queued` : ""),
      );
      onDone();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  return (
    <DialogContent className="max-w-md">
      <DialogHeader>
        <DialogTitle>Auto-assign course to a department</DialogTitle>
      </DialogHeader>
      <div className="space-y-3">
        <p className="text-[12px] text-[#6B7280]">
          Every validated/published primary test in this course will be assigned (2-week window) to
          trainees whose profile department matches a department linked to the course.
        </p>
        <div>
          <label className="text-[11px] font-medium uppercase text-[#6B7280]">Course</label>
          <Select
            value={courseId}
            onValueChange={(id) => {
              setCourseId(id);
              setDepartment("");
            }}
          >
            <SelectTrigger className="mt-1 h-9">
              <SelectValue placeholder="Pick a course" />
            </SelectTrigger>
            <SelectContent>
              {courses.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-[11px] font-medium uppercase text-[#6B7280]">Department</label>
          <Select value={department} onValueChange={setDepartment} disabled={!courseId || deptsLoading}>
            <SelectTrigger className="mt-1 h-9">
              <SelectValue
                placeholder={
                  !courseId
                    ? "Select a course first"
                    : deptsLoading
                      ? "Loading departments…"
                      : courseDepartments.length
                        ? "Pick a linked department"
                        : "No departments on this course"
                }
              />
            </SelectTrigger>
            <SelectContent>
              {courseDepartments.map((d) => (
                <SelectItem key={d} value={d}>
                  {d}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {courseId && !deptsLoading && !courseDepartments.length ? (
            <p className="text-[11px] text-amber-700">
              Link at least one department on the course page before auto-assigning.
            </p>
          ) : null}
        </div>
      </div>
      <DialogFooter>
        <Button variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <Button
          disabled={!courseId || !department || !courseDepartments.length || run.isPending}
          onClick={() => run.mutate()}
          className="bg-[#3B82F6] text-white hover:bg-[#3B82F6]/90"
        >
          {run.isPending ? "Assigning…" : "Run"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
