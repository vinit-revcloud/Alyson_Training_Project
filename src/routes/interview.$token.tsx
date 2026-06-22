import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  CheckCircle2,
  Clock,
  Hourglass,
  Loader2,
  Monitor,
  PlayCircle,
  Sparkles,
  Video,
} from "lucide-react";
import {
  confirmInterviewIdentityFn,
  getInterviewQuestionsFn,
  getInterviewSessionByTokenFn,
  logInterviewEventFn,
  saveInterviewDraftAnswersFn,
  startInterviewAttemptFn,
  submitInterviewAttemptFn,
} from "@/lib/interview/interview.functions";
import type { PublicInterviewState } from "@/lib/interview/interview.shared";
import type { LearnerQuestion } from "@/lib/attempt.functions";
import {
  alignAnswerKeys,
  clearLocalInterviewDraft,
  loadLocalInterviewDraft,
  mergeDraftAnswers,
  saveLocalInterviewDraft,
} from "@/lib/interview/interview-draft.shared";
import { INTERVIEW_CANDIDATE_POLL_MS, INTERVIEW_POLL_OPTS } from "@/lib/query-options";

const tokenParamsSchema = z.object({ token: z.string().min(16).max(128) });

export const Route = createFileRoute("/interview/$token")({
  params: tokenParamsSchema,
  head: () => ({ meta: [{ title: "Interview Test — Alyson" }] }),
  component: InterviewCandidatePage,
});

type Phase = "confirm" | "waiting" | "test" | "done";

function getPhase(state: PublicInterviewState, identityConfirmed: boolean): Phase {
  if (state.status === "submitted" || state.status === "evaluating" || state.status === "evaluated") {
    return "done";
  }
  if (state.status === "in_progress") return "test";
  if (state.status === "scheduled" || (!identityConfirmed && state.status !== "waiting")) {
    return "confirm";
  }
  return "waiting";
}

