import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { TrainingWorkflowStrip } from "@/components/training/TrainingWorkflowStrip";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Sparkles,
  MoreHorizontal,
  Search,
  AlertTriangle,
  Users,
  Pencil,
  Copy,
  Trash2,
  BarChart3,
  Send,
  ClipboardList,
} from "lucide-react";
import {
  listAllAssessmentsWithStats,
  duplicateAssessment,
  deleteAssessment,
  setAssessmentStatus,
  assignAssessment,
  type AssessmentSummaryRow,
  type AssessmentStatus,
} from "@/lib/assessments-api";
import { listUsersWithAssignments } from "@/lib/assignments-api";
import { toast } from "sonner";

export const Route = createFileRoute("/assessments/")({
  head: () => ({ meta: [{ title: "Assessments — Alyson" }] }),
  component: AssessmentsPage,
});

const ALL = "__all__";
type SortKey =
  | "recent"
  | "title"
  | "course"
  | "type"
  | "completion"
  | "status"
  | "role";

function statusTone(status: AssessmentStatus) {
  switch (status) {
    case "published":
      return "border-success/30 bg-success/10 text-success";
    case "validated":
      return "border-warning/30 bg-warning/10 text-warning-foreground";
    case "archived":
      return "border-border bg-muted text-muted-foreground";
    default:
      return "border-border bg-muted text-muted-foreground";
  }
}
function statusLabel(s: AssessmentStatus) {
  if (s === "published") return "Open";
  if (s === "archived") return "Closed";
  if (s === "validated") return "Validated";
  return "Draft";
}

function AssessmentsPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();

  const [search, setSearch] = useState("");
  const [filterCourse, setFilterCourse] = useState(ALL);
  const [filterType, setFilterType] = useState(ALL);
  const [filterStatus, setFilterStatus] = useState(ALL);
  const [filterRole, setFilterRole] = useState(ALL);
  const [filterPurpose, setFilterPurpose] = useState<"training" | "interview" | typeof ALL>(ALL);
  const [sort, setSort] = useState<SortKey>("recent");

  const [assignTarget, setAssignTarget] = useState<AssessmentSummaryRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AssessmentSummaryRow | null>(null);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["assessments-stats"],
    queryFn: listAllAssessmentsWithStats,
  });

  const dup = useMutation({
    mutationFn: (id: string) => duplicateAssessment(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["assessments-stats"] });
      toast.success("Assessment duplicated");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const del = useMutation({
    mutationFn: (id: string) => deleteAssessment(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["assessments-stats"] });
      setDeleteTarget(null);
      toast.success("Assessment deleted");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const status = useMutation({
    mutationFn: ({ id, status: s }: { id: string; status: AssessmentStatus }) =>
      setAssessmentStatus(id, s),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["assessments-stats"] });
      toast.success(`Status set to ${statusLabel(vars.status)}`);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const trainingRows = useMemo(
    () => rows.filter((r) => r.purpose !== "interview"),
    [rows],
  );

  const courses = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of trainingRows) {
      if (r.course_id && r.course_title) m.set(r.course_id, r.course_title);
    }
    return Array.from(m.entries()).map(([id, title]) => ({ id, title }));
  }, [trainingRows]);

  const roles = useMemo(
    () => Array.from(new Set(trainingRows.map((r) => r.role).filter(Boolean))),
    [trainingRows],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = rows.filter((r) => {
      if (filterPurpose !== ALL && r.purpose !== filterPurpose) return false;
      if (filterPurpose === ALL && r.purpose === "interview") return false;
      if (q && !r.title.toLowerCase().includes(q) && !(r.course_title ?? "").toLowerCase().includes(q)) return false;
      if (filterCourse !== ALL && r.course_id !== filterCourse) return false;
      if (filterType !== ALL && r.type !== filterType) return false;
      if (filterStatus !== ALL && filterStatus !== "needs-review" && r.status !== filterStatus) return false;
      if (filterStatus === "needs-review" && r.class_status !== "in-review") return false;
      if (filterRole !== ALL && r.role !== filterRole) return false;
      return true;
    });
    const cmp = (a: AssessmentSummaryRow, b: AssessmentSummaryRow) => {
      switch (sort) {
        case "title":
          return a.title.localeCompare(b.title);
        case "course":
          return (a.course_title ?? "").localeCompare(b.course_title ?? "");
        case "type":
          return a.type.localeCompare(b.type);
        case "completion":
          return b.completion - a.completion;
        case "status":
          return a.status.localeCompare(b.status);
        case "role":
          return (a.role ?? "").localeCompare(b.role ?? "");
        default:
          return (b.updated_at ?? "").localeCompare(a.updated_at ?? "");
      }
    };
    return list.sort(cmp);
  }, [rows, search, filterCourse, filterType, filterStatus, filterRole, filterPurpose, sort]);

  const stats = useMemo(() => {
    const total = trainingRows.length;
    const open = trainingRows.filter((r) => r.status === "published").length;
    const assigned = trainingRows.reduce((s, r) => s + r.assigned_count, 0);
    const avg =
      trainingRows.length === 0
        ? 0
        : Math.round(
            trainingRows.reduce((s, r) => s + (r.avg_score ?? 0), 0) /
              Math.max(1, trainingRows.filter((r) => r.avg_score !== null).length),
          );
    const atRisk = trainingRows.reduce((s, r) => s + r.at_risk_count, 0);
    const overdue = trainingRows.reduce((s, r) => s + r.overdue_count, 0);
    return { total, open, assigned, avg, atRisk, overdue };
  }, [trainingRows]);

  return (
    <AdminLayout
      title="Assessments"
      subtitle="Employee training tests — for candidate screening use Interviews"
      actions={
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline" className="h-9 rounded-lg">
            <Link to="/interviews">Hiring / interviews</Link>
          </Button>
          <Button
            asChild
            className="h-9 gap-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary-glow"
          >
          <Link to="/assessments/builder">
            <Sparkles className="h-4 w-4" /> AI question generator
          </Link>
        </Button>
        </div>
      }
    >
      <TrainingWorkflowStrip className="mb-1" />
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <StatCard label="Total" value={stats.total} />
          <StatCard label="Open" value={stats.open} tone="emerald" />
          <StatCard label="Assigned" value={stats.assigned} />
          <StatCard label="Avg score" value={`${stats.avg}%`} />
          <StatCard label="At risk" value={stats.atRisk} tone="destructive" />
        </div>

        <Card className="rounded-xl border-border bg-gradient-to-br from-primary/8 to-accent p-5 shadow-soft">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="max-w-2xl">
              <Badge
                variant="outline"
                className="rounded-md border-primary/30 bg-card text-[10.5px] font-medium text-primary"
              >
                AI · DeepSeek
              </Badge>
              <div className="mt-2 text-[16px] font-semibold text-foreground">
                Generate calibrated MCQ + Essay questions from course material
              </div>
              <p className="mt-1 text-[12px] text-muted-foreground">
                Pick a class, set difficulty mix, and let the AI propose draft
                questions. Edit, validate, and publish from the builder.
              </p>
            </div>
            <Button
              asChild
              className="h-10 gap-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary-glow"
            >
              <Link to="/assessments/builder">
                <Sparkles className="h-4 w-4" /> Launch generator
              </Link>
            </Button>
          </div>
        </Card>

        <Card className="rounded-xl border-border bg-card shadow-soft">
          <div className="flex flex-col gap-3 border-b border-border p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-[14px] font-semibold">All assessments</div>
                <div className="text-[11px] text-muted-foreground">
                  {filtered.length} of {rows.length}
                  {stats.overdue > 0 && (
                    <span className="ml-2 text-amber-600">
                      · {stats.overdue} overdue assignment
                      {stats.overdue === 1 ? "" : "s"}
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-6">
              <div className="relative lg:col-span-2">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search by name or course"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="h-9 rounded-lg border-border bg-background pl-8 text-[13px]"
                />
              </div>
              <Select value={filterCourse} onValueChange={setFilterCourse}>
                <SelectTrigger className="h-9 rounded-lg text-[13px]">
                  <SelectValue placeholder="Course" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>All courses</SelectItem>
                  {courses.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={filterType} onValueChange={setFilterType}>
                <SelectTrigger className="h-9 rounded-lg text-[13px]">
                  <SelectValue placeholder="Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>All types</SelectItem>
                  <SelectItem value="Final">Final</SelectItem>
                  <SelectItem value="Practice">Practice</SelectItem>
                </SelectContent>
              </Select>
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger className="h-9 rounded-lg text-[13px]">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>All statuses</SelectItem>
                  <SelectItem value="needs-review">Needs class review</SelectItem>
                  <SelectItem value="published">Open</SelectItem>
                  <SelectItem value="validated">Validated</SelectItem>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="archived">Closed</SelectItem>
                </SelectContent>
              </Select>
              <Select value={filterRole} onValueChange={setFilterRole}>
                <SelectTrigger className="h-9 rounded-lg text-[13px]">
                  <SelectValue placeholder="Role" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>All roles</SelectItem>
                  {roles.map((r) => (
                    <SelectItem key={r} value={r}>
                      {r}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center justify-end gap-2">
              <span className="text-[11px] text-muted-foreground">Sort</span>
              <Select value={sort} onValueChange={(v) => setSort(v as SortKey)}>
                <SelectTrigger className="h-8 w-[160px] rounded-md text-[12px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="recent">Recently updated</SelectItem>
                  <SelectItem value="title">Name (A→Z)</SelectItem>
                  <SelectItem value="course">Course (A→Z)</SelectItem>
                  <SelectItem value="type">Type</SelectItem>
                  <SelectItem value="completion">Completion %</SelectItem>
                  <SelectItem value="status">Status</SelectItem>
                  <SelectItem value="role">Role</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-border text-left text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                  <th className="px-4 py-3">Assessment</th>
                  <th className="px-4 py-3">Course / Role</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Questions</th>
                  <th className="px-4 py-3">Assigned</th>
                  <th className="px-4 py-3">Completion</th>
                  <th className="px-4 py-3">Avg score</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr>
                    <td colSpan={9} className="px-5 py-10 text-center text-muted-foreground">
                      Loading assessments…
                    </td>
                  </tr>
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-5 py-10 text-center text-muted-foreground">
                      <ClipboardList className="mx-auto mb-2 h-6 w-6" />
                      {rows.length === 0
                        ? "No assessments yet. Use the AI generator to create one."
                        : "No assessments match the current filters."}
                    </td>
                  </tr>
                ) : (
                  filtered.map((r) => (
                    <tr
                      key={r.id}
                      className="border-b border-border last:border-0 hover:bg-muted/40"
                    >
                      <td className="px-4 py-3">
                        <div className="font-medium text-foreground">{r.title}</div>
                        <div className="text-[11px] text-muted-foreground">
                          Updated {new Date(r.updated_at).toLocaleDateString()}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-foreground">{r.course_title ?? "—"}</div>
                        <div className="text-[11px] text-muted-foreground">
                          {r.role || "Any role"} · {r.class_name ?? "—"}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <Badge
                          variant="outline"
                          className={`rounded-md text-[10.5px] font-medium ${
                            r.type === "Final"
                              ? "border-primary/30 bg-accent text-primary"
                              : "border-border bg-muted text-muted-foreground"
                          }`}
                        >
                          {r.type}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-foreground">{r.question_count}</td>
                      <td className="px-4 py-3">
                        <div className="inline-flex items-center gap-1.5 text-foreground">
                          <Users className="h-3.5 w-3.5 text-muted-foreground" />
                          {r.assigned_count}
                        </div>
                        {r.overdue_count > 0 && (
                          <div className="mt-0.5 inline-flex items-center gap-1 text-[11px] text-amber-600">
                            <AlertTriangle className="h-3 w-3" /> {r.overdue_count} overdue
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 w-20 overflow-hidden rounded-full bg-muted">
                            <div
                              className={`h-full rounded-full ${
                                r.completion < 40 && r.assigned_count > 0
                                  ? "bg-destructive"
                                  : "bg-primary"
                              }`}
                              style={{ width: `${r.completion}%` }}
                            />
                          </div>
                          <span className="text-[11px] font-semibold text-foreground">
                            {r.completion}%
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {r.avg_score === null ? (
                          <span className="text-[12px] text-muted-foreground">—</span>
                        ) : (
                          <span
                            className={`text-[13px] font-semibold ${
                              r.avg_score < 60 ? "text-destructive" : "text-foreground"
                            }`}
                          >
                            {r.avg_score}%
                          </span>
                        )}
                        {r.at_risk_count > 0 && (
                          <div className="mt-0.5 inline-flex items-center gap-1 text-[11px] text-destructive">
                            <AlertTriangle className="h-3 w-3" /> {r.at_risk_count} at risk
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <Badge
                          variant="outline"
                          className={`rounded-md text-[10.5px] font-medium ${statusTone(r.status)}`}
                        >
                          {statusLabel(r.status)}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-8 w-8 rounded-md p-0"
                              aria-label="Quick actions"
                            >
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-48">
                            <DropdownMenuItem
                              onClick={() =>
                                navigate({
                                  to: "/assessments/builder",
                                  search: { classId: r.class_id },
                                })
                              }
                            >
                              <Pencil className="mr-2 h-3.5 w-3.5" /> Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => setAssignTarget(r)}>
                              <Send className="mr-2 h-3.5 w-3.5" /> Assign
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() =>
                                navigate({
                                  to: "/assessments/$assessmentId/preview",
                                  params: { assessmentId: r.id },
                                })
                              }
                            >
                              <BarChart3 className="mr-2 h-3.5 w-3.5" /> View results
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => dup.mutate(r.id)}
                              disabled={dup.isPending}
                            >
                              <Copy className="mr-2 h-3.5 w-3.5" /> Duplicate
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              onClick={() =>
                                status.mutate({
                                  id: r.id,
                                  status:
                                    r.status === "published" ? "archived" : "published",
                                })
                              }
                            >
                              {r.status === "published" ? "Close" : "Open"} assessment
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive"
                              onClick={() => setDeleteTarget(r)}
                            >
                              <Trash2 className="mr-2 h-3.5 w-3.5" /> Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      <AssignDialog
        assessment={assignTarget}
        onClose={() => setAssignTarget(null)}
        onAssigned={() => {
          setAssignTarget(null);
          qc.invalidateQueries({ queryKey: ["assessments-stats"] });
        }}
      />

      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete assessment?</AlertDialogTitle>
            <AlertDialogDescription>
              "{deleteTarget?.title}" and all its questions, assignments, and attempts
              will be permanently removed. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteTarget && del.mutate(deleteTarget.id)}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AdminLayout>
  );
}

function StatCard({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: number | string;
  tone?: "default" | "emerald" | "destructive";
}) {
  const color =
    tone === "emerald"
      ? "text-emerald-600"
      : tone === "destructive"
        ? "text-destructive"
        : "text-foreground";
  return (
    <Card className="rounded-xl border-border bg-card p-4 shadow-soft">
      <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className={`mt-1 text-[22px] font-semibold ${color}`}>{value}</div>
    </Card>
  );
}

function AssignDialog({
  assessment,
  onClose,
  onAssigned,
}: {
  assessment: AssessmentSummaryRow | null;
  onClose: () => void;
  onAssigned: () => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState(ALL);
  const [mode, setMode] = useState<"final" | "practice">("final");
  const [dueDate, setDueDate] = useState(
    new Date(Date.now() + 14 * 86400_000).toISOString().slice(0, 10),
  );

  const { data: users = [] } = useQuery({
    queryKey: ["users-for-assign"],
    queryFn: listUsersWithAssignments,
    enabled: !!assessment,
  });

  const assign = useMutation({
    mutationFn: () =>
      assignAssessment({
        assessmentId: assessment!.id,
        learnerUserIds: Array.from(selected),
        dueAt: new Date(`${dueDate}T23:59:59`).toISOString(),
        mode,
        courseId: assessment?.course_id ?? null,
      }),
    onSuccess: (n) => {
      toast.success(`Assigned to ${n} learner${n === 1 ? "" : "s"}`);
      setSelected(new Set());
      onAssigned();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return users.filter((u) => {
      if (q && !(u.display_name ?? "").toLowerCase().includes(q)) return false;
      if (roleFilter !== ALL && !u.roles.includes(roleFilter)) return false;
      return true;
    });
  }, [users, search, roleFilter]);

  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };

  return (
    <Dialog open={!!assessment} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Assign assessment</DialogTitle>
          <DialogDescription className="text-[12px]">
            {assessment?.title} · {assessment?.course_title ?? "No course"}
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div>
            <label className="text-[11px] font-medium text-muted-foreground">Mode</label>
            <Select value={mode} onValueChange={(v) => setMode(v as "final" | "practice")}>
              <SelectTrigger className="mt-1 h-9 rounded-lg text-[13px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="final">Final</SelectItem>
                <SelectItem value="practice">Practice</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-[11px] font-medium text-muted-foreground">
              Due date
            </label>
            <Input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="mt-1 h-9 rounded-lg text-[13px]"
            />
          </div>
          <div>
            <label className="text-[11px] font-medium text-muted-foreground">
              Filter by role
            </label>
            <Select value={roleFilter} onValueChange={setRoleFilter}>
              <SelectTrigger className="mt-1 h-9 rounded-lg text-[13px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All roles</SelectItem>
                <SelectItem value="admin">Admin</SelectItem>
                <SelectItem value="trainer">Creator</SelectItem>
                <SelectItem value="trainee">Student</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search learners"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-9 rounded-lg pl-8 text-[13px]"
          />
        </div>

        <div className="max-h-[280px] overflow-y-auto rounded-lg border border-border">
          {filtered.length === 0 ? (
            <div className="p-6 text-center text-[12px] text-muted-foreground">
              No learners match.
            </div>
          ) : (
            filtered.map((u) => (
              <label
                key={u.user_id}
                className="flex cursor-pointer items-center gap-3 border-b border-border px-3 py-2 last:border-0 hover:bg-muted/40"
              >
                <Checkbox
                  checked={selected.has(u.user_id)}
                  onCheckedChange={() => toggle(u.user_id)}
                />
                <div className="flex-1">
                  <div className="text-[13px] font-medium text-foreground">
                    {u.display_name ?? "Unnamed"}
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    {u.roles.join(", ") || "no role"}
                  </div>
                </div>
              </label>
            ))
          )}
        </div>

        <DialogFooter className="flex items-center justify-between gap-3 sm:justify-between">
          <span className="text-[12px] text-muted-foreground">
            {selected.size} selected · reminders sent for overdue assignments
          </span>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button
              disabled={selected.size === 0 || assign.isPending}
              onClick={() => assign.mutate()}
            >
              {assign.isPending ? "Assigning…" : `Assign to ${selected.size}`}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
