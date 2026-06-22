import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { QueryLoadError } from "@/components/admin/QueryLoadError";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Download,
  Filter,
  GraduationCap,
  ChevronDown,
  Shield,
  Eye,
  AlertTriangle,
  CheckCircle2,
  Clock,
} from "lucide-react";
import { STAGE_LABELS } from "@/lib/hiring-pipeline/hiring-pipeline.shared";
import { DEPARTMENTS, updateUserDepartment } from "@/lib/assignments-api";
import {
  listWorkspaceUsers,
  setUsersRole,
  setUsersStatus,
} from "@/lib/user-management-api";
import {
  WORKSPACE_ROLE_OPTIONS,
  workspaceRoleLabel,
  type WorkspaceRole,
} from "@/lib/workspace-roles.shared";
import { fetchUserMetricsMap, type UserMetrics } from "@/lib/users-metrics-api";
import { getAllCourseDepartments } from "@/lib/assignments-api";
import { listCourses } from "@/lib/classes-api";
import { toast } from "sonner";

export const Route = createFileRoute("/users")({
  head: () => ({ meta: [{ title: "Users — Alyson" }] }),
  component: UsersPage,
});

const NONE = "__none__";

type StatusFilter = "all" | "active" | "at-risk" | "needs-attention";
type CompletionFilter = "all" | "not-started" | "in-progress" | "completed";

type Metrics = UserMetrics;

function emptyMetrics(): Metrics {
  return {
    completion: 0,
    avgScore: 0,
    modulesDone: 0,
    modulesTotal: 0,
    quizzesTaken: 0,
    overdue: 0,
    status: "Active",
  };
}

function UsersPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [deptFilter, setDeptFilter] = useState<string>("all");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [courseFilter, setCourseFilter] = useState<string>("all");
  const [completionFilter, setCompletionFilter] = useState<CompletionFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const { data: users = [], isLoading, isError: usersError, refetch: refetchUsers } = useQuery({
    queryKey: ["workspace-users"],
    queryFn: listWorkspaceUsers,
  });
  const {
    data: metricsMap = new Map(),
    isError: metricsError,
    refetch: refetchMetrics,
  } = useQuery({
    queryKey: ["users-metrics"],
    queryFn: fetchUserMetricsMap,
  });
  const {
    data: courses = [],
    isError: coursesError,
    refetch: refetchCourses,
  } = useQuery({
    queryKey: ["courses"],
    queryFn: listCourses,
  });
  const {
    data: courseDeptMap,
    isError: deptMapError,
    refetch: refetchDeptMap,
  } = useQuery({
    queryKey: ["all-course-departments"],
    queryFn: getAllCourseDepartments,
  });

  const loadFailed = usersError || metricsError || coursesError || deptMapError;

  const setDept = useMutation({
    mutationFn: ({ userId, department }: { userId: string; department: string | null }) =>
      updateUserDepartment(userId, department),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["workspace-users"] });
      toast.success("Department updated");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to update"),
  });

  const bulkSetRole = useMutation({
    mutationFn: ({ userIds, role }: { userIds: string[]; role: WorkspaceRole }) =>
      setUsersRole(userIds, role),
    onSuccess: (updated) => {
      qc.invalidateQueries({ queryKey: ["workspace-users"] });
      toast.success(`Updated roles for ${updated} user${updated === 1 ? "" : "s"}`);
      setSelected(new Set());
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to update roles"),
  });

  const bulkSetStatus = useMutation({
    mutationFn: ({
      userIds,
      status,
    }: {
      userIds: string[];
      status: "active" | "suspended";
    }) => setUsersStatus(userIds, status),
    onSuccess: (updated, { status }) => {
      qc.invalidateQueries({ queryKey: ["workspace-users"] });
      toast.success(
        status === "suspended"
          ? `Suspended ${updated} account${updated === 1 ? "" : "s"}`
          : `Reactivated ${updated} account${updated === 1 ? "" : "s"}`,
      );
      setSelected(new Set());
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to update status"),
  });

  const setRole = useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: WorkspaceRole }) =>
      setUsersRole([userId], role),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["workspace-users"] });
      toast.success("Role updated");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to update role"),
  });

  const enriched = useMemo(
    () =>
      users.map((u) => ({
        user: u,
        metrics: metricsMap.get(u.user_id) ?? emptyMetrics(),
      })),
    [users, metricsMap],
  );

  const allRoles = useMemo(() => {
    const s = new Set<string>();
    for (const u of users) u.roles.forEach((r) => s.add(r));
    return Array.from(s).sort();
  }, [users]);

  const filtered = useMemo(() => {
    return enriched.filter(({ user: u, metrics: m }) => {
      const name = (u.display_name ?? u.email ?? "").toLowerCase();
      const matchQ = name.includes(q.toLowerCase());
      const matchD =
        deptFilter === "all"
          ? true
          : deptFilter === "none"
            ? !u.department
            : u.department === deptFilter;
      const matchR = roleFilter === "all" ? true : u.roles.includes(roleFilter);
      const matchC =
        courseFilter === "all"
          ? true
          : !courseDeptMap
            ? true
            : (() => {
                const depts = courseDeptMap.get(courseFilter);
                return !!u.department && (depts?.includes(u.department) ?? false);
              })();
      const matchComp =
        completionFilter === "all"
          ? true
          : completionFilter === "not-started"
            ? m.completion === 0
            : completionFilter === "in-progress"
              ? m.completion > 0 && m.completion < 100
              : m.completion === 100;
      const matchStatus =
        statusFilter === "all"
          ? true
          : statusFilter === "active"
            ? m.status === "Active"
            : statusFilter === "at-risk"
              ? m.status === "At Risk"
              : m.status === "Needs Attention";
      return matchQ && matchD && matchR && matchC && matchComp && matchStatus;
    });
  }, [enriched, q, deptFilter, roleFilter, courseFilter, completionFilter, statusFilter, courseDeptMap]);

  const exportCsv = () => {
    const header = ["Name", "Email", "Department", "Roles", "Status", "Completion %"];
    const lines = filtered.map(({ user: u, metrics: m }) =>
      [
        u.display_name ?? "",
        u.email ?? "",
        u.department ?? "",
        u.roles.join("; "),
        u.status,
        String(m.completion),
      ]
        .map((c) => `"${String(c).replace(/"/g, '""')}"`)
        .join(","),
    );
    const blob = new Blob([[header.join(","), ...lines].join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `users-export-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Exported CSV");
  };

  const stats = useMemo(() => {
    const atRisk = enriched.filter((e) => e.metrics.status === "At Risk").length;
    const needs = enriched.filter((e) => e.metrics.status === "Needs Attention").length;
    return {
      total: users.length,
      assigned: users.filter((u) => u.department).length,
      atRisk,
      needs,
    };
  }, [enriched, users]);

  const allOnPageSelected =
    filtered.length > 0 && filtered.every((e) => selected.has(e.user.user_id));
  const toggleAll = () => {
    const next = new Set(selected);
    if (allOnPageSelected) {
      filtered.forEach((e) => next.delete(e.user.user_id));
    } else {
      filtered.forEach((e) => next.add(e.user.user_id));
    }
    setSelected(next);
  };
  const toggleOne = (id: string) => {
    const next = new Set(selected);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelected(next);
  };

  const runBulkRole = (role: WorkspaceRole) => {
    if (selected.size === 0) {
      toast.error("Select at least one user");
      return;
    }
    bulkSetRole.mutate({ userIds: [...selected], role });
  };

  const runBulkStatus = (status: "active" | "suspended") => {
    if (selected.size === 0) {
      toast.error("Select at least one user");
      return;
    }
    bulkSetStatus.mutate({ userIds: [...selected], status });
  };

  return (
    <AdminLayout
      title="Users"
      subtitle="Manage recruiters, HR, trainers, and learners — assign roles and departments"
      actions={
        <div className="flex items-center gap-2">
          <Button variant="outline" className="h-9 gap-2 rounded-lg border-border" onClick={exportCsv}>
            <Download className="h-4 w-4" /> Export CSV
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        {loadFailed ? (
          <QueryLoadError
            message="Could not load user directory data"
            onRetry={() => {
              void refetchUsers();
              void refetchMetrics();
              void refetchCourses();
              void refetchDeptMap();
            }}
          />
        ) : null}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <SummaryCard label="Total users" value={stats.total} />
          <SummaryCard label="Assigned" value={stats.assigned} />
          <SummaryCard label="At risk" value={stats.atRisk} tone="destructive" />
          <SummaryCard label="Needs attention" value={stats.needs} tone="warning" />
        </div>

        <Card className="rounded-xl border-border bg-card shadow-soft">
          {/* Filter bar */}
          <div className="flex flex-wrap items-center gap-2 border-b border-border p-3">
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search by name…"
              className="h-9 w-56 rounded-lg border-border bg-background text-[12.5px]"
            />
            <FilterSelect
              value={roleFilter}
              onChange={setRoleFilter}
              placeholder="Role"
              options={[{ value: "all", label: "All roles" }, ...allRoles.map((r) => ({ value: r, label: r }))]}
              width="w-36"
            />
            <FilterSelect
              value={deptFilter}
              onChange={setDeptFilter}
              placeholder="Department"
              options={[
                { value: "all", label: "All departments" },
                { value: "none", label: "Unassigned" },
                ...DEPARTMENTS.map((d) => ({ value: d, label: d })),
              ]}
              width="w-44"
            />
            <FilterSelect
              value={courseFilter}
              onChange={setCourseFilter}
              placeholder="Course"
              options={[
                { value: "all", label: "All courses" },
                ...courses.map((c) => ({ value: c.id, label: c.title })),
              ]}
              width="w-48"
            />
            <FilterSelect
              value={completionFilter}
              onChange={(v) => setCompletionFilter(v as CompletionFilter)}
              placeholder="Completion"
              options={[
                { value: "all", label: "Any completion" },
                { value: "not-started", label: "Not started" },
                { value: "in-progress", label: "In progress" },
                { value: "completed", label: "Completed" },
              ]}
              width="w-40"
            />
            <FilterSelect
              value={statusFilter}
              onChange={(v) => setStatusFilter(v as StatusFilter)}
              placeholder="Status"
              options={[
                { value: "all", label: "Any status" },
                { value: "active", label: "Active" },
                { value: "at-risk", label: "At risk" },
                { value: "needs-attention", label: "Needs attention" },
              ]}
              width="w-40"
            />
            <div className="ml-auto text-[12px] text-muted-foreground">
              {filtered.length} of {users.length} users
            </div>
          </div>

          {/* Bulk action bar */}
          {selected.size > 0 ? (
            <div className="flex flex-wrap items-center gap-2 border-b border-border bg-primary/5 px-3 py-2 text-[12.5px]">
              <span className="font-medium text-primary">{selected.size} selected</span>
              <button
                onClick={() => setSelected(new Set())}
                className="text-[11.5px] text-muted-foreground hover:text-foreground"
              >
                Clear
              </button>
              <div className="ml-auto flex flex-wrap gap-1.5">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button size="sm" variant="outline" className="h-8 gap-1.5 rounded-md border-border text-[12px]">
                      <Shield className="h-3.5 w-3.5" /> Change Role <ChevronDown className="h-3 w-3" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuLabel className="text-[11px]">Set workspace role</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    {WORKSPACE_ROLE_OPTIONS.map((o) => (
                      <DropdownMenuItem
                        key={o.value}
                        onClick={() => runBulkRole(o.value)}
                        disabled={bulkSetRole.isPending}
                      >
                        {o.label}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 rounded-md border-border text-[12px]"
                  disabled={bulkSetStatus.isPending}
                  onClick={() => runBulkStatus("suspended")}
                >
                  Suspend
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 rounded-md border-border text-[12px]"
                  disabled={bulkSetStatus.isPending}
                  onClick={() => runBulkStatus("active")}
                >
                  Reactivate
                </Button>
              </div>
            </div>
          ) : null}

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-[12.5px]">
              <thead>
                <tr className="border-b border-border text-left text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                  <th className="w-10 px-4 py-3">
                    <Checkbox
                      checked={allOnPageSelected}
                      onCheckedChange={toggleAll}
                      aria-label="Select all"
                    />
                  </th>
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">Role</th>
                  <th className="px-4 py-3 w-44">Department</th>
                  <th className="px-4 py-3">Courses</th>
                  <th className="px-4 py-3 w-44">Completion</th>
                  <th className="px-4 py-3">Avg Score</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 w-12"></th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-8 text-center text-muted-foreground">
                      Loading users…
                    </td>
                  </tr>
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-8 text-center text-muted-foreground">
                      <GraduationCap className="mx-auto mb-2 h-6 w-6" />
                      {users.length === 0 && !isLoading
                        ? "No users in the workspace yet."
                        : "No users match your filters."}
                    </td>
                  </tr>
                ) : (
                  filtered.map(({ user: u, metrics: m }) => {
                    const initials =
                      (u.display_name ?? "?")
                        .split(/\s+/)
                        .map((n) => n[0])
                        .filter(Boolean)
                        .slice(0, 2)
                        .join("")
                        .toUpperCase() || "?";
                    const isSel = selected.has(u.user_id);
                    return (
                      <tr
                        key={u.user_id}
                        className={`border-b border-border last:border-0 transition ${
                          isSel ? "bg-primary/5" : "hover:bg-muted/40"
                        }`}
                      >
                        <td className="px-4 py-3">
                          <Checkbox
                            checked={isSel}
                            onCheckedChange={() => toggleOne(u.user_id)}
                            aria-label={`Select ${u.display_name ?? u.user_id}`}
                          />
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2.5">
                            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-accent text-[11px] font-semibold text-primary">
                              {initials}
                            </div>
                            <div className="leading-tight">
                              <div className="font-medium text-foreground">
                                {u.display_name ?? "(no name)"}
                              </div>
                              <div className="text-[11px] text-muted-foreground">
                                {u.email ?? `${u.user_id.slice(0, 8)}…`}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-col gap-1.5">
                            <Select
                              value={u.roles[0] ?? "__none__"}
                              onValueChange={(v) => {
                                if (v === "__none__") return;
                                setRole.mutate({ userId: u.user_id, role: v as WorkspaceRole });
                              }}
                              disabled={setRole.isPending || u.status === "suspended"}
                            >
                              <SelectTrigger className="h-8 w-44 rounded-md border-border bg-background text-[11px]">
                                <SelectValue placeholder="Assign role…" />
                              </SelectTrigger>
                              <SelectContent>
                                {u.roles.length === 0 ? (
                                  <SelectItem value="__none__" disabled className="text-[12px]">
                                    No access — assign role
                                  </SelectItem>
                                ) : null}
                                {WORKSPACE_ROLE_OPTIONS.map((o) => (
                                  <SelectItem key={o.value} value={o.value} className="text-[12px]">
                                    {o.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            {u.roles.length > 1 ? (
                              <div className="flex flex-wrap gap-1">
                                {u.roles.map((r) => (
                                  <Badge
                                    key={r}
                                    variant="outline"
                                    className="rounded-md border-primary/30 bg-accent text-[10px] text-primary"
                                  >
                                    {workspaceRoleLabel(r as WorkspaceRole)}
                                  </Badge>
                                ))}
                              </div>
                            ) : null}
                            {u.status === "suspended" ? (
                              <Badge
                                variant="outline"
                                className="w-fit rounded-md border-destructive/40 bg-destructive/10 text-[10px] text-destructive"
                              >
                                Suspended
                              </Badge>
                            ) : null}
                            {u.pipeline_stage ? (
                              <Badge
                                variant="outline"
                                className="w-fit rounded-md text-[10px]"
                              >
                                {STAGE_LABELS[u.pipeline_stage as keyof typeof STAGE_LABELS] ??
                                  u.pipeline_stage}
                              </Badge>
                            ) : null}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <Select
                            value={u.department ?? NONE}
                            onValueChange={(v) =>
                              setDept.mutate({
                                userId: u.user_id,
                                department: v === NONE ? null : v,
                              })
                            }
                          >
                            <SelectTrigger className="h-8 w-40 rounded-md border-border bg-background text-[12px]">
                              <SelectValue placeholder="Choose…" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value={NONE}>— Unassigned —</SelectItem>
                              {DEPARTMENTS.map((d) => (
                                <SelectItem key={d} value={d}>
                                  {d}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5">
                            <span className="font-semibold text-foreground">{u.assigned_courses}</span>
                            {m.overdue > 0 ? (
                              <Badge
                                variant="outline"
                                className="gap-0.5 rounded-md border-destructive/30 bg-destructive/10 text-[10px] text-destructive"
                              >
                                <Clock className="h-2.5 w-2.5" /> {m.overdue} late
                              </Badge>
                            ) : null}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className="h-1.5 w-20 overflow-hidden rounded-full bg-muted">
                              <div
                                className={`h-full rounded-full ${
                                  m.completion >= 80
                                    ? "bg-success"
                                    : m.completion >= 40
                                      ? "bg-primary"
                                      : "bg-warning"
                                }`}
                                style={{ width: `${m.completion}%` }}
                              />
                            </div>
                            <span className="text-[11.5px] font-medium text-foreground">
                              {m.completion}%
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`text-[12.5px] font-semibold ${
                              m.avgScore >= 80
                                ? "text-success"
                                : m.avgScore >= 60
                                  ? "text-foreground"
                                  : "text-destructive"
                            }`}
                          >
                            {u.assigned_courses === 0 ? "—" : `${m.avgScore}%`}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <StatusPill status={m.status} />
                        </td>
                        <td className="px-4 py-3">
                          <Popover>
                            <PopoverTrigger asChild>
                              <button
                                className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
                                aria-label="Quick view"
                              >
                                <Eye className="h-3.5 w-3.5" />
                              </button>
                            </PopoverTrigger>
                            <PopoverContent align="end" className="w-72 p-4">
                              <div className="text-[13px] font-semibold text-foreground">
                                {u.display_name ?? "(no name)"}
                              </div>
                              <div className="mt-0.5 text-[11px] text-muted-foreground">
                                {u.department ?? "Unassigned"} ·{" "}
                                {u.roles.map((r) => workspaceRoleLabel(r as WorkspaceRole)).join(", ") ||
                                  "no role"}
                                {u.status === "suspended" ? " · suspended" : ""}
                              </div>
                              <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                                <MiniStat label="Modules" value={`${m.modulesDone}/${m.modulesTotal}`} />
                                <MiniStat label="Quizzes" value={String(m.quizzesTaken)} />
                                <MiniStat label="Overdue" value={String(m.overdue)} tone={m.overdue > 0 ? "destructive" : undefined} />
                              </div>
                              <div className="mt-3 space-y-1.5 text-[11.5px] text-muted-foreground">
                                <Row label="Completion" value={`${m.completion}%`} />
                                <Row label="Average score" value={u.assigned_courses === 0 ? "—" : `${m.avgScore}%`} />
                                <Row label="Status" value={m.status} />
                              </div>
                              <div className="mt-3 flex flex-wrap gap-1.5">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-7 rounded-md text-[11px]"
                                  asChild
                                >
                                  <Link
                                    to="/users/$userId/learner"
                                    params={{ userId: u.user_id }}
                                  >
                                    Learner 360
                                  </Link>
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-7 rounded-md text-[11px]"
                                  onClick={() => {
                                    localStorage.setItem("alyson-view-mode", "student");
                                    window.open("/learn/dashboard", "_blank");
                                  }}
                                >
                                  View as learner
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-7 flex-1 rounded-md text-[11px]"
                                  onClick={() => toast.message(u.email ?? "No email")}
                                >
                                  View profile
                                </Button>
                                <Button
                                  size="sm"
                                  className="h-7 flex-1 rounded-md bg-primary text-[11px] text-primary-foreground hover:bg-primary-glow"
                                  onClick={() =>
                                    navigate({
                                      to: "/assignments",
                                      search: u.department ? { department: u.department } : {},
                                    })
                                  }
                                >
                                  Assign course
                                </Button>
                              </div>
                            </PopoverContent>
                          </Popover>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </AdminLayout>
  );
}

function FilterSelect({
  value,
  onChange,
  placeholder,
  options,
  width,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  options: { value: string; label: string }[];
  width: string;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className={`h-9 ${width} rounded-lg border-border bg-background text-[12.5px]`}>
        <Filter className="mr-1.5 h-3.5 w-3.5 text-muted-foreground" />
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value} className="text-[12.5px]">
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function StatusPill({ status }: { status: Metrics["status"] }) {
  if (status === "Active") {
    return (
      <Badge variant="outline" className="gap-1 rounded-md border-success/30 bg-success/10 text-[10.5px] font-medium text-success">
        <CheckCircle2 className="h-2.5 w-2.5" /> Active
      </Badge>
    );
  }
  if (status === "At Risk") {
    return (
      <Badge variant="outline" className="gap-1 rounded-md border-destructive/30 bg-destructive/10 text-[10.5px] font-medium text-destructive">
        <AlertTriangle className="h-2.5 w-2.5" /> At Risk
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="gap-1 rounded-md border-warning/30 bg-warning/10 text-[10.5px] font-medium text-warning">
      <Clock className="h-2.5 w-2.5" /> Needs Attention
    </Badge>
  );
}

function MiniStat({ label, value, tone }: { label: string; value: string; tone?: "destructive" }) {
  return (
    <div className="rounded-md border border-border bg-muted/30 p-2">
      <div className={`text-[14px] font-semibold ${tone === "destructive" ? "text-destructive" : "text-foreground"}`}>
        {value}
      </div>
      <div className="text-[10px] text-muted-foreground">{label}</div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span>{label}</span>
      <span className="font-medium text-foreground">{value}</span>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "destructive" | "warning";
}) {
  const color =
    tone === "destructive"
      ? "text-destructive"
      : tone === "warning"
        ? "text-warning"
        : "text-foreground";
  return (
    <Card className="rounded-xl border-border bg-card p-4 shadow-soft">
      <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className={`mt-1 text-[24px] font-semibold ${color}`}>{value}</div>
    </Card>
  );
}
