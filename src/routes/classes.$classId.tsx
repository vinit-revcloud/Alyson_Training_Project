import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatusBadge } from "@/components/admin/StatusBadge";
import {
  addSection,
  addSectionVideoLink,
  deleteSection,
  deleteSectionAsset,
  getAssetSignedUrl,
  getClass,
  getCourse,
  listSectionQuestions,
  listSectionsWithAssets,
  replaceSectionAsset,
  updateClassMeta,
  updateSection,
  uploadSectionAsset,
  type ClassStatus,
  type SectionAssetRow,
} from "@/lib/classes-api";
import { invalidateClassLifecycleQueries, transitionClassStatus } from "@/lib/class-lifecycle";
import { getAssessmentAttemptSummary, getClassAssessment } from "@/lib/assessments-api";
import { regenerateSectionQuestions } from "@/lib/section-questions.functions";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowLeft,
  ChevronRight,
  Plus,
  Trash2,
  Upload,
  PlayCircle,
  FileText,
  FileType2,
  Link2,
  Download,
  Save,
  Send,
  CheckCircle2,
  Undo2,
  RefreshCw,
  Sparkles,
  Loader2,
  Replace as ReplaceIcon,
  Rocket,
} from "lucide-react";

export const Route = createFileRoute("/classes/$classId")({
  component: ClassEditor,
  notFoundComponent: () => (
    <AdminLayout title="Class not found">
      <Link to="/courses" className="text-primary hover:underline">← Back to courses</Link>
    </AdminLayout>
  ),
});

