import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { QueryLoadError } from "@/components/admin/QueryLoadError";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Plus,
  Users,
  Layers,
  Filter,
  GraduationCap,
  MoreVertical,
  UserPlus,
  Pencil,
  Copy,
  AlertTriangle,
  TrendingUp,
  ArrowUpDown,
  FileSpreadsheet,
} from "lucide-react";
import { BulkClassImportDialog } from "@/components/admin/BulkClassImportDialog";
import { listCourses, type ClassStatus } from "@/lib/classes-api";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { getAllCourseDepartments } from "@/lib/assignments-api";
import { DEPARTMENTS } from "@/lib/departments";

export const Route = createFileRoute("/courses/")({
  head: () => ({ meta: [{ title: "Courses — Alyson Training Project" }] }),
  component: CoursesPage,
});

function CoursesPage() {
  const [q, setQ] = useState("");
  const [role, setRole] = useState<string>("all");
  const [status, setStatus] = useState<"all" | ClassStatus>("all");
  const [sort, setSort] = useState<"recent" | "title" | "enrolled" | "completion">("recent");
  const navigate = useNavigate();
  const [bulkOpen, setBulkOpen] = useState(false);

  const { data: courses = [], isLoading, isError, refetch } = useQuery({
    queryKey: ["courses"],
    queryFn: listCourses,
  });
  const { data: deptMap, isError: deptMapError, refetch: refetchDeptMap } = useQuery({
    queryKey: ["all-course-departments"],
    queryFn: getAllCourseDepartments,
  });

  const loadFailed = isError || deptMapError;

  const filtered = useMemo(() => {
    const list = courses.filter((c) => {
      const matchQ = c.title.toLowerCase().includes(q.toLowerCase());
      const matchR = role === "all" ? true : c.role === role;
      const matchS = status === "all" ? true : c.derivedStatus === status;
      return matchQ && matchR && matchS;
    });
    const sorted = list.slice();
    if (sort === "title") sorted.sort((a, b) => a.title.localeCompare(b.title));
    else if (sort === "enrolled") sorted.sort((a, b) => b.enrolled - a.enrolled);
    else if (sort === "completion") sorted.sort((a, b) => b.completion - a.completion);
    return sorted;
  }, [courses, q, role, status, sort]);

  const counts = {
    all: courses.length,
    draft: courses.filter((c) => c.derivedStatus === "draft").length,
    "in-review": courses.filter((c) => c.derivedStatus === "in-review").length,
    published: courses.filter((c) => c.derivedStatus === "published").length,
  };

  return (
    <AdminLayout
      title="Courses"
      subtitle="Real courses built from your classes"
      actions={
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            className="h-9 gap-2 rounded-lg"
            onClick={() => setBulkOpen(true)}
          >
            <FileSpreadsheet className="h-4 w-4" /> Bulk import
          </Button>
          <Link to="/classes/new">
            <Button className="h-9 gap-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary-glow">
              <Plus className="h-4 w-4" /> New class
            </Button>
          </Link>
        </div>
      }
    >
      <div className="space-y-5">
        {loadFailed ? (
          <QueryLoadError
            message="Could not load courses"
            onRetry={() => {
              void refetch();
              void refetchDeptMap();
            }}
          />
        ) : null}
        <Card className="rounded-xl border-border bg-card p-3 shadow-soft">
          <div className="flex flex-wrap items-center gap-2">
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search courses…"
              className="h-9 w-64 rounded-lg border-border bg-background text-sm"
            />
            <Select value={role} onValueChange={setRole}>
              <SelectTrigger className="h-9 w-44 rounded-lg border-border bg-background text-sm">
                <Filter className="mr-1.5 h-3.5 w-3.5 text-muted-foreground" />
                <SelectValue placeholder="Role" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All roles</SelectItem>
                {DEPARTMENTS.map((d) => (
                  <SelectItem key={d} value={d}>
                    {d}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={sort} onValueChange={(v) => setSort(v as typeof sort)}>
              <SelectTrigger className="h-9 w-40 rounded-lg border-border bg-background text-sm">
                <ArrowUpDown className="mr-1.5 h-3.5 w-3.5 text-muted-foreground" />
                <SelectValue placeholder="Sort" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="recent">Recently updated</SelectItem>
                <SelectItem value="title">Title (A→Z)</SelectItem>
                <SelectItem value="enrolled">Most enrolled</SelectItem>
                <SelectItem value="completion">Highest completion</SelectItem>
              </SelectContent>
            </Select>
            <div className="ml-auto flex flex-wrap items-center gap-1.5">
              {(["all", "draft", "in-review", "published"] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => setStatus(s)}
                  className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-[11.5px] font-medium transition ${
                    status === s
                      ? "border-primary/40 bg-primary/10 text-primary"
                      : "border-border bg-background text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <span className="capitalize">{s === "all" ? "All" : s}</span>
                  <span className="rounded bg-muted px-1 text-[10px] text-muted-foreground">
                    {counts[s]}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </Card>

        {isLoading ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <Card
                key={i}
                className="h-72 animate-pulse rounded-xl border-border bg-muted/30 shadow-soft"
              />
            ))}
          </div>
        ) : !loadFailed && filtered.length === 0 ? (
          <Card className="rounded-xl border-dashed border-border bg-card p-12 text-center shadow-soft">
            <GraduationCap className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
            <h3 className="text-[16px] font-semibold">
              {courses.length === 0 ? "No courses yet" : "No courses match"}
            </h3>
            <p className="mt-1 text-[12.5px] text-muted-foreground">
              {courses.length === 0
                ? "Create your first class to get started."
                : "Try clearing filters or create a new class."}
            </p>
            <Link to="/classes/new" className="mt-4 inline-block">
              <Button className="h-9 gap-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary-glow">
                <Plus className="h-4 w-4" /> Create a class
              </Button>
            </Link>
          </Card>
        ) : !loadFailed ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {filtered.map((c) => {
              const atRisk = c.classCount > 0 && c.completion > 0 && c.completion < 40;
              return (
                <Card key={c.id} className="group relative overflow-hidden rounded-xl border-border bg-card p-0 shadow-soft transition hover:-translate-y-0.5 hover:shadow-glow">
                  <Link to="/courses/$courseId" params={{ courseId: c.id }} className="block">
                    <div className={`relative h-32 bg-gradient-to-br ${c.cover}`}>
                      <div className="absolute right-3 top-3 flex gap-1.5">
                        <Badge variant="outline" className="rounded-md border-white/30 bg-white/15 text-[10px] font-medium text-white backdrop-blur">
                          {c.level}
                        </Badge>
                      </div>
                      <div className="absolute bottom-3 left-3 right-3">
                        <div className="text-[11px] font-medium text-white/80">{c.role}</div>
                        <div className="line-clamp-1 text-[16px] font-semibold text-white">{c.title}</div>
                      </div>
                    </div>
                  </Link>
                  <div className="absolute right-2 top-2 z-10">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button
                          onClick={(e) => e.stopPropagation()}
                          className="flex h-7 w-7 items-center justify-center rounded-md bg-black/30 text-white opacity-0 backdrop-blur transition group-hover:opacity-100 hover:bg-black/50"
                          aria-label="Course actions"
                        >
                          <MoreVertical className="h-4 w-4" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-44">
                        <DropdownMenuItem onClick={() => navigate({ to: "/assignments" })}>
                          <UserPlus className="mr-2 h-3.5 w-3.5" /> Assign
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => navigate({ to: "/courses/$courseId", params: { courseId: c.id } })}>
                          <Pencil className="mr-2 h-3.5 w-3.5" /> Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => navigate({ to: "/classes/new" })}>
                          <Copy className="mr-2 h-3.5 w-3.5" /> Duplicate
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                  <div className="p-5">
                    <p className="line-clamp-2 text-[12px] text-muted-foreground">{c.description}</p>
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {c.topics.slice(0, 3).map((t) => (
                        <Badge key={t} variant="outline" className="rounded-md border-border bg-muted text-[10px] font-medium text-muted-foreground">
                          {t}
                        </Badge>
                      ))}
                      {c.topics.length > 3 ? (
                        <span className="text-[10px] text-muted-foreground">+{c.topics.length - 3}</span>
                      ) : null}
                    </div>
                    {(deptMap?.get(c.id) ?? []).length ? (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {(deptMap?.get(c.id) ?? []).map((d) => (
                          <Badge
                            key={d}
                            variant="outline"
                            className="rounded-md border-primary/30 bg-accent text-[10px] font-medium text-primary"
                          >
                            {d}
                          </Badge>
                        ))}
                      </div>
                    ) : null}

                    {/* Completion bar */}
                    <div className="mt-4">
                      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                        <span className="inline-flex items-center gap-1.5">
                          <TrendingUp className="h-3 w-3" /> Completion
                        </span>
                        <span className="font-medium text-foreground">{c.completion}%</span>
                      </div>
                      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
                        <div
                          className={`h-full rounded-full ${atRisk ? "bg-destructive" : "bg-primary"}`}
                          style={{ width: `${Math.min(100, Math.max(0, c.completion))}%` }}
                        />
                      </div>
                    </div>

                    <div className="mt-3 flex items-center justify-between text-[11px] text-muted-foreground">
                      <span className="inline-flex items-center gap-1.5">
                        <Users className="h-3 w-3" /> {c.enrolled} enrolled
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        <Layers className="h-3 w-3" /> {c.classCount} class{c.classCount === 1 ? "" : "es"}
                      </span>
                      <div className="flex items-center gap-1.5">
                        {atRisk ? (
                          <Badge variant="outline" className="gap-1 rounded-md border-destructive/30 bg-destructive/10 text-[10px] font-medium text-destructive">
                            <AlertTriangle className="h-3 w-3" /> At risk
                          </Badge>
                        ) : null}
                        <StatusBadge status={c.derivedStatus} />
                      </div>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        ) : null}
      </div>
      <BulkClassImportDialog open={bulkOpen} onOpenChange={setBulkOpen} />
    </AdminLayout>
  );
}
