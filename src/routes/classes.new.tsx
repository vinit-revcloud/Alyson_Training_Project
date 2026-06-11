import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  GraduationCap,
  Tags,
  Layers,
  PlayCircle,
  FileText,
  ClipboardCheck,
  Plus,
  X,
  Upload,
  Trash2,
  Check,
  ChevronRight,
  ChevronLeft,
  ChevronUp,
  ChevronDown,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  Shuffle,
  Send,
  Link2,
  FileType,
  GripVertical,
} from "lucide-react";
import { createClass, type SectionInput, type Level, type ClassStatus } from "@/lib/classes-api";
import { finalizeClassCreation } from "@/lib/class-finalize.functions";
import { formatErrorMessage } from "@/lib/format-error";
import {
  validateClassForDraft,
  validateClassForPublish,
  normalizeTestConfig,
  validateAISyllabusDraft,
} from "@/lib/class-create.validation";
import { DEPARTMENTS } from "@/lib/departments";
import { AIClassAssistant } from "@/components/admin/AIClassAssistant";
import type { ClassSuggestion } from "@/lib/class-ai.functions";

export const Route = createFileRoute("/classes/new")({
  head: () => ({ meta: [{ title: "Create class — Alyson Training Project" }] }),
  component: NewClassWizard,
});

interface SectionDraft {
  id: string;
  title: string;
  description: string;
  durationMin: number;
  objectives: string;
  videoFile: File | null;
  videoLink: string;
  documents: File[];
  transcripts: File[];
}

interface FinalTestDraft {
  difficulty: Level;
  mcqCount: number;
  subjectiveCount: number;
  passMark: number;
  retest: boolean;
}

const STEPS = [
  { key: "class", title: "Create Class", icon: GraduationCap, hint: "Name, course and level" },
  { key: "topics", title: "Assign Topics", icon: Tags, hint: "Tag the knowledge area" },
  { key: "sections", title: "Create Sections", icon: Layers, hint: "Break class into lessons" },
  { key: "videos", title: "Upload Videos", icon: PlayCircle, hint: "File or link per section" },
  { key: "docs", title: "Documents & Transcripts", icon: FileText, hint: "Knowledge base material" },
  { key: "test", title: "Assign Final Test", icon: ClipboardCheck, hint: "Calibrate the assessment" },
  { key: "review", title: "Review & Create", icon: CheckCircle2, hint: "Confirm everything before publishing" },
] as const;

const newSection = (i: number): SectionDraft => ({
  id: `sec-${Date.now()}-${i}`,
  title: i === 0 ? "Introduction" : `Section ${i + 1}`,
  description: "",
  durationMin: 15,
  objectives: "",
  videoFile: null,
  videoLink: "",
  documents: [],
  transcripts: [],
});

interface Issue { step: number; message: string }

