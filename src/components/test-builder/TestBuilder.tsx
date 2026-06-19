import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  
  CheckCircle2,
  Download,
  FileUp,
  Sparkles,
  Upload,
  UserRound,
  Wand2,
  X,
  Shuffle,
  Eye,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { generateQuestions } from "@/lib/generate-questions.functions";
import { MOCK_QUESTIONS } from "@/lib/mock-questions";
import type { CandidateLevel, Question } from "@/lib/test-types";
import { QuestionEditor } from "./QuestionEditor";
import { DifficultyChart } from "./DifficultyChart";
import { exportTestPdf } from "@/lib/export-pdf";
import { saveClassAssessment } from "@/lib/assessments-api";
import { invalidateClassLifecycleQueries } from "@/lib/class-lifecycle";
import { listClassesForCounts, listCourses } from "@/lib/classes-api";
import { Link } from "@tanstack/react-router";

const STEPS = [
  { id: 1, label: "Profile", icon: UserRound },
  { id: 2, label: "Knowledge base", icon: Upload },
  { id: 3, label: "Generate", icon: Wand2 },
  { id: 4, label: "Review & export", icon: CheckCircle2 },
];

const LEVELS: { value: CandidateLevel; hint: string }[] = [
  { value: "Novice", hint: "0–2 yrs · foundations" },
  { value: "Mid-Level", hint: "2–5 yrs · applied ML" },
  { value: "Expert", hint: "5+ yrs · systems & depth" },
];

interface MaterialFile {
  name: string;
  size: number;
  text: string;
}

interface TestBuilderPreset {
  classId?: string;
  className?: string;
  role?: string;
  topics?: string[];
  difficulty?: "Beginner" | "Intermediate" | "Advanced";
  mcq?: number;
  subjective?: number;
  passMark?: number;
  materialText?: string;
  fileNames?: string[];
  questions?: Question[];
  purpose?: "training" | "interview";
}

const mapClassDifficulty = (difficulty?: TestBuilderPreset["difficulty"]): CandidateLevel =>
  difficulty === "Beginner" ? "Novice" : difficulty === "Advanced" ? "Expert" : "Mid-Level";

