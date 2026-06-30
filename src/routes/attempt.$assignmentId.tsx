import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { z } from "zod";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Clock,
  Hourglass,
  PlayCircle,
  Sparkles,
  Trophy,
  XCircle,
} from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import {
  expireAssignment,
  getActiveAttemptFn,
  getAttemptQuestions,
  getLearnerAssessmentMetadataFn,
  getLearnerAssignmentFn,
  gradeAndSubmitAttempt,
  startAttempt as startAttemptFn,
} from "@/lib/attempt.functions";
import { useSession } from "@/lib/auth";
import { cn } from "@/lib/utils";

const assignmentParamsSchema = z.object({ assignmentId: z.string().uuid() });

export const Route = createFileRoute("/attempt/$assignmentId")({
  params: assignmentParamsSchema,
  head: () => ({ meta: [{ title: "Take Test — Alyson" }] }),
  component: AttemptPage,
});

type AssignmentStatus =
  | "assigned"
  | "in_progress"
  | "passed"
  | "failed_capped"
  | "expired";

function loadErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message.trim();
  return "Could not load this assignment. Check your connection and try again.";
}

function AttemptPage() {
  const { assignmentId } = Route.useParams();
  const { user, loading: sessionLoading } = useSession();
  const qc = useQueryClient();

  const loadAssignment = useServerFn(getLearnerAssignmentFn);
  const loadAssessmentMeta = useServerFn(getLearnerAssessmentMetadataFn);
  const loadActiveAttempt = useServerFn(getActiveAttemptFn);
  const fetchQuestions = useServerFn(getAttemptQuestions);
  const runStartAttempt = useServerFn(startAttemptFn);
  const runExpireAssignment = useServerFn(expireAssignment);
  const gradeFn = useServerFn(gradeAndSubmitAttempt);

  const {
    data: assignment,
    isLoading,
    isError: assignmentError,
    error: assignmentLoadError,
    refetch: refetchAssignment,
  } = useQuery({
    queryKey: ["assignment", assignmentId],
    queryFn: () => loadAssignment({ data: { assignmentId } }),
    enabled: !!user?.id,
  });

  const {
    data: assessment,
    isError: assessmentError,
    error: assessmentLoadError,
  } = useQuery({
    queryKey: ["learner-assessment-meta", assignmentId],
    queryFn: () => loadAssessmentMeta({ data: { assignmentId } }),
    enabled: !!assignment?.assessment_id,
  });

  const { data: questions = [] } = useQuery({
    queryKey: ["attempt-questions", assignmentId],
    queryFn: () => fetchQuestions({ data: { assignmentId } }),
    enabled: !!assignment?.assessment_id,
  });

  const { data: activeAttempt } = useQuery({
    queryKey: ["active-attempt", assignmentId],
    queryFn: () => loadActiveAttempt({ data: { assignmentId } }),
    enabled:
      !!assignment &&
      assignment.status === "in_progress" &&
      assignment.attempts_used < assignment.max_attempts,
  });

  // ---- Countdown ----
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const dueMs = assignment ? new Date(assignment.due_at).getTime() : 0;
  const remainingMs = Math.max(0, dueMs - now);
  const isExpiredByTime = !!assignment && remainingMs === 0;
  const effectiveStatus: AssignmentStatus = !assignment
    ? "assigned"
    : assignment.status === "assigned" && isExpiredByTime
      ? "expired"
      : assignment.status === "in_progress" && isExpiredByTime
        ? "expired"
        : assignment.status;

  // Auto-flip to "expired" on the server the moment the countdown hits 0
  // for an assignment that's still in assigned/in_progress.
  const [autoExpiredFired, setAutoExpiredFired] = useState(false);
  useEffect(() => {
    if (!assignment || autoExpiredFired) return;
    if (!isExpiredByTime) return;
    if (assignment.status !== "assigned" && assignment.status !== "in_progress") return;
    setAutoExpiredFired(true);
    runExpireAssignment({ data: { assignmentId: assignment.id } })
      .then(() => {
        toast.error("Time's up — this assignment has expired.");
        qc.invalidateQueries({ queryKey: ["assignment", assignmentId] });
      })
      .catch(() => {
        // benign — cron will catch it
      });
  }, [assignment, isExpiredByTime, autoExpiredFired, qc, assignmentId, runExpireAssignment]);

  // ---- Attempt state ----
  const [started, setStarted] = useState(false);
  const [attemptId, setAttemptId] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState(false);
  const [resultScore, setResultScore] = useState<number | null>(null);
  const [resultPassed, setResultPassed] = useState<boolean | null>(null);

  useEffect(() => {
    if (!activeAttempt || started || submitted) return;
    setAttemptId(activeAttempt.attemptId);
    setAnswers(activeAttempt.answers);
    setStarted(true);
  }, [activeAttempt, started, submitted]);

  const startAttempt = useMutation({
    mutationFn: async () => {
      if (!assignment) throw new Error("Not ready");
      return runStartAttempt({ data: { assignmentId: assignment.id } });
    },
    onSuccess: (id) => {
      setAttemptId(id);
      setStarted(true);
      qc.invalidateQueries({ queryKey: ["assignment", assignmentId] });
      qc.invalidateQueries({ queryKey: ["active-attempt", assignmentId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const submitAttempt = useMutation({
    mutationFn: async () => {
      if (!attemptId || !assignment) throw new Error("No attempt");
      if (isExpiredByTime) throw new Error("Time expired — submissions are frozen.");
      return gradeFn({
        data: { assignmentId: assignment.id, attemptId, answers },
      });
    },
    onSuccess: ({ score, passed }) => {
      setResultScore(score);
      setResultPassed(passed);
      setSubmitted(true);
      qc.invalidateQueries({ queryKey: ["assignment", assignmentId] });
      qc.invalidateQueries({ queryKey: ["my-assignments"] });
      toast.success("Test submitted");
      window.scrollTo({ top: 0, behavior: "smooth" });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const canStart =
    !!assignment &&
    !sessionLoading &&
    !!user &&
    !isExpiredByTime &&
    assignment.attempts_used < assignment.max_attempts &&
    assignment.status !== "passed" &&
    assignment.status !== "failed_capped";

  if (!isLoading && !assignment && !assignmentError) throw notFound();

  if (sessionLoading || isLoading) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background">
        <p className="text-sm text-muted-foreground">Loading assignment…</p>
      </div>
    );
  }

  if (assignmentError || assessmentError) {
    const message = assignmentError
      ? loadErrorMessage(assignmentLoadError)
      : loadErrorMessage(assessmentLoadError);
    return (
      <div className="mx-auto max-w-lg px-5 py-12">
        <p className="text-sm text-destructive">{message}</p>
        <div className="mt-3 flex gap-2">
          <Button variant="outline" size="sm" onClick={() => void refetchAssignment()}>
            Retry
          </Button>
          <Button asChild variant="ghost" size="sm">
            <Link to="/learn/assignments">Back to assessments</Link>
          </Button>
        </div>
      </div>
    );
  }

  if (!assignment) throw notFound();

  return (
    <div className="min-h-dvh bg-background">
      <header className="border-b border-border bg-card/80 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-5 py-3">
          <Link
            to="/learn/assignments"
            className="inline-flex items-center gap-1.5 text-[12.5px] text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            My assignments
          </Link>
          <CountdownPill remainingMs={remainingMs} status={effectiveStatus} />
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-5 px-5 py-6">
        {/* Cover card */}
        <Card className="overflow-hidden rounded-2xl border-border shadow-soft">
          <div className="bg-gradient-hero p-6 text-primary-foreground">
            <div className="flex items-center gap-2 text-[10px] font-medium uppercase tracking-[0.22em] opacity-80">
              <Sparkles className="h-3 w-3" />
              Alyson Training · {assignment?.mode === "practice" ? "Practice" : "Final"} Assessment
            </div>
            <h1 className="mt-3 font-display text-2xl leading-tight md:text-3xl">
              {assessment?.title ?? "Assessment"}
            </h1>
            <div className="mt-4 flex flex-wrap items-center gap-1.5 text-[11px]">
              <StatusBadge status={effectiveStatus} />
              <Pill>
                <Clock className="mr-1 h-3 w-3" />
                {assessment?.duration_min ?? 45} min
              </Pill>
              <Pill>{questions.length} questions</Pill>
              <Pill>Pass {assessment?.pass_mark ?? 60}%</Pill>
              {assignment ? (
                <Pill>
                  Attempt {Math.min(assignment.attempts_used + (started ? 1 : 0), assignment.max_attempts)}/
                  {assignment.max_attempts}
                </Pill>
              ) : null}
            </div>
          </div>
        </Card>

        {/* Status banners */}
        {effectiveStatus === "expired" ? (
          <Banner
            tone="destructive"
            icon={<AlertTriangle className="h-5 w-5" />}
            title="This assignment has expired"
            body="The window to take this test has closed. Contact your trainer to request an extension."
          />
        ) : null}
        {effectiveStatus === "failed_capped" ? (
          <Banner
            tone="destructive"
            icon={<XCircle className="h-5 w-5" />}
            title="Attempt limit reached"
            body="You've used all available attempts. Your trainer can review and reset if needed."
          />
        ) : null}
        {effectiveStatus === "passed" && !submitted ? (
          <Banner
            tone="success"
            icon={<Trophy className="h-5 w-5" />}
            title="You've already passed this test"
            body="Your last attempt met the pass mark. No further action required."
          />
        ) : null}

        {submitted && resultScore !== null ? (
          <Card
            className={cn(
              "flex items-center gap-3 rounded-xl p-4 shadow-soft",
              resultPassed
                ? "border-primary/40 bg-accent"
                : "border-destructive/40 bg-destructive/5",
            )}
          >
            <Trophy
              className={cn("h-5 w-5", resultPassed ? "text-primary" : "text-destructive")}
            />
            <div className="flex-1">
              <div className="text-[13px] font-semibold">
                {resultPassed ? "Passed" : "Did not pass"} — auto-graded MCQ score {resultScore}%
              </div>
              <div className="text-[11px] text-muted-foreground">
                Subjective answers will be reviewed by your trainer. Pass mark{" "}
                {assessment?.pass_mark}%.
              </div>
            </div>
          </Card>
        ) : null}

        {/* Pre-start CTA */}
        {!started && !submitted ? (
          <Card className="rounded-xl border-border p-6 shadow-soft">
            <div className="flex items-start gap-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Hourglass className="h-5 w-5" />
              </div>
              <div className="flex-1 space-y-1.5">
                <h2 className="text-[15px] font-semibold">Ready when you are</h2>
                <p className="text-[12.5px] text-muted-foreground">
                  Once you start, the timer continues to count down. Answer all questions and
                  submit before the window closes.
                </p>
                <div className="pt-2">
                  <Button
                    onClick={() => startAttempt.mutate()}
                    disabled={!canStart || startAttempt.isPending}
                    className="gap-2"
                  >
                    <PlayCircle className="h-4 w-4" />
                    {startAttempt.isPending ? "Starting…" : "Start test"}
                  </Button>
                </div>
              </div>
            </div>
          </Card>
        ) : null}

        {/* Question list */}
        {started && !submitted ? (
          <div className="space-y-3">
            {questions.map((q, i) => {
              const userAns = answers[q.id] ?? "";
              return (
                <Card key={q.id} className="rounded-xl border-border p-5 shadow-soft">
                  <div className="flex items-start gap-3">
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-[11px] font-semibold text-primary">
                      {i + 1}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Badge variant="outline" className="rounded-md text-[10px]">
                          {q.topic || "General"}
                        </Badge>
                        <Badge variant="outline" className="rounded-md text-[10px]">
                          {q.difficulty}
                        </Badge>
                        <Badge variant="outline" className="rounded-md text-[10px]">
                          {q.type === "mcq" ? "Multiple choice" : "Subjective"}
                        </Badge>
                      </div>
                      <p className="mt-2 text-[14px] font-medium">{q.prompt}</p>

                      {q.type === "mcq" && q.options ? (
                        <RadioGroup
                          value={userAns}
                          onValueChange={(v) => setAnswers((a) => ({ ...a, [q.id]: v }))}
                          className="mt-3 space-y-1.5"
                        >
                          {q.options.map((opt, j) => {
                            const letter = String.fromCharCode(65 + j);
                            return (
                              <label
                                key={j}
                                className="flex cursor-pointer items-start gap-2 rounded-md border border-border p-2.5 text-[13px] transition-colors hover:bg-muted/50"
                              >
                                <RadioGroupItem
                                  value={opt}
                                  id={`${q.id}-${j}`}
                                  className="mt-0.5"
                                />
                                <span className="flex-1">
                                  <span className="font-semibold text-muted-foreground">
                                    {letter}.
                                  </span>{" "}
                                  {opt}
                                </span>
                              </label>
                            );
                          })}
                        </RadioGroup>
                      ) : (
                        <Textarea
                          value={userAns}
                          onChange={(e) =>
                            setAnswers((a) => ({ ...a, [q.id]: e.target.value }))
                          }
                          placeholder="Type your answer…"
                          className="mt-3 min-h-24 rounded-md text-[13px]"
                        />
                      )}
                    </div>
                  </div>
                </Card>
              );
            })}

            <div className="sticky bottom-4 z-10 flex items-center justify-between gap-3 rounded-xl border border-border bg-card/95 p-3 shadow-soft backdrop-blur">
              <div className="text-[11.5px] text-muted-foreground">
                {isExpiredByTime ? (
                  <span className="font-medium text-destructive">Time expired — submissions frozen.</span>
                ) : (
                  <>{Object.keys(answers).length}/{questions.length} answered</>
                )}
              </div>
              <Button
                onClick={() => submitAttempt.mutate()}
                disabled={submitAttempt.isPending || isExpiredByTime}
                className="gap-2"
              >
                <CheckCircle2 className="h-4 w-4" />
                {isExpiredByTime
                  ? "Frozen"
                  : submitAttempt.isPending
                    ? "Submitting…"
                    : "Submit test"}
              </Button>
            </div>
          </div>
        ) : null}
      </main>
    </div>
  );
}

function formatRemaining(ms: number) {
  if (ms <= 0) return "00:00:00";
  const totalSec = Math.floor(ms / 1000);
  const d = Math.floor(totalSec / 86400);
  const h = Math.floor((totalSec % 86400) / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  if (d > 0) return `${d}d ${pad(h)}:${pad(m)}:${pad(s)}`;
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

function CountdownPill({
  remainingMs,
  status,
}: {
  remainingMs: number;
  status: AssignmentStatus;
}) {
  const urgent = remainingMs > 0 && remainingMs < 1000 * 60 * 60; // < 1h
  const done = status === "passed" || status === "failed_capped";
  if (done) {
    return (
      <div className="inline-flex items-center gap-1.5 rounded-md border border-border bg-muted px-2.5 py-1 text-[11.5px] text-muted-foreground">
        <CheckCircle2 className="h-3.5 w-3.5" />
        Closed
      </div>
    );
  }
  return (
    <div
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-[11.5px] font-medium tabular-nums",
        remainingMs === 0
          ? "border-destructive/40 bg-destructive/10 text-destructive"
          : urgent
            ? "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400"
            : "border-border bg-card text-foreground",
      )}
    >
      <Clock className="h-3.5 w-3.5" />
      {remainingMs === 0 ? "Time expired" : `Closes in ${formatRemaining(remainingMs)}`}
    </div>
  );
}

function StatusBadge({ status }: { status: AssignmentStatus }) {
  const map: Record<AssignmentStatus, { label: string; cls: string }> = {
    assigned: { label: "Assigned", cls: "bg-white/15 text-primary-foreground" },
    in_progress: { label: "In progress", cls: "bg-amber-500/20 text-amber-100" },
    passed: { label: "Passed", cls: "bg-emerald-500/25 text-emerald-50" },
    failed_capped: { label: "Failed (capped)", cls: "bg-red-500/25 text-red-50" },
    expired: { label: "Expired", cls: "bg-red-500/25 text-red-50" },
  };
  const s = map[status];
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-medium",
        s.cls,
      )}
    >
      {s.label}
    </span>
  );
}

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-md bg-white/15 px-2 py-0.5 font-medium">
      {children}
    </span>
  );
}

function Banner({
  tone,
  icon,
  title,
  body,
}: {
  tone: "success" | "destructive";
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <Card
      className={cn(
        "flex items-start gap-3 rounded-xl p-4 shadow-soft",
        tone === "success"
          ? "border-primary/40 bg-accent"
          : "border-destructive/40 bg-destructive/5",
      )}
    >
      <div className={tone === "success" ? "text-primary" : "text-destructive"}>{icon}</div>
      <div className="flex-1">
        <div className="text-[13px] font-semibold">{title}</div>
        <div className="text-[11.5px] text-muted-foreground">{body}</div>
      </div>
    </Card>
  );
}