function NewClassWizard() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const finalizeClass = useServerFn(finalizeClassCreation);
  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [finalizing, setFinalizing] = useState(false);

  const [className, setClassName] = useState("");
  const [parentCourse, setParentCourse] = useState("");
  const [level, setLevel] = useState<Level>("Beginner");
  const [audience, setAudience] = useState("Data Scientist");
  const [summary, setSummary] = useState("");

  const [topics, setTopics] = useState<string[]>([]);
  const [topicDraft, setTopicDraft] = useState("");

  const [sections, setSections] = useState<SectionDraft[]>([newSection(0)]);

  const [test, setTest] = useState<FinalTestDraft>({
    difficulty: "Beginner",
    mcqCount: 15,
    subjectiveCount: 5,
    passMark: 75,
    retest: true,
  });

  const wizardInput = useMemo(
    () => ({
      name: className,
      parentCourse,
      topics,
      sections,
      test: normalizeTestConfig(test),
    }),
    [className, parentCourse, topics, sections, test],
  );

  const allIssues = useMemo(
    () => validateClassForPublish(wizardInput),
    [wizardInput],
  );
  const stepIssues = (s: number) => allIssues.filter((i) => i.step === s);
  const canAdvance = stepIssues(step).length === 0;

  const updateSection = (id: string, patch: Partial<SectionDraft>) =>
    setSections((s) => s.map((x) => (x.id === id ? { ...x, ...patch } : x)));

  const addSection = () => setSections((s) => [...s, newSection(s.length)]);
  const removeSection = (id: string) => setSections((s) => s.filter((x) => x.id !== id));
  const move = (id: string, dir: -1 | 1) => {
    setSections((s) => {
      const i = s.findIndex((x) => x.id === id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= s.length) return s;
      const next = [...s];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  };

  const buildInput = (status: ClassStatus) => ({
    name: className || "Untitled class",
    parentCourse,
    level,
    audience,
    summary,
    topics,
    status,
    test,
    sections: sections.map<SectionInput>((s, idx) => ({
      title: s.title,
      description: s.description,
      durationMin: s.durationMin,
      objectives: s.objectives,
      position: idx,
      videoFile: s.videoFile,
      videoLink: s.videoLink.trim() || undefined,
      documents: s.documents,
      transcripts: s.transcripts,
    })),
  });

  const persist = async (status: ClassStatus) => {
    const normalizedTest = normalizeTestConfig(test);

    if (status === "draft") {
      const draftIssues = validateClassForDraft(className);
      if (draftIssues.length) {
        toast.error("Cannot save draft", { description: draftIssues[0].message });
        setStep(draftIssues[0].step);
        return false;
      }
    } else {
      const issues = validateClassForPublish({ ...wizardInput, test: normalizedTest });
      if (issues.length) {
        toast.error("Cannot save yet", { description: issues[0].message });
        setStep(issues[0].step);
        return false;
      }
    }

    setSubmitting(true);
    setFinalizing(false);
    try {
      const { classId, courseId } = await createClass({
        ...buildInput(status),
        test: { ...normalizedTest, retest: test.retest },
      });

      if (status === "draft") {
        await qc.invalidateQueries({ queryKey: ["courses"] });
        await qc.invalidateQueries({ queryKey: ["classes"] });
        return true;
      }

      setFinalizing(true);
      const aiResult = await finalizeClass({
        data: {
          classId,
          courseId,
          audience,
          status,
          test: {
            difficulty: normalizedTest.difficulty,
            mcqCount: normalizedTest.mcqCount,
            subjectiveCount: normalizedTest.subjectiveCount,
            passMark: normalizedTest.passMark,
          },
          generateSectionQuestions: true,
          generateAssessment: status === "published",
        },
      });
      await qc.invalidateQueries({ queryKey: ["courses"] });
      await qc.invalidateQueries({ queryKey: ["classes"] });
      if (aiResult.sectionQuestionCount > 0 || aiResult.assessmentQuestionCount > 0) {
        toast.message("AI knowledge base processed", {
          description: `${aiResult.sectionQuestionCount} section questions · ${aiResult.assessmentQuestionCount} final test questions`,
        });
      }
      if (aiResult.warnings?.length) {
        toast.warning("Class saved with AI warnings", {
          description: aiResult.warnings[0],
        });
      }
      return true;
    } catch (e) {
      toast.error("Could not save class", {
        description: formatErrorMessage(e),
      });
      void qc.invalidateQueries({ queryKey: ["courses"] });
      void qc.invalidateQueries({ queryKey: ["classes"] });
      return false;
    } finally {
      setSubmitting(false);
      setFinalizing(false);
    }
  };

  const saveDraft = async () => {
    const ok = await persist("draft");
    if (ok) toast.success("Saved as draft");
  };

  const submitForApproval = async () => {
    if (allIssues.length) {
      toast.error("Cannot submit yet", { description: `${allIssues.length} issue(s) to resolve.` });
      setStep(allIssues[0].step);
      return;
    }
    const ok = await persist("in-review");
    if (ok) {
      toast.success("Submitted for approval");
      navigate({ to: "/assessments" });
    }
  };

  const publishNow = async () => {
    if (allIssues.length) {
      toast.error("Cannot publish yet", { description: `${allIssues.length} issue(s) to resolve.` });
      setStep(allIssues[0].step);
      return;
    }
    const ok = await persist("published");
    if (ok) {
      toast.success("Class published", { description: `"${className}" is live.` });
      navigate({ to: "/courses" });
    }
  };

  const launchRandomizer = () => {
    navigate({
      to: "/assessments/builder",
      search: {
        className,
        topics: topics.join(","),
        difficulty: test.difficulty,
        mcq: test.mcqCount,
        subjective: test.subjectiveCount,
        passMark: test.passMark,
      } as never,
    });
  };

  const handleNext = () => {
    if (!canAdvance) {
      toast.error("Resolve issues to continue", { description: stepIssues(step)[0]?.message });
      return;
    }
    setStep((s) => Math.min(STEPS.length - 1, s + 1));
  };

  const applyAISuggestion = (s: ClassSuggestion) => {
    const aiIssues = validateAISyllabusDraft(s);
    if (aiIssues.length) {
      toast.warning("AI draft applied with gaps", {
        description: `${aiIssues[0].message} — fill in the wizard before publishing.`,
      });
    }
    if (s.title) setClassName(s.title);
    if (s.description) setSummary(s.description);
    if (s.level) setLevel(s.level);
    if (s.audience) setAudience(s.audience);
    if (s.parentCourse) setParentCourse(s.parentCourse);
    if (s.topics.length) setTopics(s.topics);
    if (s.sections.length) {
      setSections(
        s.sections.map((sec, i) => ({
          id: `sec-${Date.now()}-${i}`,
          title: sec.title,
          description: sec.description,
          durationMin: sec.durationMin,
          objectives: sec.objectives ?? "",
          videoFile: null,
          videoLink: "",
          documents: [],
          transcripts: [],
        })),
      );
    }
    if (s.level) setTest((t) => ({ ...t, difficulty: s.level! }));
    setStep(0);
  };

  return (
    <AdminLayout
      title="Create new class"
      subtitle="Follow the guided flow to publish a class to the Trainee Panel"
      actions={
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={saveDraft}
            disabled={submitting}
            className="h-9 gap-1.5 rounded-lg border-border text-[12.5px]"
          >
            <Check className="h-3.5 w-3.5" /> Save draft
          </Button>
          <Link to="/courses">
            <Button variant="ghost" className="h-9 rounded-lg text-[12.5px]">Cancel</Button>
          </Link>
        </div>
      }
    >
      <div className="mb-6">
        <AIClassAssistant onApply={applyAISuggestion} />
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[260px_1fr]">
        <Card className="h-fit rounded-xl border-border bg-card p-3 shadow-soft lg:sticky lg:top-20">
          <div className="px-2 pb-2 pt-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Workflow
          </div>
          <ul className="space-y-0.5">
            {STEPS.map((s, i) => {
              const Icon = s.icon;
              const done = i < step && stepIssues(i).length === 0;
              const active = i === step;
              const hasIssues = stepIssues(i).length > 0;
              return (
                <li key={s.key}>
                  <button
                    onClick={() => setStep(i)}
                    className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition ${
                      active
                        ? "bg-accent text-foreground"
                        : "text-muted-foreground hover:bg-card/60 hover:text-foreground"
                    }`}
                  >
                    <span
                      className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md border ${
                        done
                          ? "border-success/30 bg-success/10 text-success"
                          : active
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-border bg-muted text-muted-foreground"
                      }`}
                    >
                      {done ? <Check className="h-3.5 w-3.5" /> : <Icon className="h-3.5 w-3.5" strokeWidth={1.75} />}
                    </span>
                    <div className="min-w-0 flex-1 leading-tight">
                      <div className="text-[12.5px] font-semibold">{s.title}</div>
                      <div className="truncate text-[10.5px] text-muted-foreground">{s.hint}</div>
                    </div>
                    {hasIssues && !active ? (
                      <AlertCircle className="h-3.5 w-3.5 text-destructive" />
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ul>

          <div className="mt-3 rounded-lg border border-border bg-background p-2.5">
            {allIssues.length === 0 ? (
              <div className="flex items-center gap-1.5 text-[11px] text-success">
                <CheckCircle2 className="h-3.5 w-3.5" /> Ready to publish
              </div>
            ) : (
              <>
                <div className="flex items-center gap-1.5 text-[11px] font-semibold text-destructive">
                  <AlertCircle className="h-3.5 w-3.5" /> {allIssues.length} issue{allIssues.length === 1 ? "" : "s"}
                </div>
                <ul className="mt-1.5 space-y-0.5 text-[10.5px] text-muted-foreground">
                  {allIssues.slice(0, 3).map((i, k) => (<li key={k}>· {i.message}</li>))}
                  {allIssues.length > 3 ? <li>· +{allIssues.length - 3} more</li> : null}
                </ul>
              </>
            )}
          </div>
        </Card>

        <div className="space-y-4">
          <Card className="rounded-xl border-border bg-card p-6 shadow-soft">
            <div className="mb-5 flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
              Step {step + 1} of {STEPS.length}
              <span className="text-border">·</span>
              <span className="text-foreground">{STEPS[step].title}</span>
            </div>

            {step === 0 ? (
              <StepClass {...{ className, setClassName, parentCourse, setParentCourse, level, setLevel, audience, setAudience, summary, setSummary }} />
            ) : null}
            {step === 1 ? (
              <StepTopics {...{ topics, setTopics, topicDraft, setTopicDraft }} />
            ) : null}
            {step === 2 ? (
              <StepSections sections={sections} addSection={addSection} updateSection={updateSection} removeSection={removeSection} move={move} />
            ) : null}
            {step === 3 ? <StepVideos sections={sections} updateSection={updateSection} /> : null}
            {step === 4 ? <StepDocs sections={sections} updateSection={updateSection} /> : null}
            {step === 5 ? (
              <StepTest test={test} setTest={setTest} className={className} topics={topics} sectionCount={sections.length} onLaunchRandomizer={launchRandomizer} />
            ) : null}
            {step === 6 ? (
              <StepReview
                className={className}
                parentCourse={parentCourse}
                level={level}
                audience={audience}
                summary={summary}
                topics={topics}
                setTopics={setTopics}
                sections={sections}
                removeSection={removeSection}
                updateSection={updateSection}
                test={test}
                goTo={setStep}
                issues={allIssues}
              />
            ) : null}
          </Card>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <Button variant="outline" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0} className="h-10 gap-2 rounded-lg border-border">
              <ChevronLeft className="h-4 w-4" /> Back
            </Button>
            <div className="flex items-center gap-2">
              {step === STEPS.length - 1 ? (
                <>
                  <Button variant="outline" onClick={submitForApproval} disabled={submitting} className="h-10 gap-2 rounded-lg border-border">
                    <Send className="h-4 w-4" /> Submit for approval
                  </Button>
                  <Button onClick={publishNow} disabled={allIssues.length > 0 || submitting} className="h-10 gap-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary-glow">
                    <Sparkles className="h-4 w-4" />{" "}
                    {finalizing ? "Generating tests…" : submitting ? "Saving…" : "Publish now"}
                  </Button>
                </>
              ) : (
                <Button onClick={handleNext} className="h-10 gap-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary-glow">
                  Continue <ChevronRight className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between">
        <label className="text-[12px] font-semibold text-foreground">{label}</label>
        {hint ? <span className="text-[10.5px] text-muted-foreground">{hint}</span> : null}
      </div>
      {children}
    </div>
  );
}

function StepClass(p: {
  className: string; setClassName: (v: string) => void;
  parentCourse: string; setParentCourse: (v: string) => void;
  level: Level; setLevel: (v: Level) => void;
  audience: string; setAudience: (v: string) => void;
  summary: string; setSummary: (v: string) => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
      <Field label="Class name" hint="e.g. Class One — Foundations">
        <Input value={p.className} onChange={(e) => p.setClassName(e.target.value)} placeholder="Class One — Foundations" className="h-10 rounded-lg border-border bg-background" />
      </Field>
      <Field label="Parent course" hint="Will be created if it doesn't exist">
        <Input value={p.parentCourse} onChange={(e) => p.setParentCourse(e.target.value)} placeholder="Data Science Foundations" className="h-10 rounded-lg border-border bg-background" />
      </Field>
      <Field label="Difficulty">
        <Select value={p.level} onValueChange={(v) => p.setLevel(v as Level)}>
          <SelectTrigger className="h-10 rounded-lg border-border bg-background"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="Beginner">Beginner</SelectItem>
            <SelectItem value="Intermediate">Intermediate</SelectItem>
            <SelectItem value="Advanced">Advanced</SelectItem>
          </SelectContent>
        </Select>
      </Field>
      <Field label="Visible to" hint="Role-based assignment">
        <Select value={p.audience} onValueChange={p.setAudience}>
          <SelectTrigger className="h-10 rounded-lg border-border bg-background"><SelectValue /></SelectTrigger>
          <SelectContent>
            {DEPARTMENTS.map((d) => (
              <SelectItem key={d} value={d}>
                {d}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      <div className="md:col-span-2">
        <Field label="Short summary" hint="Shown to trainees on enrolment">
          <Textarea value={p.summary} onChange={(e) => p.setSummary(e.target.value)} placeholder="A concise description of what the trainee will learn." className="min-h-24 rounded-lg border-border bg-background text-[13px] leading-relaxed" />
        </Field>
      </div>
    </div>
  );
}

function StepTopics(p: { topics: string[]; setTopics: (v: string[]) => void; topicDraft: string; setTopicDraft: (v: string) => void }) {
  const add = () => {
    const t = p.topicDraft.trim();
    if (!t || p.topics.includes(t)) return;
    p.setTopics([...p.topics, t]);
    p.setTopicDraft("");
  };
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const reorder = (from: number, to: number) => {
    if (from === to || to < 0 || to >= p.topics.length) return;
    const next = p.topics.slice();
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    p.setTopics(next);
  };
  const suggestions = ["EDA", "SQL", "ML Basics", "Visualization", "A/B Testing", "Deep Learning"];
  return (
    <div className="space-y-5">
      <Field label="Topics" hint="Drag chips to reorder · used to calibrate the Question Randomizer">
        <div className="flex min-h-12 flex-wrap gap-1.5 rounded-lg border border-border bg-background p-2.5">
          {p.topics.map((t, i) => (
            <div
              key={t}
              draggable
              onDragStart={() => setDragIndex(i)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                if (dragIndex !== null) reorder(dragIndex, i);
                setDragIndex(null);
              }}
              onDragEnd={() => setDragIndex(null)}
              className={`inline-flex cursor-grab items-center gap-1 rounded-md border border-primary/30 bg-accent px-2 py-0.5 text-[11px] font-medium text-primary transition active:cursor-grabbing ${
                dragIndex === i ? "opacity-50" : ""
              }`}
              title="Drag to reorder"
            >
              <GripVertical className="h-3 w-3 text-primary/60" />
              {t}
              <button onClick={() => p.setTopics(p.topics.filter((x) => x !== t))} className="hover:text-destructive" aria-label={`Remove ${t}`}>
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
          <input
            value={p.topicDraft}
            onChange={(e) => p.setTopicDraft(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), add())}
            placeholder={p.topics.length ? "Add another…" : "Type a topic and press Enter"}
            className="min-w-32 flex-1 bg-transparent text-[13px] outline-none placeholder:text-muted-foreground"
          />
        </div>
      </Field>
      <div>
        <div className="mb-1.5 text-[11px] font-medium text-muted-foreground">Suggestions</div>
        <div className="flex flex-wrap gap-1.5">
          {suggestions.filter((s) => !p.topics.includes(s)).map((s) => (
            <button key={s} onClick={() => p.setTopics([...p.topics, s])} className="rounded-md border border-dashed border-border bg-muted px-2 py-1 text-[11px] font-medium text-muted-foreground transition hover:border-primary/40 hover:bg-accent hover:text-primary">
              + {s}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function StepSections(p: {
  sections: SectionDraft[];
  addSection: () => void;
  updateSection: (id: string, patch: Partial<SectionDraft>) => void;
  removeSection: (id: string) => void;
  move: (id: string, dir: -1 | 1) => void;
}) {
  return (
    <div className="space-y-3">
      {p.sections.map((s, i) => {
        const titleMissing = !s.title.trim();
        const durMissing = s.durationMin <= 0;
        return (
          <div key={s.id} className="rounded-lg border border-border bg-background p-4">
            <div className="mb-3 flex items-center gap-2">
              <div className="flex flex-col">
                <button onClick={() => p.move(s.id, -1)} disabled={i === 0} className="rounded-sm p-0.5 text-muted-foreground transition hover:bg-accent hover:text-foreground disabled:opacity-30">
                  <ChevronUp className="h-3 w-3" />
                </button>
                <button onClick={() => p.move(s.id, 1)} disabled={i === p.sections.length - 1} className="rounded-sm p-0.5 text-muted-foreground transition hover:bg-accent hover:text-foreground disabled:opacity-30">
                  <ChevronDown className="h-3 w-3" />
                </button>
              </div>
              <span className="flex h-6 w-6 items-center justify-center rounded-md bg-accent text-[11px] font-bold text-primary">{i + 1}</span>
              <Input value={s.title} onChange={(e) => p.updateSection(s.id, { title: e.target.value })} placeholder="Section title" className={`h-9 flex-1 rounded-md bg-card text-[13px] font-medium ${titleMissing ? "border-destructive/50" : "border-border"}`} />
              <Button size="icon" variant="ghost" onClick={() => p.removeSection(s.id)} className="h-8 w-8 text-muted-foreground hover:text-destructive">
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_140px]">
              <Field label="Description">
                <Textarea value={s.description} onChange={(e) => p.updateSection(s.id, { description: e.target.value })} placeholder="What will the trainee learn?" className="min-h-16 rounded-md border-border bg-card text-[12.5px]" />
              </Field>
              <Field label="Duration (min)">
                <Input type="number" min={1} value={s.durationMin} onChange={(e) => p.updateSection(s.id, { durationMin: Number(e.target.value) })} className={`h-10 rounded-md bg-card ${durMissing ? "border-destructive/50" : "border-border"}`} />
              </Field>
            </div>
            <div className="mt-3">
              <Field label="Learning objectives" hint="One per line">
                <Textarea value={s.objectives} onChange={(e) => p.updateSection(s.id, { objectives: e.target.value })} placeholder={"Explain mean vs median\nApply pandas groupby"} className="min-h-16 rounded-md border-border bg-card text-[12.5px]" />
              </Field>
            </div>
          </div>
        );
      })}
      <Button variant="outline" onClick={p.addSection} className="h-10 w-full gap-2 rounded-lg border-dashed border-border text-[12.5px]">
        <Plus className="h-4 w-4" /> Add section
      </Button>
    </div>
  );
}

function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function StepVideos(p: { sections: SectionDraft[]; updateSection: (id: string, patch: Partial<SectionDraft>) => void }) {
  return (
    <div className="space-y-3">
      <p className="text-[12.5px] text-muted-foreground">
        For each section, upload a video file or paste a hosted link (YouTube, Vimeo, S3, etc.).
      </p>
      {p.sections.map((s, i) => (
        <div key={s.id} className="rounded-lg border border-border bg-background p-4">
          <div className="mb-3 flex items-center gap-3">
            <span className="flex h-8 w-8 items-center justify-center rounded-md bg-accent text-[12px] font-bold text-primary">{i + 1}</span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[13px] font-semibold text-foreground">{s.title}</div>
              {s.videoFile ? (
                <div className="mt-0.5 inline-flex items-center gap-1.5 text-[11px] text-success">
                  <CheckCircle2 className="h-3 w-3" /> {s.videoFile.name} · {formatBytes(s.videoFile.size)}
                </div>
              ) : s.videoLink ? (
                <div className="mt-0.5 inline-flex items-center gap-1.5 text-[11px] text-success">
                  <Link2 className="h-3 w-3" /> Linked
                </div>
              ) : (
                <div className="mt-0.5 inline-flex items-center gap-1.5 text-[11px] text-destructive">
                  <AlertCircle className="h-3 w-3" /> Video required
                </div>
              )}
            </div>
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <label className="flex h-24 cursor-pointer flex-col items-center justify-center gap-1.5 rounded-md border border-dashed border-border bg-card text-[12px] text-muted-foreground transition hover:border-primary/40 hover:text-primary">
              <Upload className="h-4 w-4" />
              <span>{s.videoFile ? "Replace file" : "Upload from device"}</span>
              <input
                type="file"
                accept="video/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) p.updateSection(s.id, { videoFile: f, videoLink: "" });
                }}
              />
            </label>
            <div className="rounded-md border border-border bg-card p-2.5">
              <div className="mb-1 inline-flex items-center gap-1 text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">
                <Link2 className="h-3 w-3" /> Or paste a video URL
              </div>
              <Input
                value={s.videoLink}
                onChange={(e) => p.updateSection(s.id, { videoLink: e.target.value, videoFile: null })}
                placeholder="https://youtube.com/watch?v=…"
                className="h-9 rounded-md border-border bg-background text-[12.5px]"
              />
            </div>
          </div>
          {s.videoFile ? (
            <Button size="sm" variant="ghost" onClick={() => p.updateSection(s.id, { videoFile: null })} className="mt-2 h-7 text-[11.5px] text-muted-foreground hover:text-destructive">
              <Trash2 className="mr-1 h-3 w-3" /> Remove file
            </Button>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function FileList({ files, onRemove }: { files: File[]; onRemove: (i: number) => void }) {
  if (files.length === 0) return null;
  return (
    <div className="mt-2 space-y-1.5">
      {files.map((f, i) => (
        <div key={`${f.name}-${i}`} className="flex items-center gap-2 rounded-md border border-border bg-card px-2.5 py-1.5 text-[12px]">
          <FileType className="h-3.5 w-3.5 text-primary" />
          <span className="flex-1 truncate font-medium text-foreground">{f.name}</span>
          <span className="text-[10.5px] text-muted-foreground">{formatBytes(f.size)}</span>
          <button onClick={() => onRemove(i)} className="text-muted-foreground hover:text-destructive">
            <X className="h-3 w-3" />
          </button>
        </div>
      ))}
    </div>
  );
}

function StepDocs(p: { sections: SectionDraft[]; updateSection: (id: string, patch: Partial<SectionDraft>) => void }) {
  return (
    <div className="space-y-3">
      <p className="text-[12.5px] text-muted-foreground">
        Attach study material (PDF, DOCX, PPT, TXT). Optionally add a transcript file per section.
      </p>
      {p.sections.map((s, i) => (
        <div key={s.id} className="rounded-lg border border-border bg-background p-4">
          <div className="mb-3 flex items-center gap-3">
            <span className="flex h-8 w-8 items-center justify-center rounded-md bg-accent text-[12px] font-bold text-primary">{i + 1}</span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[13px] font-semibold text-foreground">{s.title}</div>
              <div className={`text-[11px] ${s.documents.length ? "text-muted-foreground" : "text-destructive"}`}>
                {s.documents.length} document{s.documents.length === 1 ? "" : "s"}
                {s.documents.length === 0 ? " · at least one required" : ""}
                {s.transcripts.length ? ` · ${s.transcripts.length} transcript${s.transcripts.length === 1 ? "" : "s"}` : ""}
              </div>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div>
              <label className="flex h-24 cursor-pointer flex-col items-center justify-center gap-1.5 rounded-md border border-dashed border-border bg-card text-[12px] text-muted-foreground transition hover:border-primary/40 hover:text-primary">
                <Upload className="h-4 w-4" />
                <span>Add documents (PDF, DOCX, PPT, TXT)</span>
                <input
                  type="file"
                  accept=".pdf,.doc,.docx,.ppt,.pptx,.txt,.md"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    const files = Array.from(e.target.files ?? []);
                    if (files.length) p.updateSection(s.id, { documents: [...s.documents, ...files] });
                  }}
                />
              </label>
              <FileList files={s.documents} onRemove={(idx) => p.updateSection(s.id, { documents: s.documents.filter((_, i2) => i2 !== idx) })} />
            </div>
            <div>
              <label className="flex h-24 cursor-pointer flex-col items-center justify-center gap-1.5 rounded-md border border-dashed border-border bg-card text-[12px] text-muted-foreground transition hover:border-primary/40 hover:text-primary">
                <Upload className="h-4 w-4" />
                <span>Add transcripts (.txt, .srt, .vtt)</span>
                <input
                  type="file"
                  accept=".txt,.srt,.vtt,.md"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    const files = Array.from(e.target.files ?? []);
                    if (files.length) p.updateSection(s.id, { transcripts: [...s.transcripts, ...files] });
                  }}
                />
              </label>
              <FileList files={s.transcripts} onRemove={(idx) => p.updateSection(s.id, { transcripts: s.transcripts.filter((_, i2) => i2 !== idx) })} />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function StepTest(p: {
  test: FinalTestDraft;
  setTest: (v: FinalTestDraft) => void;
  className: string;
  topics: string[];
  sectionCount: number;
  onLaunchRandomizer: () => void;
}) {
  const update = (patch: Partial<FinalTestDraft>) => p.setTest({ ...p.test, ...patch });
  const total = p.test.mcqCount + p.test.subjectiveCount;
  return (
    <div className="space-y-5">
      <div className="rounded-lg border border-border bg-accent/40 p-4">
        <div className="flex items-center gap-2 text-[12px] font-semibold text-foreground">
          <Sparkles className="h-4 w-4 text-primary" />
          Auto-generated from {p.sectionCount} section{p.sectionCount === 1 ? "" : "s"} · {p.topics.length} topic{p.topics.length === 1 ? "" : "s"}
        </div>
        <p className="mt-1 text-[11.5px] text-muted-foreground">
          The Question Randomizer uses uploaded videos, transcripts and documents to draft a calibrated test.
        </p>
      </div>
      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
        <Field label="Difficulty">
          <Select value={p.test.difficulty} onValueChange={(v) => update({ difficulty: v as Level })}>
            <SelectTrigger className="h-10 rounded-lg border-border bg-background"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="Beginner">Beginner</SelectItem>
              <SelectItem value="Intermediate">Intermediate</SelectItem>
              <SelectItem value="Advanced">Advanced</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field label="Pass mark (%)">
          <Input type="number" min={0} max={100} value={p.test.passMark} onChange={(e) => update({ passMark: Number(e.target.value) })} className="h-10 rounded-lg border-border bg-background" />
        </Field>
        <Field label="MCQ questions">
          <Input type="number" min={0} value={p.test.mcqCount} onChange={(e) => update({ mcqCount: Number(e.target.value) })} className="h-10 rounded-lg border-border bg-background" />
        </Field>
        <Field label="Subjective questions">
          <Input type="number" min={0} value={p.test.subjectiveCount} onChange={(e) => update({ subjectiveCount: Number(e.target.value) })} className="h-10 rounded-lg border-border bg-background" />
        </Field>
      </div>
      <label className="flex items-start gap-3 rounded-lg border border-border bg-background p-4">
        <input type="checkbox" checked={p.test.retest} onChange={(e) => update({ retest: e.target.checked })} className="mt-0.5 h-4 w-4 accent-primary" />
        <div>
          <div className="text-[12.5px] font-semibold text-foreground">Allow re-test on fail</div>
          <div className="text-[11px] text-muted-foreground">Failing trainees get a regenerated question set from the same knowledge base.</div>
        </div>
      </label>
      <div className="rounded-lg border border-border bg-card p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">Summary</div>
            <div className="mt-2 grid grid-cols-2 gap-3 text-[12.5px] md:grid-cols-4">
              <Stat label="Class" value={p.className || "Untitled"} />
              <Stat label="Sections" value={String(p.sectionCount)} />
              <Stat label="Questions" value={String(total)} />
              <Stat label="Pass mark" value={`${p.test.passMark}%`} />
            </div>
          </div>
          <Button onClick={p.onLaunchRandomizer} className="h-10 shrink-0 gap-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary-glow">
            <Shuffle className="h-4 w-4" /> Launch Randomizer
          </Button>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10.5px] uppercase tracking-[0.12em] text-muted-foreground">{label}</div>
      <div className="mt-0.5 truncate font-semibold text-foreground">{value}</div>
    </div>
  );
}

function StepReview(p: {
  className: string;
  parentCourse: string;
  level: Level;
  audience: string;
  summary: string;
  topics: string[];
  setTopics: (v: string[]) => void;
  sections: SectionDraft[];
  removeSection: (id: string) => void;
  updateSection: (id: string, patch: Partial<SectionDraft>) => void;
  test: FinalTestDraft;
  goTo: (step: number) => void;
  issues: Issue[];
}) {
  const totalDuration = p.sections.reduce((sum, s) => sum + (s.durationMin || 0), 0);
  const totalDocs = p.sections.reduce((n, s) => n + s.documents.length, 0);
  const totalTranscripts = p.sections.reduce((n, s) => n + s.transcripts.length, 0);
  const totalQuestions = p.test.mcqCount + p.test.subjectiveCount;

  return (
    <div className="space-y-5">
      <div className="rounded-lg border border-border bg-accent/40 p-4">
        <div className="flex items-center gap-2 text-[12px] font-semibold text-foreground">
          <CheckCircle2 className="h-4 w-4 text-primary" /> Final review
        </div>
        <p className="mt-1 text-[11.5px] text-muted-foreground">
          Confirm everything below. Use the edit buttons to jump back, or delete individual items before publishing.
        </p>
      </div>

      {p.issues.length > 0 ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3">
          <div className="flex items-center gap-1.5 text-[12px] font-semibold text-destructive">
            <AlertCircle className="h-3.5 w-3.5" /> {p.issues.length} issue{p.issues.length === 1 ? "" : "s"} to resolve
          </div>
          <ul className="mt-1.5 space-y-0.5 pl-5 text-[11.5px] text-muted-foreground">
            {p.issues.slice(0, 5).map((i, k) => (
              <li key={k} className="list-disc">{i.message}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {/* Class details */}
      <ReviewBlock title="Class details" onEdit={() => p.goTo(0)}>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <ReviewRow label="Title" value={p.className || "—"} />
          <ReviewRow label="Parent course" value={p.parentCourse || "—"} />
          <ReviewRow label="Difficulty" value={p.level} />
          <ReviewRow label="Visible to" value={p.audience} />
          <div className="md:col-span-2">
            <ReviewRow label="Description" value={p.summary || "—"} multiline />
          </div>
        </div>
      </ReviewBlock>

      {/* Topics */}
      <ReviewBlock title={`Topics (${p.topics.length})`} onEdit={() => p.goTo(1)}>
        {p.topics.length === 0 ? (
          <div className="text-[12px] text-muted-foreground">No topics yet.</div>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {p.topics.map((t) => (
              <Badge key={t} variant="outline" className="gap-1 rounded-md border-primary/30 bg-accent text-[11px] font-medium text-primary">
                {t}
                <button
                  onClick={() => p.setTopics(p.topics.filter((x) => x !== t))}
                  className="hover:text-destructive"
                  aria-label={`Remove ${t}`}
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
          </div>
        )}
      </ReviewBlock>

      {/* Sections & resources */}
      <ReviewBlock
        title={`Sections & resources (${p.sections.length})`}
        onEdit={() => p.goTo(2)}
        meta={`${totalDuration}m total · ${totalDocs} doc${totalDocs === 1 ? "" : "s"} · ${totalTranscripts} transcript${totalTranscripts === 1 ? "" : "s"}`}
      >
        {p.sections.length === 0 ? (
          <div className="text-[12px] text-muted-foreground">No sections yet.</div>
        ) : (
          <ul className="space-y-2">
            {p.sections.map((s, i) => {
              const hasVideo = !!s.videoFile || !!s.videoLink.trim();
              return (
                <li key={s.id} className="rounded-lg border border-border bg-background p-3">
                  <div className="flex items-start gap-3">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-accent text-[11px] font-bold text-primary">
                      {i + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-baseline gap-2">
                        <div className="text-[13px] font-semibold text-foreground">{s.title || `Section ${i + 1}`}</div>
                        <span className="text-[10.5px] text-muted-foreground">{s.durationMin}m</span>
                      </div>
                      {s.description ? (
                        <p className="mt-0.5 text-[11.5px] text-muted-foreground">{s.description}</p>
                      ) : null}
                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[10.5px]">
                        <span className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 ${hasVideo ? "border-success/30 bg-success/5 text-success" : "border-destructive/30 bg-destructive/5 text-destructive"}`}>
                          <PlayCircle className="h-3 w-3" /> {hasVideo ? (s.videoFile ? "Video file" : "Video link") : "No video"}
                        </span>
                        <span className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 ${s.documents.length ? "border-border bg-card text-muted-foreground" : "border-destructive/30 bg-destructive/5 text-destructive"}`}>
                          <FileText className="h-3 w-3" /> {s.documents.length} doc{s.documents.length === 1 ? "" : "s"}
                        </span>
                        {s.transcripts.length ? (
                          <span className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-1.5 py-0.5 text-muted-foreground">
                            <FileType className="h-3 w-3" /> {s.transcripts.length} transcript{s.transcripts.length === 1 ? "" : "s"}
                          </span>
                        ) : null}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <Button size="sm" variant="ghost" onClick={() => p.goTo(2)} className="h-7 gap-1 px-2 text-[11px]">
                        Edit
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => p.removeSection(s.id)}
                        className="h-7 w-7 text-muted-foreground hover:text-destructive"
                        aria-label="Remove section"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </ReviewBlock>

      {/* Final test */}
      <ReviewBlock title="Final test" onEdit={() => p.goTo(5)}>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <ReviewRow label="Difficulty" value={p.test.difficulty} />
          <ReviewRow label="Questions" value={`${totalQuestions} (${p.test.mcqCount} MCQ · ${p.test.subjectiveCount} subj.)`} />
          <ReviewRow label="Pass mark" value={`${p.test.passMark}%`} />
          <ReviewRow label="Re-test on fail" value={p.test.retest ? "Enabled" : "Disabled"} />
        </div>
      </ReviewBlock>
    </div>
  );
}

function ReviewBlock({
  title,
  meta,
  onEdit,
  children,
}: {
  title: string;
  meta?: string;
  onEdit: () => void;
  children: ReactNode;
}) {
  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <header className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-baseline gap-2">
          <h3 className="text-[12.5px] font-semibold text-foreground">{title}</h3>
          {meta ? <span className="text-[10.5px] text-muted-foreground">{meta}</span> : null}
        </div>
        <Button size="sm" variant="ghost" onClick={onEdit} className="h-7 gap-1 px-2 text-[11px]">
          Edit
        </Button>
      </header>
      {children}
    </section>
  );
}

function ReviewRow({ label, value, multiline }: { label: string; value: string; multiline?: boolean }) {
  return (
    <div>
      <div className="text-[10.5px] uppercase tracking-[0.12em] text-muted-foreground">{label}</div>
      <div className={`mt-0.5 text-[12.5px] text-foreground ${multiline ? "whitespace-pre-wrap" : "truncate font-semibold"}`}>
        {value}
      </div>
    </div>
  );
}
