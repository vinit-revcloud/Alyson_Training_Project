import { createFileRoute, Link, notFound, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  closestCorners,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { QueryLoadError } from "@/components/admin/QueryLoadError";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { getCourse, deleteClass, deleteCourse } from "@/lib/classes-api";
import {
  DEPARTMENTS,
  getCourseDepartments,
  getCourseTree,
  moveSectionToClass,
  reorderClasses,
  reorderSections,
  setCourseDepartments,
  type CourseTreeClass,
  type CourseTreeSection,
} from "@/lib/assignments-api";
import {
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  FileText,
  GripVertical,
  Layers,
  Plus,
  Sparkles,
  Trash2,
  FileSpreadsheet,
  Users,
} from "lucide-react";
import { BulkClassImportDialog } from "@/components/admin/BulkClassImportDialog";
import { Switch } from "@/components/ui/switch";
import { setCourseCoreOnboardingFn } from "@/lib/classes.functions";
import { toast } from "sonner";
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

const courseParamsSchema = z.object({ courseId: z.string().uuid() });

export const Route = createFileRoute("/courses/$courseId")({
  params: courseParamsSchema,
  component: CourseDetail,
  notFoundComponent: () => (
    <AdminLayout title="Course not found">
      <Link to="/courses" className="text-primary hover:underline">
        ← Back to courses
      </Link>
    </AdminLayout>
  ),
});

function CourseDetail() {
  const { courseId } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [bulkOpen, setBulkOpen] = useState(false);
  const [deleteCourseOpen, setDeleteCourseOpen] = useState(false);

  const {
    data: course,
    isLoading: courseLoading,
    isError: courseError,
    refetch: refetchCourse,
  } = useQuery({
    queryKey: ["course", courseId],
    queryFn: () => getCourse(courseId),
  });
  const {
    data: tree = [],
    isLoading: treeLoading,
    isError: treeError,
    refetch: refetchTree,
  } = useQuery({
    queryKey: ["course-tree", courseId],
    queryFn: () => getCourseTree(courseId),
    enabled: !!course,
  });
  const {
    data: assignedDepts = [],
    isError: deptError,
    refetch: refetchDepts,
  } = useQuery({
    queryKey: ["course-departments", courseId],
    queryFn: () => getCourseDepartments(courseId),
    enabled: !!course,
  });

  const setCoreFn = useServerFn(setCourseCoreOnboardingFn);
  const coreMut = useMutation({
    mutationFn: (isCore: boolean) => setCoreFn({ data: { courseId, isCore } }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["course", courseId] });
      toast.success("Core onboarding setting updated");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteCourseMutation = useMutation({
    mutationFn: () => deleteCourse(courseId),
    onSuccess: (result) => {
      setDeleteCourseOpen(false);
      void qc.invalidateQueries({ queryKey: ["courses"] });
      void qc.invalidateQueries({ queryKey: ["all-course-departments"] });
      toast.success(
        result.deletedClasses > 0
          ? `Course deleted (${result.deletedClasses} class${result.deletedClasses === 1 ? "" : "es"} removed)`
          : "Course deleted",
      );
      void navigate({ to: "/courses" });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (courseLoading) {
    return (
      <AdminLayout title="Course" subtitle="Loading course details…">
        <Card className="h-28 animate-pulse rounded-xl border-border bg-muted/30" />
        <Card className="mt-5 h-48 animate-pulse rounded-xl border-border bg-muted/30" />
      </AdminLayout>
    );
  }

  if (courseError) {
    return (
      <AdminLayout title="Course">
        <QueryLoadError message="Could not load this course" onRetry={() => void refetchCourse()} />
        <Link to="/courses" className="mt-4 inline-flex items-center gap-1 text-sm text-primary hover:underline">
          <ArrowLeft className="h-3.5 w-3.5" /> Back to courses
        </Link>
      </AdminLayout>
    );
  }

  if (!course) throw notFound();

  return (
    <AdminLayout
      title={course.title}
      subtitle={`${course.role} · ${course.level}`}
      actions={
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            className="h-9 gap-2 rounded-lg text-destructive hover:bg-destructive/10 hover:text-destructive"
            onClick={() => setDeleteCourseOpen(true)}
          >
            <Trash2 className="h-4 w-4" /> Delete course
          </Button>
          <Button
            variant="outline"
            className="h-9 gap-2 rounded-lg"
            onClick={() => setBulkOpen(true)}
          >
            <FileSpreadsheet className="h-4 w-4" /> Bulk import
          </Button>
          <Link to="/classes/new" search={{ courseId }}>
            <Button className="h-9 gap-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary-glow">
              <Plus className="h-4 w-4" /> New class
            </Button>
          </Link>
        </div>
      }
    >
      <div className="space-y-5">
        <div className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
          <Link to="/courses" className="inline-flex items-center gap-1 hover:text-foreground">
            <ArrowLeft className="h-3 w-3" /> Courses
          </Link>
          <ChevronRight className="h-3 w-3" />
          <span className="text-foreground">{course?.title}</span>
        </div>

        {course ? (
          <Card className="overflow-hidden rounded-xl border-border p-0 shadow-soft">
            <div className={`relative h-28 bg-gradient-to-br ${course.cover} p-5`}>
              <div className="absolute bottom-3 left-5 right-5">
                <div className="text-[11px] font-medium text-white/80">{course.role}</div>
                <div className="text-[18px] font-semibold text-white">{course.title}</div>
              </div>
            </div>
            <div className="p-5">
              <p className="text-[13px] text-muted-foreground">{course.description}</p>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {(course.topics ?? []).map((t) => (
                  <Badge
                    key={t}
                    variant="outline"
                    className="rounded-md border-border bg-muted text-[10.5px] text-muted-foreground"
                  >
                    {t}
                  </Badge>
                ))}
              </div>
              <div className="mt-4 flex items-center justify-between rounded-lg border border-border bg-muted/30 p-3">
                <div>
                  <p className="text-sm font-medium">Core onboarding course</p>
                  <p className="text-xs text-muted-foreground">
                    Auto-assigned to all new joiners on hire
                  </p>
                </div>
                <Switch
                  checked={course.is_core_onboarding}
                  disabled={coreMut.isPending}
                  onCheckedChange={(v) => coreMut.mutate(v)}
                />
              </div>
            </div>
          </Card>
        ) : null}

        {treeError || deptError ? (
          <QueryLoadError
            message="Some course content failed to load"
            onRetry={() => {
              void refetchTree();
              void refetchDepts();
            }}
          />
        ) : null}

        <DepartmentPanel
          courseId={courseId}
          assigned={assignedDepts}
          onChange={() => qc.invalidateQueries({ queryKey: ["course-departments", courseId] })}
        />

        <CourseTree
          courseId={courseId}
          tree={tree}
          loading={treeLoading}
          onChange={() => {
            qc.invalidateQueries({ queryKey: ["course-tree", courseId] });
            qc.invalidateQueries({ queryKey: ["courses"] });
          }}
        />
      </div>
      <BulkClassImportDialog
        open={bulkOpen}
        onOpenChange={setBulkOpen}
        courseId={courseId}
        courseTitle={course.title}
      />

      <AlertDialog open={deleteCourseOpen} onOpenChange={setDeleteCourseOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete course?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm text-muted-foreground">
                <p>
                  This will permanently delete <strong>{course.title}</strong>
                  {tree.length > 0 ? (
                    <>
                      {" "}
                      and its <strong>{tree.length}</strong> class
                      {tree.length === 1 ? "" : "es"} (sections, assets, and linked assessments).
                    </>
                  ) : (
                    "."
                  )}
                </p>
                <p>Department assignments and learner path links for this course will also be removed.</p>
                {course.is_core_onboarding ? (
                  <p className="text-destructive">
                    Turn off core onboarding below before deleting this course.
                  </p>
                ) : null}
                <p>This action cannot be undone.</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteCourseMutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteCourseMutation.isPending || course.is_core_onboarding}
              onClick={(e) => {
                e.preventDefault();
                deleteCourseMutation.mutate();
              }}
            >
              {deleteCourseMutation.isPending ? "Deleting…" : "Delete course"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AdminLayout>
  );
}

// =========================================================================
// Department assignment panel
// =========================================================================

function DepartmentPanel({
  courseId,
  assigned,
  onChange,
}: {
  courseId: string;
  assigned: string[];
  onChange: () => void;
}) {
  const [local, setLocal] = useState<string[]>(assigned);
  useEffect(() => setLocal(assigned), [assigned]);

  const save = useMutation({
    mutationFn: (departments: string[]) => setCourseDepartments(courseId, departments),
    onSuccess: () => {
      toast.success("Department assignments updated");
      onChange();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to save"),
  });

  const toggle = (d: string) => {
    setLocal((prev) =>
      prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d],
    );
  };

  const dirty = useMemo(() => {
    const a = [...assigned].sort().join("|");
    const b = [...local].sort().join("|");
    return a !== b;
  }, [assigned, local]);

  return (
    <Card className="rounded-xl border-border bg-card p-4 shadow-soft">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-[13px] font-semibold">
            <Users className="h-4 w-4 text-primary" />
            Role-based assignment
          </div>
          <div className="mt-0.5 text-[11.5px] text-muted-foreground">
            Pick which departments should see this course in their trainee panel.
          </div>
        </div>
        <Button
          size="sm"
          disabled={!dirty || save.isPending}
          onClick={() => save.mutate(local)}
          className="h-8 rounded-lg bg-primary text-primary-foreground hover:bg-primary-glow"
        >
          {save.isPending ? "Saving…" : dirty ? "Save assignments" : "All saved"}
        </Button>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {DEPARTMENTS.map((d) => {
          const active = local.includes(d);
          return (
            <button
              key={d}
              type="button"
              onClick={() => toggle(d)}
              className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-[11.5px] font-medium transition ${
                active
                  ? "border-primary/40 bg-primary/10 text-primary"
                  : "border-border bg-background text-muted-foreground hover:text-foreground"
              }`}
            >
              {active ? <span className="h-1.5 w-1.5 rounded-full bg-primary" /> : null}
              {d}
            </button>
          );
        })}
      </div>
    </Card>
  );
}

// =========================================================================
// Udemy-style course tree with drag-and-drop
// =========================================================================

type DragItem =
  | { kind: "class"; id: string }
  | { kind: "section"; id: string; classId: string };

function CourseTree({
  courseId,
  tree,
  loading,
  onChange,
}: {
  courseId: string;
  tree: CourseTreeClass[];
  loading: boolean;
  onChange: () => void;
}) {
  // Local mirror so DnD updates feel instant.
  const [classes, setClasses] = useState<CourseTreeClass[]>(tree);
  useEffect(() => setClasses(tree), [tree]);

  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  useEffect(() => {
    // Expand all by default the first time data loads
    if (tree.length && Object.keys(expanded).length === 0) {
      setExpanded(Object.fromEntries(tree.map((c) => [c.id, true])));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tree.length]);

  const [active, setActive] = useState<DragItem | null>(null);
  const [classToDelete, setClassToDelete] = useState<CourseTreeClass | null>(null);

  const deleteClassMutation = useMutation({
    mutationFn: (classId: string) => deleteClass(classId),
    onSuccess: (_data, classId) => {
      setClasses((prev) => prev.filter((c) => c.id !== classId));
      setClassToDelete(null);
      toast.success("Class deleted");
      onChange();
    },
    onError: (e) => {
      toast.error(e instanceof Error ? e.message : "Failed to delete class");
    },
  });

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const findContainerOf = (id: string): { kind: "class-list" | "section-list"; classId?: string } | null => {
    if (classes.some((c) => c.id === id)) return { kind: "class-list" };
    for (const c of classes) {
      if (c.sections.some((s) => s.id === id)) return { kind: "section-list", classId: c.id };
      if (id === `section-list:${c.id}`) return { kind: "section-list", classId: c.id };
    }
    return null;
  };

  const onDragStart = (e: DragStartEvent) => {
    const id = String(e.active.id);
    if (id.startsWith("class:")) {
      setActive({ kind: "class", id: id.slice("class:".length) });
    } else if (id.startsWith("section:")) {
      const [, payload] = id.split(":");
      const [classId, sectionId] = payload.split("@");
      setActive({ kind: "section", id: sectionId, classId });
    }
  };

  const onDragOver = (e: DragOverEvent) => {
    if (!active || active.kind !== "section") return;
    const overId = String(e.over?.id ?? "");
    if (!overId) return;
    const targetClassId = overId.startsWith("section-list:")
      ? overId.slice("section-list:".length)
      : overId.startsWith("section:")
        ? overId.slice("section:".length).split("@")[0]
        : null;
    if (!targetClassId || targetClassId === active.classId) return;

    setClasses((prev) => {
      const sourceClass = prev.find((c) => c.id === active.classId);
      const movedSection = sourceClass?.sections.find((s) => s.id === active.id);
      if (!sourceClass || !movedSection) return prev;
      return prev.map((c) => {
        if (c.id === active.classId) {
          return { ...c, sections: c.sections.filter((s) => s.id !== active.id) };
        }
        if (c.id === targetClassId) {
          return { ...c, sections: [...c.sections, movedSection] };
        }
        return c;
      });
    });
    setActive({ ...active, classId: targetClassId });
  };

  const onDragEnd = async (e: DragEndEvent) => {
    const current = active;
    setActive(null);
    if (!current || !e.over) return;
    const overId = String(e.over.id);
    const activeId = String(e.active.id);

    if (current.kind === "class") {
      if (!overId.startsWith("class:")) return;
      const oldIndex = classes.findIndex((c) => `class:${c.id}` === activeId);
      const newIndex = classes.findIndex((c) => `class:${c.id}` === overId);
      if (oldIndex < 0 || newIndex < 0 || oldIndex === newIndex) return;
      const next = arrayMove(classes, oldIndex, newIndex);
      setClasses(next);
      try {
        await reorderClasses(
          courseId,
          next.map((c) => c.id),
        );
        toast.success("Class order saved");
        onChange();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to reorder classes");
        onChange();
      }
      return;
    }

    if (current.kind === "section") {
      const targetClassId = current.classId;
      const targetClass = classes.find((c) => c.id === targetClassId);
      if (!targetClass) return;
      const targetIndex = overId.startsWith("section:")
        ? targetClass.sections.findIndex((s) => `section:${targetClassId}@${s.id}` === overId)
        : targetClass.sections.length - 1;
      const fromIndex = targetClass.sections.findIndex((s) => s.id === current.id);
      const reorderedSections = arrayMove(
        targetClass.sections,
        fromIndex,
        targetIndex < 0 ? targetClass.sections.length - 1 : targetIndex,
      );
      const next = classes.map((c) =>
        c.id === targetClassId ? { ...c, sections: reorderedSections } : c,
      );
      setClasses(next);

      try {
        // If the section's original class differed from current target, persist the move.
        const original = tree.find((c) => c.sections.some((s) => s.id === current.id));
        if (original && original.id !== targetClassId) {
          await moveSectionToClass(
            current.id,
            targetClassId,
            reorderedSections.findIndex((s) => s.id === current.id),
          );
        }
        await reorderSections(
          targetClassId,
          reorderedSections.map((s) => s.id),
        );
        toast.success("Sections updated");
        onChange();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to update sections");
        onChange();
      }
    }
  };

  if (loading) {
    return (
      <Card className="rounded-xl border-border bg-card p-6 shadow-soft text-[12.5px] text-muted-foreground">
        Loading course content…
      </Card>
    );
  }

  if (!classes.length) {
    return (
      <Card className="rounded-xl border-dashed border-border bg-card p-10 text-center shadow-soft">
        <Layers className="mx-auto mb-3 h-9 w-9 text-muted-foreground" />
        <h3 className="text-[15px] font-semibold">No classes yet</h3>
        <p className="mt-1 text-[12px] text-muted-foreground">
          Create a class to start populating this course.
        </p>
      </Card>
    );
  }

  return (
    <>
      <Card className="rounded-xl border-border bg-card p-3 shadow-soft">
        <div className="mb-2 flex items-center justify-between px-2">
          <div className="text-[13px] font-semibold">Course outline</div>
          <div className="text-[11px] text-muted-foreground">
            Drag <GripVertical className="inline h-3 w-3" /> to reorder. Drag a topic into another
            section to move it.
          </div>
        </div>
        <DndContext
          sensors={sensors}
          collisionDetection={active?.kind === "class" ? closestCenter : closestCorners}
          onDragStart={onDragStart}
          onDragOver={onDragOver}
          onDragEnd={onDragEnd}
        >
          <SortableContext
            items={classes.map((c) => `class:${c.id}`)}
            strategy={verticalListSortingStrategy}
          >
            <div className="space-y-2">
              {classes.map((cls) => (
                <SortableClass
                  key={cls.id}
                  cls={cls}
                  expanded={!!expanded[cls.id]}
                  onToggle={() =>
                    setExpanded((e) => ({ ...e, [cls.id]: !e[cls.id] }))
                  }
                  onDelete={() => setClassToDelete(cls)}
                />
              ))}
            </div>
          </SortableContext>

          <DragOverlay>
            {active?.kind === "class" ? (
              <div className="rounded-lg border border-primary/40 bg-card px-3 py-2 text-[13px] font-semibold shadow-glow">
                {classes.find((c) => c.id === active.id)?.name}
              </div>
            ) : active?.kind === "section" ? (
              <div className="rounded-lg border border-primary/40 bg-card px-3 py-1.5 text-[12.5px] shadow-glow">
                {classes
                  .flatMap((c) => c.sections)
                  .find((s) => s.id === active.id)?.title}
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      </Card>

      <AlertDialog
        open={!!classToDelete}
        onOpenChange={(open) => !open && setClassToDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete class?</AlertDialogTitle>
            <AlertDialogDescription>
              {classToDelete ? (
                <>
                  This will permanently delete <strong>{classToDelete.name}</strong>, including all
                  topics, assets, questions, and its assessment. This cannot be undone.
                </>
              ) : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteClassMutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteClassMutation.isPending}
              onClick={(e) => {
                e.preventDefault();
                if (classToDelete) deleteClassMutation.mutate(classToDelete.id);
              }}
            >
              {deleteClassMutation.isPending ? "Deleting…" : "Delete class"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function SortableClass({
  cls,
  expanded,
  onToggle,
  onDelete,
}: {
  cls: CourseTreeClass;
  expanded: boolean;
  onToggle: () => void;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: `class:${cls.id}`,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  const totalAssets = cls.sections.reduce((a, s) => a + s.asset_count, 0);
  const totalQuestions = cls.sections.reduce((a, s) => a + s.question_count, 0);

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="rounded-xl border border-border bg-background"
    >
      <div className="flex items-center gap-2 px-2 py-2">
        <button
          {...attributes}
          {...listeners}
          className="cursor-grab rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground active:cursor-grabbing"
          aria-label="Drag to reorder class"
        >
          <GripVertical className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={onToggle}
          className="flex flex-1 items-center gap-2 rounded px-1 py-1 text-left hover:bg-muted/60"
        >
          {expanded ? (
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
          )}
          <div className="flex flex-1 items-center gap-2">
            <span className="text-[13.5px] font-semibold">{cls.name}</span>
            <Badge
              variant="outline"
              className="rounded-md border-border bg-muted text-[10px] text-muted-foreground"
            >
              {cls.level}
            </Badge>
            <StatusBadge status={cls.status as "draft" | "in-review" | "published"} />
          </div>
          <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <Layers className="h-3 w-3" /> {cls.sections.length} topics
            </span>
            <span className="inline-flex items-center gap-1">
              <FileText className="h-3 w-3" /> {totalAssets} assets
            </span>
            <span className="inline-flex items-center gap-1">
              <Sparkles className="h-3 w-3" /> {totalQuestions} questions
            </span>
          </div>
        </button>
        <Link
          to="/classes/$classId"
          params={{ classId: cls.id }}
          className="rounded-md px-2 py-1 text-[11.5px] font-medium text-primary hover:underline"
        >
          Open
        </Link>
        <button
          type="button"
          onClick={onDelete}
          className="rounded-md p-1.5 text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive"
          aria-label={`Delete ${cls.name}`}
          title="Delete class"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      {expanded ? (
        <div className="border-t border-border bg-muted/30 px-2 py-2">
          <SortableContext
            items={[
              ...cls.sections.map((s) => `section:${cls.id}@${s.id}`),
              `section-list:${cls.id}`,
            ]}
            strategy={verticalListSortingStrategy}
          >
            <div id={`section-list:${cls.id}`} className="space-y-1.5">
              {cls.sections.length === 0 ? (
                <div className="rounded-md border border-dashed border-border bg-background px-3 py-3 text-center text-[11.5px] text-muted-foreground">
                  Drop a topic here, or add one from the class page.
                </div>
              ) : (
                cls.sections.map((s) => (
                  <SortableSection key={s.id} classId={cls.id} section={s} />
                ))
              )}
            </div>
          </SortableContext>
        </div>
      ) : null}
    </div>
  );
}

function SortableSection({
  classId,
  section,
}: {
  classId: string;
  section: CourseTreeSection;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: `section:${classId}@${section.id}`,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };
  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-2 rounded-md border border-border bg-background px-2 py-1.5"
    >
      <button
        {...attributes}
        {...listeners}
        className="cursor-grab rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground active:cursor-grabbing"
        aria-label="Drag to reorder topic"
      >
        <GripVertical className="h-3.5 w-3.5" />
      </button>
      <span className="flex-1 truncate text-[12.5px]">{section.title}</span>
      <div className="flex items-center gap-3 text-[10.5px] text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <FileText className="h-3 w-3" /> {section.asset_count}
        </span>
        <span className="inline-flex items-center gap-1">
          <Sparkles className="h-3 w-3" /> {section.question_count}
        </span>
      </div>
    </div>
  );
}