function ClassEditor() {
  const { classId } = Route.useParams();
  const qc = useQueryClient();

  const { data: cls, isLoading } = useQuery({
    queryKey: ["class", classId],
    queryFn: () => getClass(classId),
  });
  const { data: course } = useQuery({
    queryKey: ["course", cls?.course_id],
    queryFn: () => (cls?.course_id ? getCourse(cls.course_id) : Promise.resolve(null)),
    enabled: !!cls?.course_id,
  });
  const { data: sections = [], refetch: refetchSections } = useQuery({
    queryKey: ["class-sections", classId],
    queryFn: () => listSectionsWithAssets(classId),
  });
  const { data: assessment } = useQuery({
    queryKey: ["class-assessment", classId],
    queryFn: () => getClassAssessment(classId),
  });
  const { data: attemptSummary } = useQuery({
    queryKey: ["assessment-attempts", assessment?.id],
    queryFn: () => getAssessmentAttemptSummary(assessment!.id),
    enabled: !!assessment?.id,
  });

  if (!isLoading && !cls) throw notFound();

  // Local editable meta
  const [name, setName] = useState("");
  const [summary, setSummary] = useState("");
  const [audience, setAudience] = useState("");
  const [level, setLevel] = useState("Beginner");

  // Sync once loaded
  if (cls && name === "" && summary === "" && audience === "" && level === "Beginner" && cls.name) {
    setName(cls.name);
    setSummary(cls.summary);
    setAudience(cls.audience);
    setLevel(cls.level);
  }

  const saveMeta = useMutation({
    mutationFn: () => updateClassMeta(classId, { name, summary, audience, level }),
    onSuccess: () => {
      toast.success("Class details saved");
      invalidateClassLifecycleQueries(qc, { courseId: cls?.course_id, classId });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const setStatus = useMutation({
    mutationFn: async (status: ClassStatus) => {
      if (!cls) throw new Error("Class not loaded");
      return transitionClassStatus(cls, status);
    },
    onSuccess: (aiResult, status) => {
      toast.success(`Class moved to ${status}`);
      if (aiResult?.sectionQuestionCount || aiResult?.assessmentQuestionCount) {
        toast.message("AI knowledge base processed", {
          description: `${aiResult.sectionQuestionCount} section questions · ${aiResult.assessmentQuestionCount} final test questions`,
        });
      }
      if (aiResult?.warnings?.length) {
        toast.warning("Class saved with AI warnings", { description: aiResult.warnings[0] });
      }
      invalidateClassLifecycleQueries(qc, { courseId: cls?.course_id, classId });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const addSec = useMutation({
    mutationFn: () => addSection(classId, { title: `Section ${sections.length + 1}` }),
    onSuccess: () => refetchSections(),
  });

  return (
    <AdminLayout
      title={cls?.name ?? "Class"}
      subtitle={course ? `${course.title} · ${cls?.level ?? ""}` : ""}
      actions={
        <div className="flex items-center gap-2">
          <StatusBadge status={cls?.status ?? "draft"} />
          {cls?.status === "draft" && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setStatus.mutate("in-review")}
              className="h-9 gap-1.5 rounded-lg"
            >
              <Send className="h-3.5 w-3.5" /> Submit for review
            </Button>
          )}
          {cls?.status === "in-review" && (
            <>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setStatus.mutate("draft")}
                className="h-9 gap-1.5 rounded-lg"
              >
                <Undo2 className="h-3.5 w-3.5" /> Back to draft
              </Button>
              <Button
                size="sm"
                onClick={() => setStatus.mutate("published")}
                className="h-9 gap-1.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary-glow"
              >
                <CheckCircle2 className="h-3.5 w-3.5" /> Publish
              </Button>
            </>
          )}
          {cls?.status === "published" && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setStatus.mutate("draft")}
              className="h-9 gap-1.5 rounded-lg"
            >
              <Undo2 className="h-3.5 w-3.5" /> Revert to draft
            </Button>
          )}
        </div>
      }
    >
      <div className="space-y-5">
        <div className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
          <Link to="/courses" className="inline-flex items-center gap-1 hover:text-foreground">
            <ArrowLeft className="h-3 w-3" /> Courses
          </Link>
          <ChevronRight className="h-3 w-3" />
          {course ? (
            <Link
              to="/courses/$courseId"
              params={{ courseId: course.id }}
              className="hover:text-foreground"
            >
              {course.title}
            </Link>
          ) : null}
          <ChevronRight className="h-3 w-3" />
          <span className="text-foreground">{cls?.name}</span>
        </div>

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
          {/* Sections column */}
          <div className="space-y-4 lg:col-span-2">
            <Card className="rounded-xl border-border bg-card p-5 shadow-soft">
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <div className="text-[14px] font-semibold">Sections</div>
                  <div className="text-[11px] text-muted-foreground">
                    {sections.length} section{sections.length === 1 ? "" : "s"} · edit titles, content & re-upload assets anytime
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => addSec.mutate()}
                  disabled={addSec.isPending}
                  className="h-8 gap-1.5 rounded-md text-[12px]"
                >
                  <Plus className="h-3.5 w-3.5" /> Add section
                </Button>
              </div>
              <div className="space-y-3">
                {sections.map((s) => (
                  <SectionCard
                    key={s.id}
                    classId={classId}
                    section={s}
                    onChange={() => refetchSections()}
                  />
                ))}
                {sections.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-border p-8 text-center text-[12px] text-muted-foreground">
                    No sections yet. Click <span className="font-medium text-foreground">Add section</span>.
                  </div>
                ) : null}
              </div>
            </Card>
          </div>

          {/* Meta column */}
          <div className="space-y-4">
            <Card className="rounded-xl border-border bg-card p-5 shadow-soft">
              <div className="text-[14px] font-semibold">Class details</div>
              <div className="mt-3 space-y-3 text-[12.5px]">
                <Field label="Name">
                  <Input value={name} onChange={(e) => setName(e.target.value)} className="h-9 rounded-md text-[13px]" />
                </Field>
                <Field label="Summary">
                  <Textarea
                    value={summary}
                    onChange={(e) => setSummary(e.target.value)}
                    className="min-h-20 rounded-md text-[13px]"
                  />
                </Field>
                <Field label="Audience">
                  <Input value={audience} onChange={(e) => setAudience(e.target.value)} className="h-9 rounded-md text-[13px]" />
                </Field>
                <Field label="Level">
                  <Select value={level} onValueChange={setLevel}>
                    <SelectTrigger className="h-9 rounded-md text-[13px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Beginner">Beginner</SelectItem>
                      <SelectItem value="Intermediate">Intermediate</SelectItem>
                      <SelectItem value="Advanced">Advanced</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                <Button
                  onClick={() => saveMeta.mutate()}
                  disabled={saveMeta.isPending}
                  className="w-full gap-2 rounded-md bg-primary text-primary-foreground hover:bg-primary-glow"
                >
                  <Save className="h-4 w-4" /> Save details
                </Button>
              </div>
            </Card>

            <Card className="rounded-xl border-border bg-card p-5 shadow-soft">
              <div className="flex items-center justify-between">
                <div className="text-[14px] font-semibold">Final assessment</div>
                {assessment ? (
                  <Badge variant="outline" className="rounded-md border-primary/30 bg-accent text-[10px] font-medium text-primary">
                    {assessment.status}
                  </Badge>
                ) : (
                  <Badge variant="outline" className="rounded-md border-border bg-muted text-[10px] text-muted-foreground">
                    not attached
                  </Badge>
                )}
              </div>
              <div className="mt-2 space-y-1 text-[12px] text-muted-foreground">
                <div>Difficulty: <span className="font-medium text-foreground">{cls?.test_difficulty}</span></div>
                <div>MCQ: <span className="font-medium text-foreground">{cls?.test_mcq_count}</span></div>
                <div>Essay: <span className="font-medium text-foreground">{cls?.test_subjective_count}</span></div>
                <div>Pass mark: <span className="font-medium text-foreground">{cls?.test_pass_mark}%</span></div>
              </div>

              {assessment ? (
                <div className="mt-3 rounded-lg border border-border bg-muted/40 p-3">
                  <div className="flex items-center justify-between">
                    <div className="text-[11.5px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Attempt status
                    </div>
                    <span className="text-[10.5px] text-muted-foreground">
                      {attemptSummary?.total ?? 0} total
                    </span>
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-1.5">
                    {(
                      [
                        { key: "not_started", label: "Not started", cls: "border-border bg-background text-muted-foreground" },
                        { key: "in_progress", label: "In progress", cls: "border-amber-300/50 bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300" },
                        { key: "submitted", label: "Submitted", cls: "border-primary/30 bg-accent text-primary" },
                        { key: "graded", label: "Graded", cls: "border-emerald-300/50 bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300" },
                      ] as const
                    ).map((s) => (
                      <div
                        key={s.key}
                        className={`flex items-center justify-between rounded-md border px-2 py-1 text-[11px] ${s.cls}`}
                      >
                        <span>{s.label}</span>
                        <span className="font-semibold">{attemptSummary?.[s.key] ?? 0}</span>
                      </div>
                    ))}
                  </div>
                  {attemptSummary && attemptSummary.graded > 0 ? (
                    <div className="mt-2 flex items-center justify-between text-[11px] text-muted-foreground">
                      <span>
                        Pass {attemptSummary.passed}/{attemptSummary.graded}
                      </span>
                      {attemptSummary.avgScore !== null ? (
                        <span>Avg score {attemptSummary.avgScore}%</span>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              ) : null}


              {assessment ? (
                <Button
                  asChild
                  className="mt-3 w-full gap-2 rounded-md bg-primary text-primary-foreground hover:bg-primary-glow"
                >
                  <Link
                    to="/assessments/$assessmentId/preview"
                    params={{ assessmentId: assessment.id }}
                  >
                    <Rocket className="h-4 w-4" /> Launch final assessment
                  </Link>
                </Button>
              ) : null}

              <Button
                asChild
                className="mt-2 w-full gap-2 rounded-md"
                variant="outline"
              >
                <Link
                  to="/assessments/builder"
                  search={{
                    classId,
                    className: cls?.name,
                    role: cls?.audience,
                    topics: cls?.topics?.join(",") ?? "",
                    difficulty: (cls?.test_difficulty as "Beginner" | "Intermediate" | "Advanced") ?? "Beginner",
                    mcq: cls?.test_mcq_count,
                    subjective: cls?.test_subjective_count,
                    passMark: cls?.test_pass_mark,
                  }}
                >
                  {assessment ? "Edit in randomizer" : "Open randomizer"}
                </Link>
              </Button>
            </Card>

            <Card className="rounded-xl border-border bg-card p-5 shadow-soft">
              <div className="text-[14px] font-semibold">Topics</div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {(cls?.topics ?? []).map((t) => (
                  <Badge key={t} variant="outline" className="rounded-md border-border bg-muted text-[10.5px] text-muted-foreground">
                    {t}
                  </Badge>
                ))}
                {(cls?.topics ?? []).length === 0 ? (
                  <span className="text-[11px] text-muted-foreground">No topics assigned.</span>
                ) : null}
              </div>
            </Card>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

interface SectionWithAssets {
  id: string;
  title: string;
  description: string;
  duration_min: number;
  objectives: string;
  position: number;
  questions_status?: string;
  questions_updated_at?: string | null;
  assets: SectionAssetRow[];
}

type AssetKind = "video" | "document" | "transcript";

function SectionCard({
  classId,
  section,
  onChange,
}: {
  classId: string;
  section: SectionWithAssets;
  onChange: () => void;
}) {
  const qc = useQueryClient();
  const [title, setTitle] = useState(section.title);
  const [description, setDescription] = useState(section.description);
  const [linkUrl, setLinkUrl] = useState("");
  const videoRef = useRef<HTMLInputElement>(null);
  const docRef = useRef<HTMLInputElement>(null);
  const trRef = useRef<HTMLInputElement>(null);

  const { data: questions = [] } = useQuery({
    queryKey: ["section-questions", section.id],
    queryFn: () => listSectionQuestions(section.id),
  });

  const regenServer = useServerFn(regenerateSectionQuestions);
  const regen = useMutation({
    mutationFn: () => regenServer({ data: { sectionId: section.id, count: 8, difficulty: "Beginner" } }),
    onSuccess: (res) => {
      toast.success(`Generated ${res.count} question${res.count === 1 ? "" : "s"}`);
      qc.invalidateQueries({ queryKey: ["section-questions", section.id] });
      onChange();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const triggerAutoRegen = () => {
    // Fire-and-forget; the section card shows regenerating state
    regen.mutate();
  };

  const save = useMutation({
    mutationFn: () => updateSection(section.id, { title, description }),
    onSuccess: () => {
      toast.success("Section saved");
      onChange();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: () => deleteSection(section.id),
    onSuccess: () => {
      toast.success("Section deleted");
      onChange();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const upload = useMutation({
    mutationFn: (args: { kind: AssetKind; file: File }) =>
      uploadSectionAsset(classId, section.id, args.kind, args.file),
    onSuccess: () => {
      toast.success("Uploaded — regenerating questions…");
      onChange();
      triggerAutoRegen();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const replace = useMutation({
    mutationFn: (args: { assetId: string; kind: AssetKind; file: File }) =>
      replaceSectionAsset(classId, section.id, args.assetId, args.kind, args.file),
    onSuccess: () => {
      toast.success("Replaced — regenerating questions…");
      onChange();
      triggerAutoRegen();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const addLink = useMutation({
    mutationFn: (url: string) => addSectionVideoLink(section.id, url),
    onSuccess: () => {
      toast.success("Video link added");
      setLinkUrl("");
      onChange();
      triggerAutoRegen();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const delAsset = useMutation({
    mutationFn: (id: string) => deleteSectionAsset(id),
    onSuccess: () => {
      toast.success("Removed — regenerating questions…");
      onChange();
      triggerAutoRegen();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const isRegenerating = regen.isPending || section.questions_status === "regenerating";

  return (
    <div className="rounded-lg border border-border bg-background p-4">
      <div className="flex items-start gap-3">
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-[11px] font-semibold text-primary">
          {section.position + 1}
        </div>
        <div className="min-w-0 flex-1 space-y-3">
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="h-8 rounded-md border-border bg-card text-[13px] font-medium"
          />
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Section description / learning notes…"
            className="min-h-16 rounded-md border-border bg-card text-[12.5px]"
          />

          <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
            <AssetBucket
              icon={<PlayCircle className="h-3.5 w-3.5 text-primary" />}
              label="Videos"
              kind="video"
              assets={section.assets.filter((a) => a.kind === "video" || a.kind === "video_link")}
              onDelete={(id) => delAsset.mutate(id)}
              onUpload={() => videoRef.current?.click()}
              onReplace={(assetId, file) => replace.mutate({ assetId, kind: "video", file })}
              extra={
                <div className="mt-2 flex gap-1.5">
                  <Input
                    value={linkUrl}
                    onChange={(e) => setLinkUrl(e.target.value)}
                    placeholder="Paste video URL"
                    className="h-7 rounded-md border-border bg-background text-[11.5px]"
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!linkUrl}
                    onClick={() => addLink.mutate(linkUrl)}
                    className="h-7 gap-1 rounded-md px-2 text-[11px]"
                  >
                    <Link2 className="h-3 w-3" /> Add
                  </Button>
                </div>
              }
            />
            <input
              ref={videoRef}
              type="file"
              accept="video/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) upload.mutate({ kind: "video", file: f });
                e.target.value = "";
              }}
            />

            <AssetBucket
              icon={<FileText className="h-3.5 w-3.5 text-primary" />}
              label="Documents"
              kind="document"
              assets={section.assets.filter((a) => a.kind === "document")}
              onDelete={(id) => delAsset.mutate(id)}
              onUpload={() => docRef.current?.click()}
              onReplace={(assetId, file) => replace.mutate({ assetId, kind: "document", file })}
            />
            <input
              ref={docRef}
              type="file"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) upload.mutate({ kind: "document", file: f });
                e.target.value = "";
              }}
            />

            <AssetBucket
              icon={<FileType2 className="h-3.5 w-3.5 text-primary" />}
              label="Transcripts"
              kind="transcript"
              assets={section.assets.filter((a) => a.kind === "transcript")}
              onDelete={(id) => delAsset.mutate(id)}
              onUpload={() => trRef.current?.click()}
              onReplace={(assetId, file) => replace.mutate({ assetId, kind: "transcript", file })}
            />
            <input
              ref={trRef}
              type="file"
              accept=".txt,.md,.srt,.vtt,.pdf,.doc,.docx"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) upload.mutate({ kind: "transcript", file: f });
                e.target.value = "";
              }}
            />
          </div>

          {/* Questions strip */}
          <div className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-[11.5px]">
            <Sparkles className="h-3.5 w-3.5 text-primary" />
            <span className="font-medium text-foreground">Section questions:</span>
            {isRegenerating ? (
              <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-300">
                <Loader2 className="h-3 w-3 animate-spin" /> regenerating…
              </span>
            ) : section.questions_status === "error" ? (
              <span className="text-destructive">last regeneration failed</span>
            ) : questions.length > 0 ? (
              <span className="text-muted-foreground">
                {questions.length} ready · {questions.filter((q) => q.type === "mcq").length} MCQ ·{" "}
                {questions.filter((q) => q.type === "subjective").length} essay
              </span>
            ) : (
              <span className="text-muted-foreground">none yet — upload material or click regenerate</span>
            )}
            <Button
              size="sm"
              variant="ghost"
              onClick={() => regen.mutate()}
              disabled={isRegenerating}
              className="ml-auto h-6 gap-1 rounded-md px-2 text-[11px] text-primary hover:bg-primary/10"
            >
              <RefreshCw className={`h-3 w-3 ${isRegenerating ? "animate-spin" : ""}`} />
              Regenerate
            </Button>
          </div>

          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => save.mutate()}
              disabled={save.isPending}
              className="h-7 gap-1.5 rounded-md text-[11.5px]"
            >
              <Save className="h-3 w-3" /> Save
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                if (confirm("Delete this section and all its assets?")) remove.mutate();
              }}
              className="h-7 gap-1.5 rounded-md text-[11.5px] text-destructive hover:bg-destructive/10 hover:text-destructive"
            >
              <Trash2 className="h-3 w-3" /> Delete
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function AssetBucket({
  icon,
  label,
  kind,
  assets,
  onDelete,
  onUpload,
  onReplace,
  extra,
}: {
  icon: React.ReactNode;
  label: string;
  kind: AssetKind;
  assets: SectionAssetRow[];
  onDelete: (id: string) => void;
  onUpload: () => void;
  onReplace: (assetId: string, file: File) => void;
  extra?: React.ReactNode;
}) {
  const replaceInputRef = useRef<HTMLInputElement>(null);
  const [replaceTarget, setReplaceTarget] = useState<string | null>(null);

  const accept =
    kind === "video"
      ? "video/*"
      : kind === "transcript"
        ? ".txt,.md,.srt,.vtt,.pdf,.doc,.docx"
        : undefined;

  return (
    <div className="rounded-md border border-dashed border-border bg-muted/40 p-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
          {icon}
          {label} ({assets.length})
        </div>
        <button
          onClick={onUpload}
          className="inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline"
        >
          <Upload className="h-3 w-3" /> Upload
        </button>
      </div>
      <ul className="mt-1.5 space-y-1">
        {assets.map((a) => (
          <li key={a.id} className="group flex items-center gap-1.5">
            <span className="min-w-0 flex-1 truncate text-[11.5px] text-foreground" title={a.file_name}>
              {a.file_name}
            </span>
            <DownloadButton asset={a} />
            {a.kind !== "video_link" ? (
              <button
                onClick={() => {
                  setReplaceTarget(a.id);
                  replaceInputRef.current?.click();
                }}
                className="text-muted-foreground transition hover:text-primary"
                title="Replace file"
              >
                <ReplaceIcon className="h-3 w-3" />
              </button>
            ) : null}
            <button
              onClick={() => {
                if (confirm(`Remove "${a.file_name}"?`)) onDelete(a.id);
              }}
              className="text-muted-foreground transition hover:text-destructive"
              title="Remove"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          </li>
        ))}
        {assets.length === 0 ? (
          <li className="text-[11px] text-muted-foreground">No files yet</li>
        ) : null}
      </ul>
      <input
        ref={replaceInputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f && replaceTarget) onReplace(replaceTarget, f);
          setReplaceTarget(null);
          e.target.value = "";
        }}
      />
      {extra}
    </div>
  );
}

function DownloadButton({ asset }: { asset: SectionAssetRow }) {
  const handle = async () => {
    if (asset.external_url) {
      window.open(asset.external_url, "_blank");
      return;
    }
    if (asset.storage_bucket && asset.storage_path) {
      const url = await getAssetSignedUrl(asset.storage_bucket, asset.storage_path);
      if (url) window.open(url, "_blank");
      else toast.error("Could not generate link");
    }
  };
  return (
    <button onClick={handle} className="text-muted-foreground hover:text-foreground" title="Open">
      <Download className="h-3 w-3" />
    </button>
  );
}