function InterviewCandidatePage() {
  const { token } = Route.useParams();
  const qc = useQueryClient();

  const fetchState = useServerFn(getInterviewSessionByTokenFn);
  const { data: state, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["interview-state", token],
    queryFn: () => fetchState({ data: { token } }),
    refetchInterval: (q) => {
      const s = q.state.data?.status;
      if (s === "waiting" || s === "opened" || s === "scheduled" || s === "in_progress") {
        return INTERVIEW_CANDIDATE_POLL_MS;
      }
      return false;
    },
    ...INTERVIEW_POLL_OPTS,
  });

  const [identityConfirmed, setIdentityConfirmed] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");

  const phase = state ? getPhase(state, identityConfirmed) : "confirm";

  useEffect(() => {
    const identityDone = ["waiting", "opened", "in_progress", "submitted", "evaluating", "evaluated"];
    if (state && identityDone.includes(state.status)) {
      setIdentityConfirmed(true);
    }
  }, [state?.status]);

  const openedToastShown = useRef(false);
  useEffect(() => {
    if (state?.status === "opened" && phase === "waiting" && !openedToastShown.current) {
      openedToastShown.current = true;
      toast.info("HR has opened your test — click Start test when you're ready.");
    }
  }, [state?.status, phase]);
  const confirmFn = useServerFn(confirmInterviewIdentityFn);
  const confirm = useMutation({
    mutationFn: () => confirmFn({ data: { token, name, email } }),
    onSuccess: () => {
      setIdentityConfirmed(true);
      qc.invalidateQueries({ queryKey: ["interview-state", token] });
      toast.success("Identity confirmed — please wait for HR to open the test.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (isError || !state) {
    const msg = error instanceof Error ? error.message : "";
    const invalidLink = msg.includes("Invalid or expired") || (!isError && !state);
    if (invalidLink) {
      return (
        <div className="mx-auto max-w-lg px-5 py-16 text-center">
          <h1 className="text-lg font-semibold">Invalid link</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            This interview link is invalid or has expired. Contact HR for a new invitation.
          </p>
        </div>
      );
    }
    return (
      <div className="mx-auto max-w-lg px-5 py-16 text-center">
        <h1 className="text-lg font-semibold">Connection problem</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          We could not reach the interview server. Check your connection and try again.
        </p>
        <Button variant="outline" size="sm" className="mt-4" onClick={() => void refetch()}>
          Retry
        </Button>
      </div>
    );
  }

  if (state.status === "expired" || state.status === "cancelled") {
    return (
      <div className="mx-auto max-w-lg px-5 py-16 text-center">
        <h1 className="text-lg font-semibold">Session {state.status}</h1>
        <p className="mt-2 text-sm text-muted-foreground">Contact HR if you need assistance.</p>
      </div>
    );
  }

  if (phase === "confirm") {
    return (
      <ConfirmStep
        state={state}
        name={name}
        email={email}
        setName={setName}
        setEmail={setEmail}
        onConfirm={() => confirm.mutate()}
        pending={confirm.isPending}
      />
    );
  }

  if (phase === "waiting") {
    return <WaitingStep state={state} token={token} qc={qc} />;
  }

  if (phase === "test") {
    return <TestStep token={token} state={state} qc={qc} />;
  }

  return <DoneStep state={state} />;
}

function ConfirmStep({
  state,
  name,
  email,
  setName,
  setEmail,
  onConfirm,
  pending,
}: {
  state: PublicInterviewState;
  name: string;
  email: string;
  setName: (v: string) => void;
  setEmail: (v: string) => void;
  onConfirm: () => void;
  pending: boolean;
}) {
  return (
    <div className="min-h-dvh bg-background">
      <main className="mx-auto max-w-md space-y-6 px-5 py-10">
        <Card className="overflow-hidden rounded-2xl border-border p-6 shadow-soft">
          <div className="flex items-center gap-2 text-[10px] font-medium uppercase tracking-[0.22em] text-muted-foreground">
            <Sparkles className="h-3 w-3" />
            Interview assessment
          </div>
          <h1 className="mt-2 font-display text-xl">{state.assessment_title}</h1>
          <p className="mt-2 text-[13px] text-muted-foreground">
            Scheduled for {new Date(state.scheduled_at).toLocaleString()}. Confirm your identity to
            enter the waiting room. HR will open the test during your video call.
          </p>
          <div className="mt-5 space-y-3">
            <div>
              <label className="text-[12px] font-medium">Full name</label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="As on your invitation"
                className="mt-1"
              />
            </div>
            <div>
              <label className="text-[12px] font-medium">Email</label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="As on your invitation"
                className="mt-1"
              />
            </div>
            <Button
              className="w-full"
              disabled={!name.trim() || !email.trim() || pending}
              onClick={onConfirm}
            >
              {pending ? "Confirming…" : "Confirm & continue"}
            </Button>
          </div>
        </Card>
      </main>
    </div>
  );
}

function WaitingStep({
  state,
  token,
  qc,
}: {
  state: PublicInterviewState;
  token: string;
  qc: ReturnType<typeof useQueryClient>;
}) {
  const runStart = useServerFn(startInterviewAttemptFn);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const scheduledMs = new Date(state.scheduled_at).getTime();
  const untilScheduledMs = scheduledMs - now;
  const isPastScheduled = !Number.isNaN(scheduledMs) && untilScheduledMs <= 0;
  const unlocked = state.status === "opened" || state.status === "in_progress";
  // HR clicking "Open test" is the go signal — do not block on scheduled_at
  const canStart = unlocked;

  const start = useMutation({
    mutationFn: () => runStart({ data: { token } }),
    onSuccess: (res) => {
      if (res.state) {
        qc.setQueryData(["interview-state", token], res.state);
      } else {
        qc.invalidateQueries({ queryKey: ["interview-state", token] });
      }
      toast.success("Test started — good luck!");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const formatCountdown = (ms: number) => {
    if (ms <= 0) return "Now";
    const totalSec = Math.ceil(ms / 1000);
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    if (m >= 60) {
      const h = Math.floor(m / 60);
      return `${h}h ${m % 60}m`;
    }
    return `${m}:${String(s).padStart(2, "0")}`;
  };

  return (
    <div className="min-h-dvh bg-background">
      <main className="mx-auto max-w-lg space-y-5 px-5 py-10">
        <Card className="rounded-2xl border-border p-6 shadow-soft">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
              {canStart ? (
                <PlayCircle className="h-6 w-6" />
              ) : (
                <Hourglass className="h-6 w-6 animate-pulse" />
              )}
            </div>
            <div>
              <h1 className="text-lg font-semibold">
                {canStart ? "Start your test" : unlocked ? "Almost ready" : "Waiting room"}
              </h1>
              <p className="text-[12px] text-muted-foreground">Hi {state.candidate_name}</p>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <Badge variant="outline" className="text-[11px]">
              Status: {state.status.replace("_", " ")}
            </Badge>
            <Badge variant="outline" className="text-[11px]">
              <Clock className="mr-1 h-3 w-3" />
              Scheduled {new Date(state.scheduled_at).toLocaleString()}
            </Badge>
            <Badge variant="outline" className="text-[11px]">
              {state.question_count} questions · ~{state.duration_min} min
            </Badge>
          </div>

          <div className="mt-5 space-y-3 rounded-lg border border-border bg-muted/30 p-4 text-[13px]">
            <div className="flex gap-2">
              <Video className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <p>
                Join your video call with HR and <strong>share your screen</strong>. Stay on this
                page.
              </p>
            </div>
            <div className="flex gap-2">
              <Monitor className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <p>
                {!unlocked
                  ? !isPastScheduled
                    ? `Scheduled for ${new Date(state.scheduled_at).toLocaleString()}. HR will unlock the test when your call begins.`
                    : "You're on time — waiting for HR to click Open test on their screen."
                  : "HR has opened your test. Click Start test below when they confirm you're ready."}
              </p>
            </div>
          </div>

          {!unlocked ? (
            <div className="mt-4 flex items-center gap-2 text-[12px] text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Waiting for HR to open the test…
              {!isPastScheduled ? (
                <span className="text-amber-700">({formatCountdown(untilScheduledMs)} until scheduled time)</span>
              ) : null}
            </div>
          ) : (
            <Button
              className="mt-4 w-full gap-2"
              size="lg"
              onClick={() => start.mutate()}
              disabled={start.isPending}
            >
              <PlayCircle className="h-4 w-4" />
              {start.isPending ? "Starting…" : "Start test"}
            </Button>
          )}
        </Card>
      </main>
    </div>
  );
}

function TestStep({
  token,
  state,
  qc,
}: {
  token: string;
  state: PublicInterviewState;
  qc: ReturnType<typeof useQueryClient>;
}) {
  const fetchQuestions = useServerFn(getInterviewQuestionsFn);
  const saveDraftFn = useServerFn(saveInterviewDraftAnswersFn);
  const logEvent = useServerFn(logInterviewEventFn);
  const submitFn = useServerFn(submitInterviewAttemptFn);

  const { data: questionPayload, isLoading, isError: questionsError, refetch: refetchQuestions } = useQuery({
    queryKey: ["interview-questions", token],
    queryFn: () => fetchQuestions({ data: { token } }),
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
  const questions = questionPayload?.questions ?? [];

  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [answersLoaded, setAnswersLoaded] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const autoSubmitTriggered = useRef(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hydratedRef = useRef(false);
  const answersRef = useRef(answers);
  answersRef.current = answers;

  useEffect(() => {
    if (!questionPayload || hydratedRef.current) return;
    hydratedRef.current = true;

    const qIds = questionPayload.questions.map((q) => q.id);
    const aliases = questionPayload.answerKeyAliases ?? {};
    const merged = mergeDraftAnswers(
      alignAnswerKeys(loadLocalInterviewDraft(token), qIds, aliases),
      alignAnswerKeys(questionPayload.savedAnswers ?? {}, qIds, aliases),
    );
    setAnswers(merged);
    setAnswersLoaded(true);
  }, [questionPayload, token]);

  useEffect(() => {
    if (!answersLoaded || submitted || !questions.length) return;
    const aliases = questionPayload?.answerKeyAliases ?? {};
    setAnswers((prev) => {
      const aligned = alignAnswerKeys(
        prev,
        questions.map((q) => q.id),
        aliases,
      );
      return JSON.stringify(aligned) === JSON.stringify(prev) ? prev : aligned;
    });
  }, [questions, questionPayload?.answerKeyAliases, answersLoaded, submitted]);

  const testDurationMs = (state.duration_min ?? 45) * 60 * 1000;
  const testEndsMs = useMemo(() => {
    const startMs = state.attempt_started_at
      ? new Date(state.attempt_started_at).getTime()
      : Date.now();
    return startMs + testDurationMs;
  }, [state.attempt_started_at, state.duration_min]);

  const remainingMs = Math.max(0, testEndsMs - now);
  const timeUp = remainingMs === 0;

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!answersLoaded || submitted) return;
    saveLocalInterviewDraft(token, answers);
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      saveDraftFn({ data: { token, answers: answersRef.current } }).catch((err) => {
        console.warn("[interview] draft autosave failed", err);
      });
    }, 1500);
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [answers, answersLoaded, submitted, token, saveDraftFn]);

  useEffect(() => {
    const flushDraft = () => {
      if (!answersLoaded || submitted) return;
      const current = answersRef.current;
      saveLocalInterviewDraft(token, current);
      saveDraftFn({ data: { token, answers: current } }).catch(() => {});
    };
    window.addEventListener("pagehide", flushDraft);
    return () => window.removeEventListener("pagehide", flushDraft);
  }, [answersLoaded, submitted, token, saveDraftFn]);

  useEffect(() => {
    const onVis = () => {
      if (document.hidden) {
        logEvent({ data: { token, type: "tab_hidden" } }).catch(() => {});
      } else {
        logEvent({ data: { token, type: "tab_visible" } }).catch(() => {});
      }
    };
    const onBlur = () => {
      logEvent({ data: { token, type: "window_blur" } }).catch(() => {});
    };
    const onFocus = () => {
      logEvent({ data: { token, type: "window_focus" } }).catch(() => {});
    };
    const onFullscreen = () => {
      if (!document.fullscreenElement) {
        logEvent({ data: { token, type: "fullscreen_exit" } }).catch(() => {});
      }
    };
    const onPageHide = () => {
      logEvent({ data: { token, type: "page_hide" } }).catch(() => {});
    };
    logEvent({ data: { token, type: "test_resumed" } }).catch(() => {});
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("blur", onBlur);
    window.addEventListener("focus", onFocus);
    document.addEventListener("fullscreenchange", onFullscreen);
    window.addEventListener("pagehide", onPageHide);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("fullscreenchange", onFullscreen);
      window.removeEventListener("pagehide", onPageHide);
    };
  }, [token, logEvent]);

  const submit = useMutation({
    mutationFn: () => submitFn({ data: { token, answers } }),
    onSuccess: () => {
      setSubmitted(true);
      clearLocalInterviewDraft(token);
      qc.invalidateQueries({ queryKey: ["interview-state", token] });
      toast.success("Test submitted — thank you!");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  useEffect(() => {
    if (timeUp && !submitted && !submit.isPending && !autoSubmitTriggered.current) {
      autoSubmitTriggered.current = true;
      toast.warning("Time is up — submitting your answers.");
      submit.mutate();
    }
  }, [timeUp, submitted, submit.isPending]);

  const formatRemaining = (ms: number) => {
    const s = Math.floor(ms / 1000);
    const m = Math.floor(s / 60);
    const h = Math.floor(m / 60);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${pad(h)}:${pad(m % 60)}:${pad(s % 60)}`;
  };

  if (submitted) {
    return <DoneStep state={state} />;
  }

  if (questionsError) {
    return (
      <div className="mx-auto max-w-lg px-5 py-16 text-center">
        <h1 className="text-lg font-semibold">Could not load questions</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Ask HR to verify the assessment, then try again.
        </p>
        <Button variant="outline" size="sm" className="mt-4" onClick={() => void refetchQuestions()}>
          Retry
        </Button>
      </div>
    );
  }

  if (isLoading || !answersLoaded) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (questions.length === 0) {
    return (
      <div className="mx-auto max-w-lg px-5 py-16 text-center">
        <p className="text-sm text-muted-foreground">
          No questions loaded. Ask HR to verify the assessment has questions saved.
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-background">
      <header className="border-b border-border bg-card/80 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-5 py-3">
          <span className="text-[12.5px] font-medium">{state.assessment_title}</span>
          <div
            className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-[11.5px] tabular-nums ${
              timeUp ? "border-rose-200 bg-rose-50 text-rose-700" : "border-border"
            }`}
          >
            <Clock className="h-3.5 w-3.5" />
            {timeUp ? "Time's up" : formatRemaining(remainingMs)}
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-3xl space-y-3 px-5 py-6">
        {questions.map((q, i) => (
          <QuestionCard
            key={q.id}
            q={q}
            index={i}
            value={answers[q.id] ?? ""}
            onChange={(v) => setAnswers((a) => ({ ...a, [q.id]: v }))}
          />
        ))}
        <div className="sticky bottom-4 flex justify-end">
          <Button
            className="gap-2"
            disabled={submit.isPending || timeUp}
            onClick={() => submit.mutate()}
          >
            <CheckCircle2 className="h-4 w-4" />
            {submit.isPending ? "Submitting…" : timeUp ? "Submitting…" : "Submit test"}
          </Button>
        </div>
      </main>
    </div>
  );
}

function QuestionCard({
  q,
  index,
  value,
  onChange,
}: {
  q: LearnerQuestion;
  index: number;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <Card
      className="rounded-xl border-border p-5 shadow-soft select-none"
      onCopy={(e) => e.preventDefault()}
      onCut={(e) => e.preventDefault()}
    >
      <div className="flex items-start gap-3">
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-[11px] font-semibold text-primary">
          {index + 1}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap gap-1.5">
            <Badge variant="outline" className="text-[10px]">
              {q.topic || "General"}
            </Badge>
            <Badge variant="outline" className="text-[10px]">
              {q.difficulty}
            </Badge>
          </div>
          <p className="mt-2 text-[14px] font-medium">{q.prompt}</p>
          {q.type === "mcq" && q.options ? (
            <RadioGroup value={value} onValueChange={onChange} className="mt-3 space-y-1.5">
              {q.options.map((opt, j) => (
                <label
                  key={j}
                  className="flex cursor-pointer items-start gap-2 rounded-md border border-border p-2.5 text-[13px] hover:bg-muted/50"
                >
                  <RadioGroupItem value={opt} className="mt-0.5" />
                  <span>{opt}</span>
                </label>
              ))}
            </RadioGroup>
          ) : (
            <Textarea
              value={value}
              onChange={(e) => onChange(e.target.value)}
              className="mt-3 min-h-24 text-[13px]"
              placeholder="Type your answer…"
            />
          )}
        </div>
      </div>
    </Card>
  );
}

function DoneStep({ state }: { state: PublicInterviewState }) {
  const message =
    state.status === "evaluated"
      ? "Your responses have been submitted and reviewed. HR will follow up with next steps."
      : state.status === "evaluating"
        ? "Your test has been submitted and is being evaluated. HR will follow up after review."
        : "Your responses have been submitted. HR will follow up after review.";

  return (
    <div className="flex min-h-dvh items-center justify-center bg-background px-5">
      <Card className="max-w-md rounded-2xl p-8 text-center shadow-soft">
        <CheckCircle2 className="mx-auto h-12 w-12 text-primary" />
        <h1 className="mt-4 text-xl font-semibold">Thank you, {state.candidate_name}</h1>
        <p className="mt-2 text-[13px] text-muted-foreground">
          {message}
        </p>
        <p className="mt-2 text-[12px] text-muted-foreground">
          <strong>{state.assessment_title}</strong>
        </p>
      </Card>
    </div>
  );
}
