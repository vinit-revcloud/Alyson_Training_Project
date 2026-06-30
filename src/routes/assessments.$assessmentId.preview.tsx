import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { z } from "zod";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { QueryLoadError } from "@/components/admin/QueryLoadError";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  ArrowLeft,
  CheckCircle2,
  Clock,
  Eye,
  EyeOff,
  Pencil,
  Save,
  Sparkles,
  Trophy,
  User as UserIcon,
  Wand2,
} from "lucide-react";
import {
  getAssessment,
  listAssessmentQuestions,
  questionRowToQuestion,
  updateAssessmentDetails,
} from "@/lib/assessments-api";
import { getClass } from "@/lib/classes-api";

const assessmentParamsSchema = z.object({ assessmentId: z.string().uuid() });

export const Route = createFileRoute("/assessments/$assessmentId/preview")({
  params: assessmentParamsSchema,
  head: () => ({ meta: [{ title: "Candidate Preview — Alyson" }] }),
  component: PreviewPage,
});

function PreviewPage() {
  const { assessmentId } = Route.useParams();
  const qc = useQueryClient();

  const {
    data: assessment,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ["assessment", assessmentId],
    queryFn: () => getAssessment(assessmentId),
  });
  const { data: rows = [], isError: questionsError, refetch: refetchQuestions } = useQuery({
    queryKey: ["assessment-questions", assessmentId],
    queryFn: () => listAssessmentQuestions(assessmentId),
    enabled: !!assessment,
  });
  const { data: cls } = useQuery({
    queryKey: ["class", assessment?.class_id],
    queryFn: () => (assessment?.class_id ? getClass(assessment.class_id) : Promise.resolve(null)),
    enabled: !!assessment?.class_id,
  });

  const questions = useMemo(() => rows.map(questionRowToQuestion), [rows]);
  const isInterview = assessment?.purpose === "interview";

  const [draftTitle, setDraftTitle] = useState("");
  const [draftDescription, setDraftDescription] = useState("");
  const [detailsOpen, setDetailsOpen] = useState(true);

  useEffect(() => {
    if (!assessment) return;
    setDraftTitle(assessment.title);
    setDraftDescription(assessment.description ?? "");
  }, [assessment?.id, assessment?.title, assessment?.description]);

  const saveDetails = useMutation({
    mutationFn: () =>
      updateAssessmentDetails({
        assessmentId,
        title: draftTitle,
        description: draftDescription,
      }),
    onSuccess: (updated) => {
      qc.setQueryData(["assessment", assessmentId], updated);
      qc.invalidateQueries({ queryKey: ["assessments-stats"] });
      toast.success("Assessment details saved");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const detailsDirty =
    !!assessment &&
    (draftTitle.trim() !== assessment.title ||
      draftDescription.trim() !== (assessment.description ?? "").trim());

  const [candidateName, setCandidateName] = useState("");
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState(false);
  const [showKey, setShowKey] = useState(false);

  const score = useMemo(() => {
    const mcqs = questions.filter((q) => q.type === "mcq");
    if (mcqs.length === 0) return null;
    let correct = 0;
    for (const q of mcqs) {
      if ((answers[q.id] ?? "").trim().toLowerCase() === (q.correctAnswer ?? "").trim().toLowerCase()) {
        correct += 1;
      }
    }
    return Math.round((correct / mcqs.length) * 100);
  }, [answers, questions]);

  const passed = score !== null && assessment ? score >= assessment.pass_mark : null;

  const onSubmit = () => {
    setSubmitted(true);
    toast.success("Test submitted — this was a preview, no data was saved.");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  if (isLoading) {
    return (
      <AdminLayout title="Candidate Preview" subtitle="Loading assessment…">
        <Card className="mx-auto max-w-3xl h-48 animate-pulse rounded-2xl border-border bg-muted/30" />
      </AdminLayout>
    );
  }

  if (isError) {
    return (
      <AdminLayout title="Candidate Preview">
        <div className="mx-auto max-w-3xl">
          <QueryLoadError message="Could not load this assessment" onRetry={() => void refetch()} />
          <Link to="/assessments" className="mt-4 inline-flex items-center gap-1 text-sm text-primary hover:underline">
            <ArrowLeft className="h-3.5 w-3.5" /> Back to assessments
          </Link>
        </div>
      </AdminLayout>
    );
  }

  if (!assessment) throw notFound();

  return (
    <AdminLayout
      title="Candidate Preview"
      subtitle={
        isInterview
          ? "Edit the title candidates see, then walk through the test below"
          : "Edit the title trainees see, then walk through the test below"
      }
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant={detailsOpen ? "secondary" : "outline"}
            size="sm"
            onClick={() => setDetailsOpen((v) => !v)}
            className="h-9 gap-1.5 rounded-lg"
          >
            <Pencil className="h-3.5 w-3.5" />
            {detailsOpen ? "Hide details" : "Edit title"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowKey((v) => !v)}
            className="h-9 gap-1.5 rounded-lg"
          >
            {showKey ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            {showKey ? "Hide answer key" : "Show answer key"}
          </Button>
          {assessment.class_id ? (
            <Button asChild variant="outline" size="sm" className="h-9 gap-1.5 rounded-lg">
              <Link
                to="/assessments/builder"
                search={{
                  classId: assessment.class_id,
                  purpose: isInterview ? "interview" : "training",
                }}
              >
                <Wand2 className="h-3.5 w-3.5" /> Edit questions
              </Link>
            </Button>
          ) : null}
          <Button asChild variant="outline" size="sm" className="h-9 gap-1.5 rounded-lg">
            <Link to={isInterview ? "/interviews/assessments" : "/assessments"}>
              <ArrowLeft className="h-3.5 w-3.5" /> Back
            </Link>
          </Button>
        </div>
      }
    >
      <div className="mx-auto max-w-3xl space-y-5">
        {questionsError ? (
          <QueryLoadError
            message="Could not load assessment questions"
            onRetry={() => void refetchQuestions()}
          />
        ) : null}

        {detailsOpen ? (
          <Card className="rounded-xl border-primary/25 bg-primary/5 p-4 shadow-soft">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-[13px] font-semibold text-foreground">Assessment details</p>
                <p className="mt-0.5 text-[12px] text-muted-foreground">
                  Changes apply to scheduled interviews and candidate-facing screens. The preview
                  below updates as you type.
                </p>
              </div>
              <Badge variant="outline" className="shrink-0 capitalize">
                {assessment.status.replace("_", " ")}
              </Badge>
            </div>
            <div className="mt-4 grid gap-3">
              <label className="block space-y-1.5">
                <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  Title
                </span>
                <Input
                  value={draftTitle}
                  onChange={(e) => setDraftTitle(e.target.value)}
                  placeholder={isInterview ? "e.g. Senior Data Engineer — SQL & Python" : "e.g. Module 3 Final Test"}
                  className="h-10 rounded-md text-[13px]"
                />
              </label>
              <label className="block space-y-1.5">
                <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  Short description{" "}
                  <span className="normal-case text-muted-foreground/80">(optional)</span>
                </span>
                <Textarea
                  value={draftDescription}
                  onChange={(e) => setDraftDescription(e.target.value)}
                  placeholder="e.g. SQL, Python, AWS, Spark — 45 min technical screen"
                  className="min-h-[72px] rounded-md text-[13px]"
                />
              </label>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                className="gap-1.5"
                disabled={!detailsDirty || !draftTitle.trim() || saveDetails.isPending}
                onClick={() => saveDetails.mutate()}
              >
                <Save className="h-3.5 w-3.5" />
                {saveDetails.isPending ? "Saving…" : "Save changes"}
              </Button>
              {detailsDirty ? (
                <span className="text-[11px] text-amber-700 dark:text-amber-400">
                  Unsaved changes — preview below shows your edits
                </span>
              ) : (
                <span className="text-[11px] text-muted-foreground">All changes saved</span>
              )}
            </div>
          </Card>
        ) : null}

        <div className="flex items-center gap-2 rounded-lg border border-dashed border-border bg-muted/30 px-3 py-2 text-[11.5px] text-muted-foreground">
          <Eye className="h-3.5 w-3.5 shrink-0" />
          Preview mode — answers are not saved. This is what{" "}
          {isInterview ? "candidates" : "trainees"} will see.
        </div>

        {/* Header card — looks like the candidate-facing test cover */}
        <Card className="overflow-hidden rounded-2xl border-border shadow-soft">
          <div className="bg-gradient-hero p-6 text-primary-foreground">
            <div className="flex items-center gap-2 text-[10px] font-medium uppercase tracking-[0.22em] opacity-80">
              <Sparkles className="h-3 w-3" /> Alyson Training ·{" "}
              {isInterview ? "Interview Assessment" : "Final Assessment"}
            </div>
            <h1 className="mt-3 font-display text-2xl leading-tight md:text-3xl">
              {draftTitle.trim() || "Untitled assessment"}
            </h1>
            {draftDescription.trim() ? (
              <p className="mt-2 text-[12.5px] leading-relaxed opacity-90">{draftDescription}</p>
            ) : cls ? (
              <p className="mt-1 text-[12.5px] opacity-85">
                {cls.name} · {assessment.role || cls.audience}
              </p>
            ) : assessment.role ? (
              <p className="mt-1 text-[12.5px] opacity-85">{assessment.role}</p>
            ) : null}
            <div className="mt-4 flex flex-wrap gap-1.5 text-[11px]">
              <Pill>
                <Clock className="mr-1 h-3 w-3" />
                {assessment.duration_min ?? 45} min
              </Pill>
              <Pill>{questions.length} questions</Pill>
              <Pill>Pass {assessment.pass_mark ?? 60}%</Pill>
              <Pill>{assessment.difficulty ?? "Intermediate"}</Pill>
            </div>
          </div>
          <div className="p-5">
            <label className="block space-y-1.5">
              <span className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                <UserIcon className="h-3 w-3" /> Your name
              </span>
              <Input
                value={candidateName}
                onChange={(e) => setCandidateName(e.target.value)}
                placeholder="e.g. Priya Sharma"
                className="h-10 rounded-md text-[13px]"
              />
            </label>
          </div>
        </Card>

        {/* Result banner after submit */}
        {submitted && score !== null ? (
          <Card
            className={`flex items-center gap-3 rounded-xl p-4 shadow-soft ${
              passed ? "border-primary/40 bg-accent" : "border-destructive/40 bg-destructive/5"
            }`}
          >
            <Trophy className={`h-5 w-5 ${passed ? "text-primary" : "text-destructive"}`} />
            <div className="flex-1">
              <div className="text-[13px] font-semibold">
                {passed ? "Passed" : "Did not pass"} — auto-graded MCQ score {score}%
              </div>
              <div className="text-[11px] text-muted-foreground">
                Subjective answers would be graded by the trainer. Pass mark{" "}
                {assessment.pass_mark}%.
              </div>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setAnswers({});
                setSubmitted(false);
              }}
              className="h-8 rounded-md text-[12px]"
            >
              Retry
            </Button>
          </Card>
        ) : null}

        {/* Question list */}
        <div className="space-y-3">
          {questions.map((q, i) => {
            const userAns = answers[q.id] ?? "";
            const isCorrect =
              q.type === "mcq" &&
              q.correctAnswer &&
              userAns.trim().toLowerCase() === q.correctAnswer.trim().toLowerCase();
            return (
              <Card key={q.id} className="rounded-xl border-border p-5 shadow-soft">
                <div className="flex items-start gap-3">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-[11px] font-semibold text-primary">
                    {i + 1}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge variant="outline" className="rounded-md border-border bg-muted text-[10px] text-muted-foreground">
                        {q.topic || "General"}
                      </Badge>
                      <Badge variant="outline" className="rounded-md border-border bg-muted text-[10px] text-muted-foreground">
                        {q.difficulty}
                      </Badge>
                      <Badge variant="outline" className="rounded-md border-border bg-card text-[10px] text-foreground">
                        {q.type === "mcq" ? "Multiple choice" : "Subjective"}
                      </Badge>
                    </div>
                    <p className="mt-2 text-[14px] font-medium text-foreground">{q.prompt}</p>

                    {q.type === "mcq" && q.options ? (
                      <RadioGroup
                        value={userAns}
                        onValueChange={(v) => !submitted && setAnswers((a) => ({ ...a, [q.id]: v }))}
                        className="mt-3 space-y-1.5"
                      >
                        {q.options.map((opt, j) => {
                          const letter = String.fromCharCode(65 + j);
                          const isAnswer = (q.correctAnswer ?? "").trim().toLowerCase() === opt.trim().toLowerCase();
                          return (
                            <label
                              key={j}
                              className={`flex cursor-pointer items-start gap-2 rounded-md border p-2.5 text-[13px] transition-colors ${
                                showKey && isAnswer
                                  ? "border-primary/50 bg-accent"
                                  : "border-border hover:bg-muted/50"
                              }`}
                            >
                              <RadioGroupItem value={opt} id={`${q.id}-${j}`} className="mt-0.5" />
                              <span className="flex-1">
                                <span className="font-semibold text-muted-foreground">{letter}.</span> {opt}
                              </span>
                              {showKey && isAnswer ? (
                                <CheckCircle2 className="h-4 w-4 shrink-0 text-primary" />
                              ) : null}
                            </label>
                          );
                        })}
                      </RadioGroup>
                    ) : (
                      <Textarea
                        value={userAns}
                        onChange={(e) => !submitted && setAnswers((a) => ({ ...a, [q.id]: e.target.value }))}
                        placeholder="Type your answer…"
                        className="mt-3 min-h-24 rounded-md text-[13px]"
                      />
                    )}

                    {submitted && q.type === "mcq" && q.correctAnswer ? (
                      <div
                        className={`mt-2 text-[11.5px] ${
                          isCorrect ? "text-primary" : "text-destructive"
                        }`}
                      >
                        {isCorrect
                          ? "Correct"
                          : `Correct answer: ${q.correctAnswer}`}
                      </div>
                    ) : null}

                    {showKey && q.type === "subjective" && q.rubric ? (
                      <div className="mt-2 rounded-md border border-dashed border-border bg-muted/40 p-2 text-[11.5px] text-muted-foreground">
                        <span className="font-medium text-foreground">Rubric: </span>
                        {q.rubric}
                      </div>
                    ) : null}
                  </div>
                </div>
              </Card>
            );
          })}
          {!questionsError && questions.length === 0 ? (
            <Card className="rounded-xl border-dashed border-border p-10 text-center text-[13px] text-muted-foreground">
              This assessment has no questions yet. Open the randomizer to generate and attach a test.
            </Card>
          ) : null}
        </div>

        {/* Footer actions */}
        {questions.length > 0 ? (
          <div className="sticky bottom-4 z-10 flex items-center justify-between gap-3 rounded-xl border border-border bg-card/95 p-3 shadow-soft backdrop-blur">
            <div className="text-[11.5px] text-muted-foreground">
              {Object.keys(answers).length}/{questions.length} answered
            </div>
            <Button
              onClick={onSubmit}
              disabled={submitted}
              className="gap-2 rounded-md bg-primary text-primary-foreground hover:bg-primary-glow"
            >
              <CheckCircle2 className="h-4 w-4" />
              {submitted ? "Submitted" : "Submit test"}
            </Button>
          </div>
        ) : null}
      </div>
    </AdminLayout>
  );
}

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-md bg-white/15 px-2 py-0.5 font-medium">
      {children}
    </span>
  );
}