export function TestBuilder({ preset }: { preset?: TestBuilderPreset }) {
  const isInterview = preset?.purpose === "interview";
  const presetCount = (preset?.mcq ?? 0) + (preset?.subjective ?? 0);
  const qc = useQueryClient();
  const [step, setStep] = useState(preset?.classId ? 3 : 1);
  const [name, setName] = useState("");
  const [assessmentTitle, setAssessmentTitle] = useState(() => {
    if (preset?.className) return `${preset.className} Assessment`;
    if (isInterview) return "Interview assessment";
    return "";
  });
  const [linkClassId, setLinkClassId] = useState(preset?.classId ?? "");
  const [linkToCourse, setLinkToCourse] = useState(() => Boolean(preset?.classId));
  const [experience, setExperience] = useState(3);
  const [role, setRole] = useState(preset?.role ?? (isInterview ? "" : "Data Scientist"));
  const [level, setLevel] = useState<CandidateLevel>(mapClassDifficulty(preset?.difficulty));
  const [files, setFiles] = useState<MaterialFile[]>([]);
  const [count, setCount] = useState(presetCount || 35);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [generating, setGenerating] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [validated, setValidated] = useState(false);
  const [attached, setAttached] = useState(false);
  const [attaching, setAttaching] = useState(false);
  const [savedAssessmentId, setSavedAssessmentId] = useState<string | null>(null);
  const [seedAppliedFor, setSeedAppliedFor] = useState<string | null>(null);

  const runGenerate = useServerFn(generateQuestions);

  const { data: allClasses = [] } = useQuery({
    queryKey: ["classes-picker"],
    queryFn: listClassesForCounts,
    enabled: step >= 4,
  });
  const { data: courses = [] } = useQuery({
    queryKey: ["courses-picker"],
    queryFn: listCourses,
    enabled: step >= 4,
  });
  const courseTitleById = useMemo(
    () => new Map(courses.map((c) => [c.id, c.title])),
    [courses],
  );
  const classOptions = useMemo(
    () =>
      allClasses
        .filter((c) => c.course_id)
        .map((c) => ({
          id: c.id,
          label: `${courseTitleById.get(c.course_id!) ?? "Course"} · ${c.name}`,
        }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    [allClasses, courseTitleById],
  );

  useEffect(() => {
    const key = preset?.classId ?? null;
    if (!key || !preset || seedAppliedFor === key) return;
    if (preset.className) setAssessmentTitle(`${preset.className} Assessment`);
    if (preset.role) setRole(preset.role);
    if (preset.classId) {
      setLinkClassId(preset.classId);
      setLinkToCourse(true);
    }
    setLevel(mapClassDifficulty(preset.difficulty));
    if (presetCount) setCount(presetCount);
    if (preset.materialText) {
      setFiles([
        {
          name: "Class sections + uploaded assets",
          size: preset.materialText.length,
          text: preset.materialText,
        },
      ]);
    }
    if (preset.questions?.length) {
      setQuestions(preset.questions);
      setStep(4);
    } else if (preset.materialText) {
      setStep(3);
    }
    if (preset.materialText || preset.questions) setSeedAppliedFor(key);
  }, [preset, presetCount, seedAppliedFor]);

  const handleFiles = async (incoming: FileList | null) => {
    if (!incoming) return;
    const out: MaterialFile[] = [];
    for (const f of Array.from(incoming)) {
      let text = "";
      if (f.type.startsWith("text/") || /\.(txt|md|csv|json)$/i.test(f.name)) {
        text = await f.text();
      } else {
        text = `[${f.name}] — binary file (${(f.size / 1024).toFixed(0)} KB). Topics will be inferred from filename and Data Science fundamentals.`;
      }
      out.push({ name: f.name, size: f.size, text });
    }
    setFiles((prev) => [...prev, ...out]);
  };

  const onGenerate = async () => {
    setGenerating(true);
    try {
      const materialText = files.map((f) => `### ${f.name}\n${f.text}`).join("\n\n");
      const { questions: q } = await runGenerate({
        data: {
          materialText,
          fileNames: files.map((f) => f.name),
          level,
          role,
          count,
          purpose: preset?.purpose ?? "training",
        },
      });
      setQuestions(q);
      setValidated(false);
      setAttached(false);
      setStep(4);
      toast.success(`Generated ${q.length} questions`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Generation failed";
      toast.error(msg);
    } finally {
      setGenerating(false);
    }
  };

  const useMock = () => {
    const expanded: Question[] = [];
    for (let i = 0; i < 5; i++) {
      MOCK_QUESTIONS.forEach((q, j) =>
        expanded.push({ ...q, id: `mock-${i}-${j}` }),
      );
    }
    setQuestions(expanded.slice(0, count));
    setValidated(false);
    setAttached(false);
    setStep(4);
    toast.success("Loaded demo questions");
  };

  const shuffle = () => {
    setQuestions((prev) => [...prev].sort(() => Math.random() - 0.5));
    toast.success("Order randomized");
  };

  const updateQ = (idx: number, q: Question) => {
    setQuestions((prev) => prev.map((x, i) => (i === idx ? q : x)));
  };

  const deleteQ = (idx: number) => {
    setQuestions((prev) => prev.filter((_, i) => i !== idx));
  };

  const profile = useMemo(
    () => ({ name, experience, role, level }),
    [name, experience, role, level],
  );

  return (
    <div>
      <main className="mx-auto max-w-7xl px-4 py-6 md:px-8">
        {preset?.classId ? (
          <Card className="mb-5 rounded-xl border-primary/20 bg-card p-4 shadow-soft">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-primary">Class final assessment</p>
                <h2 className="mt-1 text-[18px] font-semibold text-foreground">{preset.className || "Generated class test"}</h2>
                <p className="mt-1 text-[12px] text-muted-foreground">
                  Generate from class topics, uploaded documents, transcripts and saved section questions, then review, validate, attach and export.
                </p>
              </div>
              <div className="flex flex-wrap gap-1.5 text-[11px]">
                <BadgeLike>{preset.difficulty || "Intermediate"}</BadgeLike>
                <BadgeLike>{count} questions</BadgeLike>
                <BadgeLike>Pass {preset.passMark ?? 60}%</BadgeLike>
              </div>
            </div>
          </Card>
        ) : null}
        <Stepper step={step} onStep={setStep} canSkipTo={questions.length > 0} />

        <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_320px]">
          <div>
            {step === 1 && (
              <ProfileStep
                {...{ name, setName, experience, setExperience, role, setRole, level, setLevel }}
                isInterview={isInterview}
                onNext={() => setStep(2)}
              />
            )}
            {step === 2 && (
              <UploadStep
                files={files}
                onFiles={handleFiles}
                onRemove={(i) => setFiles((p) => p.filter((_, idx) => idx !== i))}
                onBack={() => setStep(1)}
                onNext={() => setStep(3)}
              />
            )}
            {step === 3 && (
              <GenerateStep
                count={count}
                setCount={setCount}
                level={level}
                files={files}
                generating={generating}
                onGenerate={onGenerate}
                onMock={useMock}
                onBack={() => setStep(2)}
              />
            )}
            {step === 4 && (
              <ReviewStep
                questions={questions}
                onUpdate={updateQ}
                onDelete={deleteQ}
                onShuffle={shuffle}
                onPreview={() => setPreviewOpen(true)}
                onValidate={() => {
                  setValidated(true);
                  toast.success("Generated test validated");
                }}
                onAttach={async () => {
                  if (!validated) {
                    toast.error("Validate the test before saving");
                    return;
                  }
                  if (!isInterview && !linkClassId) {
                    toast.error("Select a class to save this assessment");
                    return;
                  }
                  if (isInterview && linkToCourse && !linkClassId) {
                    toast.error("Select a class or turn off “Link to course”");
                    return;
                  }
                  const title =
                    assessmentTitle.trim() ||
                    (isInterview
                      ? "Interview assessment"
                      : `${preset?.className ?? (role || "Training")} Assessment`);
                  setAttaching(true);
                  try {
                    const id = await saveClassAssessment({
                      ...(linkToCourse && linkClassId ? { classId: linkClassId } : {}),
                      title,
                      role,
                      difficulty: preset?.difficulty ?? "Intermediate",
                      level,
                      passMark: preset?.passMark ?? 60,
                      status: isInterview ? "published" : "validated",
                      questions,
                      purpose: preset?.purpose ?? "training",
                    });
                    setSavedAssessmentId(id);
                    setAttached(true);
                    invalidateClassLifecycleQueries(qc, {
                      classId: linkToCourse && linkClassId ? linkClassId : undefined,
                    });
                    await qc.invalidateQueries({ queryKey: ["interview-assessments"] });
                    toast.success(
                      isInterview
                        ? "Interview assessment saved — available when scheduling interviews"
                        : "Assessment saved — view it on the Assessments page",
                    );
                  } catch (e) {
                    toast.error(e instanceof Error ? e.message : "Failed to save");
                  } finally {
                    setAttaching(false);
                  }
                }}
                onExport={(withKey) => exportTestPdf(profile, questions, withKey)}
                onBack={() => setStep(3)}
                className={preset?.className}
                validated={validated}
                attached={attached}
                attaching={attaching}
                savedAssessmentId={savedAssessmentId}
                isInterview={isInterview}
                assessmentTitle={assessmentTitle}
                setAssessmentTitle={setAssessmentTitle}
                linkClassId={linkClassId}
                setLinkClassId={setLinkClassId}
                linkToCourse={linkToCourse}
                setLinkToCourse={setLinkToCourse}
                classOptions={classOptions}
                hasPresetClass={Boolean(preset?.classId)}
              />
            )}
          </div>

          <aside className="space-y-4 lg:sticky lg:top-6 lg:self-start">
            <CandidateSummary profile={profile} fileCount={files.length} qCount={questions.length} />
            {questions.length > 0 && <DifficultyChart questions={questions} />}
          </aside>
        </div>
      </main>

      <PreviewDialog
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        questions={questions}
        profile={profile}
      />
    </div>
  );
}


function Stepper({
  step,
  onStep,
  canSkipTo,
}: {
  step: number;
  onStep: (n: number) => void;
  canSkipTo: boolean;
}) {
  return (
    <ol className="flex items-center gap-1.5 overflow-x-auto pb-1">
      {STEPS.map((s, i) => {
        const active = step === s.id;
        const done = step > s.id;
        const clickable = done || (s.id === 4 && canSkipTo);
        const Icon = s.icon;
        return (
          <li key={s.id} className="flex items-center gap-1.5">
            <button
              disabled={!clickable && !active}
              onClick={() => clickable && onStep(s.id)}
              className={`group flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-xs font-medium transition-all ${
                active
                  ? "border-primary bg-primary text-primary-foreground"
                  : done
                    ? "border-border bg-background text-foreground hover:bg-accent cursor-pointer"
                    : "border-border/70 bg-background text-muted-foreground"
              }`}
            >
              <span
                className={`flex h-4 w-4 items-center justify-center rounded-full text-[9px] ${
                  active
                    ? "bg-background/15 text-background"
                    : done
                      ? "bg-foreground/10 text-foreground"
                      : "bg-muted text-muted-foreground"
                }`}
              >
                {done ? <CheckCircle2 className="h-3 w-3" /> : s.id}
              </span>
              <span className="tracking-wide">{s.label}</span>
              <Icon className="h-3 w-3 opacity-60" />
            </button>
            {i < STEPS.length - 1 && (
              <div
                className={`h-px w-5 ${done ? "bg-foreground/40" : "bg-border"}`}
                aria-hidden
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}

function ProfileStep(props: {
  name: string;
  setName: (s: string) => void;
  experience: number;
  setExperience: (n: number) => void;
  role: string;
  setRole: (s: string) => void;
  level: CandidateLevel;
  setLevel: (l: CandidateLevel) => void;
  isInterview?: boolean;
  onNext: () => void;
}) {
  return (
    <Card className="p-6 shadow-soft md:p-8">
      <StepHeader
        eyebrow="Step 1"
        title={props.isInterview ? "Calibrate question difficulty" : "Who are we assessing?"}
        subtitle={
          props.isInterview
            ? "Optional hints for the AI — these do not appear on the candidate schedule."
            : "Tell us about the candidate so the AI calibrates the right difficulty."
        }
      />

      <div className="grid gap-5 md:grid-cols-2">
        {!props.isInterview ? (
          <Field label="Candidate name">
            <Input
              value={props.name}
              onChange={(e) => props.setName(e.target.value)}
              placeholder="e.g. Priya Sharma"
            />
          </Field>
        ) : null}
        <Field label={props.isInterview ? "Topic focus (optional)" : "Role"}>
          <Input
            value={props.role}
            onChange={(e) => props.setRole(e.target.value)}
            placeholder={
              props.isInterview
                ? "e.g. Python, statistics — for AI generation only"
                : "e.g. Data Scientist"
            }
          />
        </Field>
        <Field label={`Years of experience: ${props.experience}`}>
          <Slider
            value={[props.experience]}
            min={0}
            max={15}
            step={1}
            onValueChange={(v) => props.setExperience(v[0])}
          />
        </Field>
        <Field label="Experience level">
          <Select value={props.level} onValueChange={(v: CandidateLevel) => props.setLevel(v)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {LEVELS.map((l) => (
                <SelectItem key={l.value} value={l.value}>
                  <div className="flex flex-col items-start">
                    <span>{l.value}</span>
                    <span className="text-xs text-muted-foreground">{l.hint}</span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </div>

      <div className="mt-8 flex justify-end">
        <Button size="lg" onClick={props.onNext} className="bg-primary text-primary-foreground hover:bg-primary-glow">
          Continue
        </Button>
      </div>
    </Card>
  );
}

function UploadStep({
  files,
  onFiles,
  onRemove,
  onBack,
  onNext,
}: {
  files: MaterialFile[];
  onFiles: (f: FileList | null) => void;
  onRemove: (i: number) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  return (
    <Card className="p-6 shadow-soft md:p-8">
      <StepHeader
        eyebrow="Step 2"
        title="Upload the knowledge base"
        subtitle="Manuals, lecture notes, transcripts — PDF, DOCX, TXT, PPT. The AI extracts key points and writes questions from them."
      />

      <label
        htmlFor="file-input"
        className="flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-border bg-muted/30 px-6 py-12 text-center transition-colors hover:border-primary hover:bg-accent/40"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          onFiles(e.dataTransfer.files);
        }}
      >
        <div className="flex h-11 w-11 items-center justify-center rounded-full border border-border bg-background text-foreground">
          <FileUp className="h-5 w-5" />
        </div>
        <p className="mt-4 text-sm font-semibold text-foreground">
          Drop files here or click to browse
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          PDF · DOCX · TXT · PPT · MD — up to 10 files
        </p>
        <input
          id="file-input"
          type="file"
          multiple
          accept=".pdf,.docx,.txt,.ppt,.pptx,.md,.csv"
          className="hidden"
          onChange={(e) => onFiles(e.target.files)}
        />
      </label>

      {files.length > 0 && (
        <ul className="mt-5 space-y-2">
          {files.map((f, i) => (
            <li
              key={i}
              className="flex items-center justify-between rounded-lg border border-border bg-card px-4 py-2.5"
            >
              <div className="flex min-w-0 items-center gap-3">
                <FileUp className="h-4 w-4 shrink-0 text-primary" />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">{f.name}</p>
                  <p className="text-xs text-muted-foreground">{(f.size / 1024).toFixed(1)} KB</p>
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground hover:text-destructive"
                onClick={() => onRemove(i)}
              >
                <X className="h-4 w-4" />
              </Button>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-8 flex justify-between">
        <Button variant="outline" onClick={onBack}>
          Back
        </Button>
        <Button size="lg" onClick={onNext} className="bg-primary text-primary-foreground hover:bg-primary-glow">
          Continue
        </Button>
      </div>
    </Card>
  );
}

function GenerateStep({
  count,
  setCount,
  level,
  files,
  generating,
  onGenerate,
  onMock,
  onBack,
}: {
  count: number;
  setCount: (n: number) => void;
  level: CandidateLevel;
  files: MaterialFile[];
  generating: boolean;
  onGenerate: () => void;
  onMock: () => void;
  onBack: () => void;
}) {
  return (
    <Card className="p-6 shadow-soft md:p-8">
      <StepHeader
        eyebrow="Step 3"
        title="Generate the test"
        subtitle="The AI mixes ~75% MCQs with 25% subjective questions, tags topic & difficulty, and calibrates to the candidate level."
      />

      <div className="grid gap-6 md:grid-cols-2">
        <div className="rounded-xl border border-border bg-muted/30 p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Calibration
          </p>
          <p className="mt-2 text-2xl font-bold text-foreground">{level}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {level === "Novice"
              ? "60% easy · 35% medium · 5% hard"
              : level === "Mid-Level"
                ? "25% easy · 50% medium · 25% hard"
                : "10% easy · 40% medium · 50% hard"}
          </p>
        </div>
        <div className="rounded-xl border border-border bg-muted/30 p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Knowledge base
          </p>
          <p className="mt-2 text-2xl font-bold text-foreground">
            {files.length} {files.length === 1 ? "file" : "files"}
          </p>
          <p className="mt-1 truncate text-xs text-muted-foreground">
            {files.map((f) => f.name).join(", ") || "(no files — AI uses DS fundamentals)"}
          </p>
        </div>
      </div>

      <div className="mt-6 rounded-xl border border-border p-5">
        <Label className="text-sm font-semibold">Number of questions: {count}</Label>
        <Slider
          value={[count]}
          min={10}
          max={50}
          step={5}
          onValueChange={(v) => setCount(v[0])}
          className="mt-4"
        />
        <div className="mt-1 flex justify-between text-xs text-muted-foreground">
          <span>10</span>
          <span>30–40 recommended</span>
          <span>50</span>
        </div>
      </div>

      <div className="mt-8 flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
        <Button variant="outline" onClick={onBack}>
          Back
        </Button>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button variant="outline" onClick={onMock} disabled={generating}>
            <Sparkles className="mr-2 h-4 w-4" />
            Use demo questions
          </Button>
          <Button
            size="lg"
            onClick={onGenerate}
            disabled={generating}
            className="bg-primary text-primary-foreground hover:bg-primary-glow"
          >
            {generating ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Generating…
              </>
            ) : (
              <>
                <Wand2 className="mr-2 h-4 w-4" />
                Generate with AI
              </>
            )}
          </Button>
        </div>
      </div>
    </Card>
  );
}

function ReviewStep({
  questions,
  onUpdate,
  onDelete,
  onShuffle,
  onPreview,
  onValidate,
  onAttach,
  onExport,
  onBack,
  className,
  validated,
  attached,
  attaching,
  savedAssessmentId,
  isInterview,
  assessmentTitle,
  setAssessmentTitle,
  linkClassId,
  setLinkClassId,
  linkToCourse,
  setLinkToCourse,
  classOptions,
  hasPresetClass,
}: {
  questions: Question[];
  onUpdate: (i: number, q: Question) => void;
  onDelete: (i: number) => void;
  onShuffle: () => void;
  onPreview: () => void;
  onValidate: () => void;
  onAttach: () => void;
  onExport: (withKey: boolean) => void;
  onBack: () => void;
  className?: string;
  validated: boolean;
  attached: boolean;
  attaching: boolean;
  savedAssessmentId: string | null;
  isInterview: boolean;
  assessmentTitle: string;
  setAssessmentTitle: (v: string) => void;
  linkClassId: string;
  setLinkClassId: (v: string) => void;
  linkToCourse: boolean;
  setLinkToCourse: (v: boolean) => void;
  classOptions: { id: string; label: string }[];
  hasPresetClass: boolean;
}) {
  return (
    <div>
      <div className="mb-4 grid gap-2 md:grid-cols-4">
        <FlowStep done label="View generated test" />
        <FlowStep done={validated} label="Validate generated test" />
        <FlowStep done={attached} label="Save assessment" />
        <FlowStep done={attached} label={isInterview ? "Schedule interview" : "Assign learners"} />
      </div>

      <Card className="mb-4 space-y-3 p-4 shadow-soft">
        <p className="text-[13px] font-semibold text-foreground">Save to library</p>
        <p className="text-[12px] text-muted-foreground">
          {isInterview
            ? "Validate your questions, then save. By default this stays in the interview pool — not linked to employee courses."
            : "Pick a class and title, validate your questions, then save. Saved assessments appear on the Assessments page."}
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Assessment title">
            <Input
              value={assessmentTitle}
              onChange={(e) => setAssessmentTitle(e.target.value)}
              placeholder={isInterview ? "Interview assessment" : "Module 3 Final Test"}
            />
          </Field>
          {isInterview && !hasPresetClass ? (
            <div className="flex flex-col justify-end gap-2 sm:col-span-2">
              <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
                <div>
                  <p className="text-[12px] font-medium">Link to a course class</p>
                  <p className="text-[11px] text-muted-foreground">
                    Off by default — use course material to ground AI questions. Does not assign to learners.
                  </p>
                </div>
                <Switch checked={linkToCourse} onCheckedChange={setLinkToCourse} />
              </div>
              {linkToCourse ? (
                <Field label="Class">
                  <Select value={linkClassId || undefined} onValueChange={setLinkClassId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a class…" />
                    </SelectTrigger>
                    <SelectContent>
                      {classOptions.length === 0 ? (
                        <SelectItem value="_none" disabled>
                          No classes — create a course & class first
                        </SelectItem>
                      ) : (
                        classOptions.map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.label}
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                </Field>
              ) : null}
            </div>
          ) : !hasPresetClass ? (
            <Field label="Link to class">
              <Select value={linkClassId || undefined} onValueChange={setLinkClassId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a class…" />
                </SelectTrigger>
                <SelectContent>
                  {classOptions.length === 0 ? (
                    <SelectItem value="_none" disabled>
                      No classes — create a course & class first
                    </SelectItem>
                  ) : (
                    classOptions.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.label}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </Field>
          ) : (
            <Field label="Class">
              <Input value={className ?? "Linked class"} disabled />
            </Field>
          )}
        </div>
      </Card>

      <Card className="mb-4 flex flex-wrap items-center gap-2 p-4 shadow-soft">
        <div className="mr-auto">
          <p className="text-sm font-semibold text-foreground">
            {questions.length} questions ready
          </p>
          <p className="text-xs text-muted-foreground">
            {className ? `${className} · ` : ""}Click any answer letter to mark it correct · edit text inline
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={onBack}>
          Regenerate
        </Button>
        <Button variant="outline" size="sm" onClick={onShuffle}>
          <Shuffle className="mr-2 h-4 w-4" />
          Randomize
        </Button>
        <Button variant="outline" size="sm" onClick={onPreview}>
          <Eye className="mr-2 h-4 w-4" />
          Quick preview
        </Button>
        <Button variant={validated ? "secondary" : "outline"} size="sm" onClick={onValidate}>
          <CheckCircle2 className="mr-2 h-4 w-4" />
          {validated ? "Validated" : "Validate"}
        </Button>
        <Button
          variant={attached ? "secondary" : "default"}
          size="sm"
          onClick={onAttach}
          disabled={attaching || attached}
          className={attached ? "" : "bg-primary text-primary-foreground hover:bg-primary-glow"}
        >
          {attaching ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Sparkles className="mr-2 h-4 w-4" />
          )}
          {attached ? "Saved" : attaching ? "Saving…" : "Save assessment"}
        </Button>
        {savedAssessmentId ? (
          <>
            {isInterview ? (
              <Button asChild size="sm" variant="outline">
                <Link to="/interviews/assessments">
                  <CheckCircle2 className="mr-2 h-4 w-4" />
                  Interview tests
                </Link>
              </Button>
            ) : (
              <Button asChild size="sm" variant="outline">
                <Link to="/assessments">
                  <CheckCircle2 className="mr-2 h-4 w-4" />
                  Assessments list
                </Link>
              </Button>
            )}
            {isInterview ? (
              <Button asChild size="sm" variant="outline">
                <Link to="/interviews">Schedule interview</Link>
              </Button>
            ) : null}
            <Button asChild size="sm" className="bg-primary text-primary-foreground hover:bg-primary-glow">
              <Link
                to="/assessments/$assessmentId/preview"
                params={{ assessmentId: savedAssessmentId }}
              >
                <Eye className="mr-2 h-4 w-4" />
                Preview
              </Link>
            </Button>
          </>
        ) : null}
        <Button
          size="sm"
          variant="outline"
          onClick={() => onExport(false)}
        >
          <Download className="mr-2 h-4 w-4" />
          PDF
        </Button>
        <Button size="sm" variant="secondary" onClick={() => onExport(true)}>
          <Download className="mr-2 h-4 w-4" />
          With answer key
        </Button>
      </Card>

      <div className="space-y-3">
        {questions.map((q, i) => (
          <QuestionEditor
            key={q.id}
            q={q}
            index={i}
            onChange={(nq) => onUpdate(i, nq)}
            onDelete={() => onDelete(i)}
          />
        ))}
      </div>
    </div>
  );
}

function FlowStep({ done, label }: { done: boolean; label: string }) {
  return (
    <div className={`rounded-lg border px-3 py-2 text-[11.5px] font-medium ${done ? "border-primary/30 bg-accent text-primary" : "border-border bg-card text-muted-foreground"}`}>
      <span className="inline-flex items-center gap-1.5">
        <CheckCircle2 className="h-3.5 w-3.5" /> {label}
      </span>
    </div>
  );
}

function PreviewDialog({
  open,
  onClose,
  questions,
  profile,
}: {
  open: boolean;
  onClose: () => void;
  questions: Question[];
  profile: { name: string; role: string; level: string };
}) {
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Candidate preview</DialogTitle>
        </DialogHeader>
        <div className="rounded-lg border border-border bg-card p-6">
          <h2 className="text-xl font-bold">Data Scientist Assessment</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {profile.name || "Candidate"} · {profile.role} · {profile.level}
          </p>
          <hr className="my-4" />
          <ol className="space-y-5">
            {questions.map((q, i) => (
              <li key={q.id}>
                <p className="font-medium">
                  {i + 1}. <span className="text-xs text-muted-foreground">[{q.topic}]</span>{" "}
                  {q.prompt}
                </p>
                {q.type === "mcq" ? (
                  <ul className="mt-2 space-y-1 pl-6 text-sm">
                    {q.options?.map((o, j) => (
                      <li key={j}>
                        {String.fromCharCode(65 + j)}. {o}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="mt-2 h-16 rounded border border-dashed border-border bg-muted/20" />
                )}
              </li>
            ))}
          </ol>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function CandidateSummary({
  profile,
  fileCount,
  qCount,
}: {
  profile: { name: string; role: string; level: string; experience: number };
  fileCount: number;
  qCount: number;
}) {
  return (
    <Card className="overflow-hidden border-border shadow-soft">
      <div className="border-b border-border bg-gradient-hero p-5 text-primary-foreground">
        <p className="text-[10px] font-medium uppercase tracking-[0.22em] opacity-75">
          Candidate
        </p>
        <p className="mt-2 font-display text-xl leading-tight">
          {profile.name || "Untitled candidate"}
        </p>
        <p className="mt-1 text-xs opacity-80">
          {profile.role} · {profile.experience} yrs · {profile.level}
        </p>
      </div>
      <div className="grid grid-cols-2 divide-x divide-border">
        <SummaryStat label="Files" value={fileCount} />
        <SummaryStat label="Questions" value={qCount} />
      </div>
    </Card>
  );
}

function SummaryStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="p-5 text-center">
      <p className="font-display text-3xl text-foreground">{value}</p>
      <p className="mt-1 text-[11px] uppercase tracking-[0.18em] text-muted-foreground">{label}</p>
    </div>
  );
}

function BadgeLike({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-md border border-primary/25 bg-accent px-2 py-1 font-medium text-primary">
      {children}
    </span>
  );
}

function StepHeader({
  eyebrow,
  title,
  subtitle,
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
}) {
  return (
    <div className="mb-6">
      <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
        {eyebrow}
      </p>
      <h2 className="mt-1.5 font-display text-2xl tracking-tight text-foreground md:text-[26px]">
        {title}
      </h2>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">{subtitle}</p>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <Label className="text-sm font-medium">{label}</Label>
      {children}
    </div>
  );
}
