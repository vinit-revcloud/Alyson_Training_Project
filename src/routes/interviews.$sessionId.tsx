import { createFileRoute, Link, notFound, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { QueryLoadError } from "@/components/admin/QueryLoadError";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import {
  ArrowLeft,
  Award,
  ClipboardList,
  Copy,
  ExternalLink,
  Loader2,
  Mail,
  PlayCircle,
  RefreshCw,
  Sparkles,
  Trash2,
  User,
  XCircle,
} from "lucide-react";
import {
  cancelInterviewSessionFn,
  deleteInterviewSessionFn,
  generateInterviewProfileFn,
  getInterviewSessionDetailFn,
  getInterviewSubmissionRecordFn,
  openInterviewSessionFn,
  rerunInterviewEvaluationFn,
  resendInterviewInviteFn,
  appendInterviewHrNoteFn,
  getInterviewAuditBundleFn,
  addInterviewSupportingScoreFn,
  flagInterviewQuestionFn,
  refreshInterviewAssessmentVersionFn,
  updateInterviewProctorNotesFn,
} from "@/lib/interview/interview.functions";
import type { AiEvaluation, HireRecommendation } from "@/lib/interview/interview.shared";
import { ASSESSMENT_MODE_LABELS } from "@/lib/interview/interview.shared";
import { resolveAiEvaluation } from "@/lib/interview/interview.shared";
import {
  InPersonFlowPanel,
  PaperTestPanel,
  ProfileReportPanel,
} from "@/components/interview/InterviewExtendedPanels";
import { cn } from "@/lib/utils";
import { InterviewGuide } from "@/components/hiring/InterviewGuide";
import { useSession } from "@/lib/auth";
import { isExecutiveReadOnly } from "@/lib/role-access";
import {
  INTERVIEW_POLL_OPTS,
  INTERVIEW_SESSION_EVAL_POLL_MS,
  INTERVIEW_SESSION_LIVE_POLL_MS,
} from "@/lib/query-options";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

const sessionParamsSchema = z.object({ sessionId: z.string().uuid() });

export const Route = createFileRoute("/interviews/$sessionId")({
  params: sessionParamsSchema,
  head: () => ({ meta: [{ title: "Interview session — Alyson" }] }),
  component: InterviewSessionPage,
});

const REC_LABEL: Record<HireRecommendation, string> = {
  strong_hire: "Strong hire",
  hire: "Hire",
  borderline: "Borderline",
  no_hire: "No hire",
};

const REC_STYLE: Record<HireRecommendation, string> = {
  strong_hire: "border-emerald-300 bg-emerald-50 text-emerald-800",
  hire: "border-green-200 bg-green-50 text-green-700",
  borderline: "border-amber-200 bg-amber-50 text-amber-800",
  no_hire: "border-rose-200 bg-rose-50 text-rose-700",
};

function InterviewSessionPage() {
  const { sessionId } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { roles } = useSession();
  const readOnly = isExecutiveReadOnly(roles);
  const fetchDetail = useServerFn(getInterviewSessionDetailFn);
  const fetchSubmission = useServerFn(getInterviewSubmissionRecordFn);

  const {
    data: session,
    isLoading,
    isError: sessionError,
    error: sessionErr,
    refetch: refetchSession,
  } = useQuery({
    queryKey: ["interview-session", sessionId],
    queryFn: () => fetchDetail({ data: { sessionId } }),
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      if (!status || status === "evaluated" || status === "cancelled" || status === "expired") {
        return false;
      }
      if (status === "submitted" || status === "evaluating") return INTERVIEW_SESSION_EVAL_POLL_MS;
      if (status === "waiting" || status === "opened" || status === "in_progress") {
        return INTERVIEW_SESSION_LIVE_POLL_MS;
      }
      return false;
    },
    staleTime: 10_000,
    ...INTERVIEW_POLL_OPTS,
  });

  const hasRecord =
    !!session &&
    session.assessment_mode !== "paper_only" &&
    ["submitted", "evaluating", "evaluated"].includes(session.status);

  const { data: submission, isLoading: submissionLoading, isError: submissionError } = useQuery({
    queryKey: ["interview-submission", sessionId],
    queryFn: () => fetchSubmission({ data: { sessionId } }),
    enabled: hasRecord,
    refetchInterval: session?.status === "evaluated" ? false : INTERVIEW_SESSION_EVAL_POLL_MS,
    ...INTERVIEW_POLL_OPTS,
  });

  const [notes, setNotes] = useState("");
  const [hrNoteBody, setHrNoteBody] = useState("");
  const [supportLabel, setSupportLabel] = useState("Paper test");
  const [supportScore, setSupportScore] = useState("");
  const [magicLink, setMagicLink] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("profile");

  useEffect(() => {
    if (session) setNotes(session.proctor_notes ?? "");
  }, [session?.id, session?.proctor_notes]);

  const loadAudit = useServerFn(getInterviewAuditBundleFn);
  const audit = useQuery({
    queryKey: ["interview-audit", sessionId],
    queryFn: () => loadAudit({ data: { sessionId } }),
    enabled: !!session,
  });

  const evaluation = session ? resolveAiEvaluation(session.ai_evaluation) : null;
  const profileGenAttempted = useRef(false);

  const generateProfileFn = useServerFn(generateInterviewProfileFn);
  const generateProfile = useMutation({
    mutationFn: () => generateProfileFn({ data: { sessionId } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["interview-session", sessionId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  useEffect(() => {
    if (readOnly || !session || profileGenAttempted.current) return;
    if (evaluation?.profile_dimensions?.length) return;
    if (!["submitted", "evaluating", "evaluated"].includes(session.status)) return;
    if (!evaluation) return;
    profileGenAttempted.current = true;
    generateProfile.mutate();
  }, [session?.id, session?.status, evaluation?.profile_dimensions?.length, evaluation?.weighted_score]);

  useEffect(() => {
    if (!session) return;
    if (session.assessment_mode === "paper_only") {
      setActiveTab(session.status === "evaluated" ? "profile" : "paper");
      return;
    }
    if (evaluation?.profile_dimensions?.length) setActiveTab("profile");
    else if (["submitted", "evaluating", "evaluated"].includes(session.status)) setActiveTab("profile");
  }, [session?.id, session?.assessment_mode, evaluation?.profile_dimensions?.length, session?.status]);

  const openFn = useServerFn(openInterviewSessionFn);
  const open = useMutation({
    mutationFn: () => openFn({ data: { sessionId } }),
    onSuccess: () => {
      toast.success("Test opened — tell the candidate to click Start test.");
      qc.invalidateQueries({ queryKey: ["interview-session", sessionId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const resendFn = useServerFn(resendInterviewInviteFn);
  const resend = useMutation({
    mutationFn: () => resendFn({ data: { sessionId } }),
    onSuccess: (res) => {
      setMagicLink(res.magicLink);
      if (res.emailSent) {
        toast.success("New invite link generated and email queued.");
      } else {
        toast.warning(
          res.emailError
            ? `Link copied below — email failed: ${res.emailError}`
            : "Link regenerated — copy it below (email may not have sent).",
        );
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const saveNotesFn = useServerFn(updateInterviewProctorNotesFn);
  const saveNotes = useMutation({
    mutationFn: () => saveNotesFn({ data: { sessionId, notes } }),
    onSuccess: () => toast.success("Notes saved"),
    onError: (e: Error) => toast.error(e.message),
  });

  const cancelFn = useServerFn(cancelInterviewSessionFn);
  const cancel = useMutation({
    mutationFn: () => cancelFn({ data: { sessionId } }),
    onSuccess: () => {
      toast.success("Session cancelled");
      qc.invalidateQueries({ queryKey: ["interview-session", sessionId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const handleCancel = () => {
    if (!window.confirm("Cancel this interview session? The candidate will no longer be able to take the test.")) {
      return;
    }
    cancel.mutate();
  };

  const deleteFn = useServerFn(deleteInterviewSessionFn);
  const remove = useMutation({
    mutationFn: () => deleteFn({ data: { sessionId } }),
    onSuccess: () => {
      toast.success("Interview session deleted");
      qc.invalidateQueries({ queryKey: ["interview-sessions"] });
      void navigate({ to: "/interviews" });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rerunFn = useServerFn(rerunInterviewEvaluationFn);
  const rerun = useMutation({
    mutationFn: () => rerunFn({ data: { sessionId } }),
    onSuccess: () => {
      toast.success("Evaluation complete");
      qc.invalidateQueries({ queryKey: ["interview-session", sessionId] });
      qc.invalidateQueries({ queryKey: ["interview-submission", sessionId] });
      qc.invalidateQueries({ queryKey: ["interview-sessions"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const handleGenerateProfile = () => {
    if (evaluation?.weighted_score != null) {
      generateProfile.mutate();
      return;
    }
    rerun.mutate();
  };

  const profileGenerating =
    generateProfile.isPending || rerun.isPending || session?.status === "evaluating";

  const appendNoteFn = useServerFn(appendInterviewHrNoteFn);
  const appendNote = useMutation({
    mutationFn: () => appendNoteFn({ data: { sessionId, body: hrNoteBody } }),
    onSuccess: () => {
      setHrNoteBody("");
      toast.success("HR note added");
      qc.invalidateQueries({ queryKey: ["interview-audit", sessionId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const addSupportFn = useServerFn(addInterviewSupportingScoreFn);
  const addSupport = useMutation({
    mutationFn: () =>
      addSupportFn({
        data: {
          sessionId,
          scoreType: "paper_test",
          label: supportLabel,
          score: supportScore ? Number(supportScore) : null,
        },
      }),
    onSuccess: () => {
      setSupportScore("");
      toast.success("Supporting score recorded");
      qc.invalidateQueries({ queryKey: ["interview-audit", sessionId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const flagQuestionFn = useServerFn(flagInterviewQuestionFn);
  const flagQuestion = useMutation({
    mutationFn: (input: { questionId: string; reason: string }) =>
      flagQuestionFn({ data: { sessionId, ...input } }),
    onSuccess: () => {
      toast.success("Question flagged");
      qc.invalidateQueries({ queryKey: ["interview-audit", sessionId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const refreshVersionFn = useServerFn(refreshInterviewAssessmentVersionFn);
  const refreshVersion = useMutation({
    mutationFn: () => refreshVersionFn({ data: { sessionId } }),
    onSuccess: () => {
      toast.success("Assessment version updated to latest");
      qc.invalidateQueries({ queryKey: ["interview-session", sessionId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) {
    return (
      <AdminLayout title="Interview">
        <div className="flex justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </AdminLayout>
    );
  }

  if (sessionError) {
    return (
      <AdminLayout title="Interview">
        <QueryLoadError
          message={
            sessionErr instanceof Error ? sessionErr.message : "Failed to load interview session"
          }
          onRetry={() => void refetchSession()}
        />
        <Button asChild className="mt-4" variant="outline">
          <Link to="/interviews">Back to interviews</Link>
        </Button>
      </AdminLayout>
    );
  }

  if (!session) throw notFound();

  const answers = submission?.answers ?? [];
  const isPaperOnly = session.assessment_mode === "paper_only";
  const isHybrid = session.assessment_mode === "hybrid";
  const canOpen = !isPaperOnly && ["waiting", "opened"].includes(session.status);
  const effectiveScore =
    session.final_score != null
      ? Number(session.final_score)
      : evaluation?.weighted_score ?? null;
  const live = ["waiting", "opened", "in_progress"].includes(session.status);
  const questionCount = session.question_count ?? 0;
  const answeredCount = answers.filter((a) => a.answer.trim().length > 0).length;
  const mcqCorrect = answers.filter((a) => a.type === "mcq" && a.is_correct).length;
  const mcqTotal = answers.filter((a) => a.type === "mcq").length;

  const showProfileSection = ["submitted", "evaluating", "evaluated"].includes(session.status);

  const candidateStatusHint = isPaperOnly
    ? session.status === "evaluated"
      ? "Paper test graded — review results in the tabs below."
      : "Upload paper photos in the Paper test tab, then run AI grading."
    : session.status === "scheduled"
      ? "Candidate has not confirmed identity yet."
      : session.status === "waiting"
        ? "Candidate is in the waiting room — click Open test when the call starts."
        : session.status === "opened"
          ? "Test is open — candidate can click Start test."
          : session.status === "in_progress"
            ? "Candidate is taking the test now."
            : null;

  return (
    <AdminLayout
      title={session.candidate_name}
      subtitle={`${session.assessment_title} · ${session.role}`}
    >
      <Link
        to="/interviews"
        className="mb-4 inline-flex items-center gap-1.5 text-[12.5px] text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        All interviews
      </Link>

      <InterviewGuide variant="session" className="mb-4" />

      {readOnly ? (
        <Card className="mb-4 rounded-xl border-border bg-muted/30 p-3 text-[12.5px] text-muted-foreground">
          Read-only view — scheduling and proctor actions require hiring manager or trainer access.
        </Card>
      ) : null}

      {submissionError ? (
        <QueryLoadError message="Could not load submitted answers" />
      ) : null}

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Badge variant="outline">{session.status.replace("_", " ")}</Badge>
        {isPaperOnly ? (
          <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-800">
            {ASSESSMENT_MODE_LABELS.paper_only}
          </Badge>
        ) : isHybrid ? (
          <Badge variant="outline">{ASSESSMENT_MODE_LABELS.hybrid}</Badge>
        ) : null}
        {live && !isPaperOnly && (
          <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-800 animate-pulse">
            Live
          </Badge>
        )}
        {session.final_recommendation && (
          <Badge
            variant="outline"
            className={REC_STYLE[session.final_recommendation as HireRecommendation]}
          >
            {REC_LABEL[session.final_recommendation as HireRecommendation]}
          </Badge>
        )}
        {effectiveScore != null && (
          <Badge variant="outline" className="tabular-nums">
            Score {Math.round(effectiveScore)}%
          </Badge>
        )}
      </div>

      <CandidatePerformanceBanner
        session={session}
        evaluation={evaluation}
        effectiveScore={effectiveScore}
        answeredCount={answeredCount}
        questionCount={questionCount}
        mcqCorrect={mcqCorrect}
        mcqTotal={mcqTotal}
        submissionLoading={submissionLoading && hasRecord}
        onRunEvaluation={() => rerun.mutate()}
        rerunPending={rerun.isPending}
        readOnly={readOnly}
      />

      {showProfileSection ? (
        <div className="mb-4">
          <ProfileReportPanel
            evaluation={evaluation}
            status={session.status}
            onGenerateProfile={handleGenerateProfile}
            generating={profileGenerating}
          />
        </div>
      ) : null}

      {isPaperOnly && session.status !== "evaluated" && (
        <Card className="mb-4 rounded-xl border-amber-200/60 bg-amber-50/40 p-4 shadow-soft">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-[14px] font-semibold">Paper-only assessment</h3>
              <p className="mt-0.5 text-[12px] text-muted-foreground">
                No online test required. Open the <strong>Paper test</strong> tab, upload photos of
                the completed paper, then click <strong>Grade paper test with AI</strong>.
              </p>
            </div>
            <Button size="lg" variant="outline" className="shrink-0" onClick={() => setActiveTab("paper")}>
              Go to Paper test
            </Button>
          </div>
        </Card>
      )}

      {canOpen && !readOnly && (
        <Card className="mb-4 rounded-xl border-primary/30 bg-primary/5 p-4 shadow-soft">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-[14px] font-semibold text-foreground">Proctor action</h3>
              <p className="mt-0.5 text-[12px] text-muted-foreground">
                {candidateStatusHint}
                {questionCount === 0 ? " Warning: assessment has no questions saved." : null}
              </p>
            </div>
            <Button
              size="lg"
              className="gap-2 shrink-0"
              disabled={open.isPending}
              onClick={() => open.mutate()}
            >
              <PlayCircle className="h-5 w-5" />
              {open.isPending
                ? "Opening…"
                : session.status === "opened"
                  ? "Re-open test for candidate"
                  : "Open test for candidate"}
            </Button>
          </div>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-1">
          <Card className="rounded-xl p-4 shadow-soft">
            <div className="flex items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-primary">
                <User className="h-4 w-4" />
              </div>
              <div>
                <h3 className="text-[13px] font-semibold">Candidate details</h3>
                <p className="text-[11px] text-muted-foreground">{session.role}</p>
              </div>
            </div>
            <dl className="mt-3 space-y-2 text-[12.5px]">
              <div>
                <dt className="text-muted-foreground">Name</dt>
                <dd className="font-medium">{session.candidate_name}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Email</dt>
                <dd>{session.candidate_email}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Level</dt>
                <dd>{session.level}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Assessment</dt>
                <dd>{session.assessment_title}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Questions</dt>
                <dd>{questionCount} in test</dd>
              </div>
              {hasRecord && (
                <div>
                  <dt className="text-muted-foreground">Submitted answers</dt>
                  <dd>
                    {submissionLoading ? "Loading…" : `${answeredCount} / ${answers.length || questionCount}`}
                  </dd>
                </div>
              )}
              {effectiveScore != null && (
                <div>
                  <dt className="text-muted-foreground">Final score</dt>
                  <dd className="font-semibold tabular-nums">{Math.round(effectiveScore)}%</dd>
                </div>
              )}
              {session.final_recommendation && (
                <div>
                  <dt className="text-muted-foreground">AI recommendation</dt>
                  <dd>
                    <Badge
                      variant="outline"
                      className={cn("text-[10px]", REC_STYLE[session.final_recommendation as HireRecommendation])}
                    >
                      {REC_LABEL[session.final_recommendation as HireRecommendation]}
                    </Badge>
                  </dd>
                </div>
              )}
              <div>
                <dt className="text-muted-foreground">Scheduled</dt>
                <dd>{new Date(session.scheduled_at).toLocaleString()}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Expires</dt>
                <dd>{new Date(session.expires_at).toLocaleString()}</dd>
              </div>
            </dl>
          </Card>

          <Card className="rounded-xl p-4 shadow-soft">
            <h3 className="text-[13px] font-semibold">
              {isPaperOnly ? "HR controls" : "Proctor controls"}
            </h3>
            <p className="mt-1 text-[12px] text-muted-foreground">
              {candidateStatusHint ??
                "Session complete or not yet ready for proctoring."}
            </p>
            {!isPaperOnly && questionCount === 0 && (
              <p className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-2 py-1.5 text-[11px] text-amber-900">
                This assessment has no questions — save questions in the builder before opening.
              </p>
            )}
            <div className="mt-3 flex flex-col gap-2">
              {!readOnly && !isPaperOnly && canOpen && (
                <Button
                  className="gap-2"
                  size="lg"
                  disabled={open.isPending}
                  onClick={() => open.mutate()}
                >
                  <PlayCircle className="h-4 w-4" />
                  {session.status === "opened" ? "Re-open test for candidate" : "Open test for candidate"}
                </Button>
              )}
              <Button asChild variant="outline" className="gap-2">
                <Link
                  to="/assessments/$assessmentId/preview"
                  params={{ assessmentId: session.assessment_id }}
                  target="_blank"
                >
                  <ExternalLink className="h-4 w-4" />
                  Preview assessment blueprint
                </Link>
              </Button>
              {!readOnly && !isPaperOnly ? (
                <>
                  <Button
                    variant="outline"
                    className="gap-2"
                    disabled={resend.isPending}
                    onClick={() => {
                      if (
                        !window.confirm(
                          "Resend invite? This generates a new link and invalidates the previous one.",
                        )
                      ) {
                        return;
                      }
                      resend.mutate();
                    }}
                  >
                    <Mail className="h-4 w-4" />
                    {resend.isPending ? "Sending…" : "Resend candidate link"}
                  </Button>
                  {magicLink ? (
                    <div className="flex gap-2">
                      <Input readOnly value={magicLink} className="text-[11px]" />
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        onClick={() => {
                          void navigator.clipboard.writeText(magicLink);
                          toast.success("Link copied");
                        }}
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                    </div>
                  ) : null}
                </>
              ) : null}
              {!readOnly && !["submitted", "evaluating", "evaluated", "cancelled"].includes(session.status) && (
                <Button
                  variant="outline"
                  className="gap-2 text-destructive"
                  disabled={cancel.isPending}
                  onClick={handleCancel}
                >
                  <XCircle className="h-4 w-4" />
                  Cancel session
                </Button>
              )}
              {!readOnly ? (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="outline"
                    className="gap-2 text-destructive"
                    disabled={remove.isPending}
                  >
                    <Trash2 className="h-4 w-4" />
                    {remove.isPending ? "Deleting…" : "Delete session"}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete this interview session?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This permanently removes {session.candidate_name}&apos;s session, including
                      submissions, AI evaluation, paper uploads, and notes. The interview assessment
                      template is not deleted.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Keep session</AlertDialogCancel>
                    <AlertDialogAction
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      disabled={remove.isPending}
                      onClick={(e) => {
                        e.preventDefault();
                        remove.mutate();
                      }}
                    >
                      Delete permanently
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
              ) : null}
            </div>
          </Card>

          <Card className="rounded-xl p-4 shadow-soft">
            <h3 className="text-[13px] font-semibold">Proctor notes</h3>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="mt-2 min-h-24 text-[13px]"
              placeholder="Notes during the call…"
            />
            <Button
              size="sm"
              className="mt-2"
              variant="secondary"
              disabled={saveNotes.isPending}
              onClick={() => saveNotes.mutate()}
            >
              Save notes
            </Button>
          </Card>
        </div>

        <div className="lg:col-span-2">
          <Tabs value={activeTab} onValueChange={setActiveTab} key={sessionId}>
            <TabsList className="flex h-auto flex-wrap gap-1">
              <TabsTrigger value="profile">Profile report</TabsTrigger>
              <TabsTrigger value="results">Results overview</TabsTrigger>
              <TabsTrigger value="evaluation">AI evaluation</TabsTrigger>
              {!isPaperOnly ? (
                <TabsTrigger value="answers">
                  Answers ({answers.length || "…"})
                </TabsTrigger>
              ) : null}
              <TabsTrigger value="in-person">In-person flow</TabsTrigger>
              <TabsTrigger value="paper">Paper test</TabsTrigger>
              <TabsTrigger value="audit">
                Audit ({audit.data?.runs.length ?? 0})
              </TabsTrigger>
              <TabsTrigger value="events">Events ({parseInterviewEvents(session.interview_events).length})</TabsTrigger>
            </TabsList>
            <TabsContent value="profile" className="mt-4">
              <ProfileReportPanel
                evaluation={evaluation}
                status={session.status}
                onGenerateProfile={handleGenerateProfile}
                generating={profileGenerating}
              />
            </TabsContent>
            <TabsContent value="results" className="mt-4">
              <ResultsOverviewPanel
                session={session}
                evaluation={evaluation}
                answers={answers}
                effectiveScore={effectiveScore}
                answeredCount={answeredCount}
                mcqCorrect={mcqCorrect}
                mcqTotal={mcqTotal}
                submissionLoading={submissionLoading && hasRecord}
                onRerun={() => rerun.mutate()}
                rerunPending={rerun.isPending}
              />
            </TabsContent>
            <TabsContent value="evaluation" className="mt-4">
              <EvaluationPanel
                evaluation={evaluation}
                status={session.status}
                onRerun={() => rerun.mutate()}
                rerunPending={rerun.isPending}
                hrNoteBody={hrNoteBody}
                setHrNoteBody={setHrNoteBody}
                onAppendNote={() => appendNote.mutate()}
                appendNotePending={appendNote.isPending}
                hrNotes={audit.data?.notes ?? []}
                supportLabel={supportLabel}
                setSupportLabel={setSupportLabel}
                supportScore={supportScore}
                setSupportScore={setSupportScore}
                onAddSupporting={() => addSupport.mutate()}
                addSupportPending={addSupport.isPending}
                supportingScores={audit.data?.supporting ?? []}
                questionFlags={audit.data?.flags ?? []}
                onFlagQuestion={(questionId, reason) =>
                  flagQuestion.mutate({ questionId, reason })
                }
              />
            </TabsContent>
            <TabsContent value="audit" className="mt-4">
              <Card className="rounded-xl p-4 shadow-soft">
                <h3 className="text-[13px] font-semibold">Evaluation history (immutable)</h3>
                <p className="mt-1 text-[12px] text-muted-foreground">
                  Each AI rerun is stored separately — scores are never overwritten.
                </p>
                <ul className="mt-4 space-y-3">
                  {(audit.data?.runs ?? []).map((run) => (
                    <li key={run.id} className="rounded-lg border border-border p-3 text-[12px]">
                      <div className="flex justify-between gap-2">
                        <span className="font-medium">Run #{run.run_number}</span>
                        <span>{new Date(run.created_at).toLocaleString()}</span>
                      </div>
                      <div className="mt-1 text-muted-foreground">
                        {run.model_name ?? "AI"} · {run.evaluation_mode ?? "ai"} · {run.weighted_score}%
                        {run.recommendation ? ` · ${REC_LABEL[run.recommendation as HireRecommendation]}` : ""}
                      </div>
                      <p className="mt-2 line-clamp-3">{run.ai_evaluation?.summary}</p>
                    </li>
                  ))}
                  {!audit.data?.runs.length ? (
                    <li className="text-muted-foreground">No evaluation runs yet.</li>
                  ) : null}
                </ul>
                {["scheduled", "waiting", "opened"].includes(session.status) ? (
                  <Button
                    size="sm"
                    variant="outline"
                    className="mt-4"
                    disabled={refreshVersion.isPending}
                    onClick={() => refreshVersion.mutate()}
                  >
                    Update assessment to latest version
                  </Button>
                ) : null}
              </Card>
            </TabsContent>
            {!isPaperOnly ? (
              <TabsContent value="answers" className="mt-4">
                <SubmissionPanel answers={answers} status={session.status} />
              </TabsContent>
            ) : null}
            <TabsContent value="in-person" className="mt-4">
              <InPersonFlowPanel sessionId={sessionId} flowRaw={session.in_person_flow} />
            </TabsContent>
            <TabsContent value="paper" className="mt-4">
              <PaperTestPanel
                sessionId={sessionId}
                paperRaw={session.paper_assessment}
                onGraded={() => {
                  qc.invalidateQueries({ queryKey: ["interview-session", sessionId] });
                  qc.invalidateQueries({ queryKey: ["interview-submission", sessionId] });
                  qc.invalidateQueries({ queryKey: ["interview-audit", sessionId] });
                }}
              />
            </TabsContent>
            <TabsContent value="events" className="mt-4">
              <Card className="rounded-xl p-4 shadow-soft">
                <ul className="space-y-2 text-[12px]">
                  {parseInterviewEvents(session.interview_events).map((ev, i) => (
                    <li key={i} className="rounded border border-border px-2 py-1.5">
                      <span className="font-medium">{ev.type}</span>
                      <span className="text-muted-foreground"> · {new Date(ev.at).toLocaleTimeString()}</span>
                      {ev.detail ? <div className="text-muted-foreground">{ev.detail}</div> : null}
                    </li>
                  ))}
                  {!parseInterviewEvents(session.interview_events).length && (
                    <li className="text-muted-foreground">No browser events logged yet.</li>
                  )}
                </ul>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </AdminLayout>
  );
}

function parseInterviewEvents(raw: unknown): { type: string; at: string; detail?: string }[] {
  if (!raw) return [];
  if (typeof raw === "string") {
    try {
      return parseInterviewEvents(JSON.parse(raw));
    } catch {
      return [];
    }
  }
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((e): e is { type: string; at: string; detail?: string } => e != null && typeof e === "object")
    .map((e) => ({
      type: String((e as { type?: string }).type ?? "event"),
      at: String((e as { at?: string }).at ?? ""),
      detail: (e as { detail?: string }).detail,
    }));
}

function CandidatePerformanceBanner({
  session,
  evaluation,
  effectiveScore,
  answeredCount,
  questionCount,
  mcqCorrect,
  mcqTotal,
  submissionLoading,
  onRunEvaluation,
  rerunPending,
  readOnly = false,
}: {
  session: { status: string; candidate_name: string; final_recommendation: string | null };
  evaluation: AiEvaluation | null;
  effectiveScore: number | null;
  answeredCount: number;
  questionCount: number;
  mcqCorrect: number;
  mcqTotal: number;
  submissionLoading: boolean;
  onRunEvaluation: () => void;
  rerunPending: boolean;
  readOnly?: boolean;
}) {
  const terminal = ["submitted", "evaluating", "evaluated"].includes(session.status);

  if (!terminal) {
    return (
      <Card className="mb-4 rounded-xl border-border bg-muted/20 p-4 shadow-soft">
        <p className="text-[13px] text-muted-foreground">
          <strong className="text-foreground">{session.candidate_name}</strong> has not submitted the test yet.
          Performance results will appear here after submission.
        </p>
      </Card>
    );
  }

  if (session.status === "evaluating" || (session.status === "submitted" && !evaluation)) {
    return (
      <Card className="mb-4 rounded-xl border-indigo-200 bg-indigo-50/50 p-4 shadow-soft">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Loader2 className="h-5 w-5 animate-spin text-indigo-600" />
            <div>
              <p className="text-[14px] font-semibold text-foreground">Evaluating candidate work…</p>
              <p className="text-[12px] text-muted-foreground">
                {submissionLoading
                  ? "Loading submitted answers…"
                  : session.status === "submitted"
                    ? `${answeredCount} answers recorded · AI evaluation queued (click Run evaluation if this takes more than 2 minutes)`
                    : `${answeredCount} answers recorded · AI grading in progress`}
              </p>
            </div>
          </div>
          {!readOnly ? (
          <Button variant="outline" size="sm" className="gap-2" onClick={onRunEvaluation} disabled={rerunPending}>
            <RefreshCw className="h-3.5 w-3.5" />
            {rerunPending ? "Running…" : "Run evaluation"}
          </Button>
          ) : null}
        </div>
      </Card>
    );
  }

  return (
    <Card className="mb-4 rounded-xl border-border p-5 shadow-soft">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            <Award className="h-3.5 w-3.5" />
            Candidate performance record
          </div>
          <p className="mt-1 text-[15px] font-semibold text-foreground">{session.candidate_name}</p>
          {evaluation?.summary ? (
            <p className="mt-2 max-w-2xl text-[13px] text-muted-foreground">{evaluation.summary}</p>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {effectiveScore != null && (
            <div className="text-center">
              <div className="text-3xl font-bold tabular-nums text-foreground">{Math.round(effectiveScore)}%</div>
              <div className="text-[11px] text-muted-foreground">Overall score</div>
            </div>
          )}
          {session.final_recommendation && evaluation && (
            <Badge variant="outline" className={cn("text-[12px]", REC_STYLE[evaluation.recommendation])}>
              {REC_LABEL[evaluation.recommendation]}
            </Badge>
          )}
        </div>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-4">
        <StatBox label="Answers submitted" value={submissionLoading ? "…" : `${answeredCount}/${questionCount}`} />
        <StatBox label="MCQ correct" value={mcqTotal ? `${mcqCorrect}/${mcqTotal}` : "—"} />
        <StatBox label="MCQ score" value={evaluation ? `${evaluation.mcq_score}%` : "—"} />
        <StatBox label="Subjective score" value={evaluation ? `${evaluation.subjective_score}%` : "—"} />
      </div>
    </Card>
  );
}

function StatBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-muted/20 px-3 py-2">
      <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-0.5 text-[15px] font-semibold tabular-nums">{value}</div>
    </div>
  );
}

type SubmissionAnswer = {
  question_id: string;
  type: "mcq" | "subjective";
  prompt: string;
  topic: string;
  position: number;
  answer: string;
  is_correct: boolean | null;
  score: number | null;
  correct_answer: string | null;
};

function ResultsOverviewPanel({
  session,
  evaluation,
  answers,
  effectiveScore,
  answeredCount,
  mcqCorrect,
  mcqTotal,
  submissionLoading,
  onRerun,
  rerunPending,
}: {
  session: { status: string; assessment_title: string; role: string; level: string };
  evaluation: AiEvaluation | null;
  answers: SubmissionAnswer[];
  effectiveScore: number | null;
  answeredCount: number;
  mcqCorrect: number;
  mcqTotal: number;
  submissionLoading: boolean;
  onRerun: () => void;
  rerunPending: boolean;
}) {
  if (!["submitted", "evaluating", "evaluated"].includes(session.status)) {
    return (
      <Card className="rounded-xl p-6 shadow-soft">
        <p className="text-[13px] text-muted-foreground">
          The candidate has not finished the test. Results will show here after they submit.
        </p>
      </Card>
    );
  }

  if (!evaluation && session.status !== "evaluated") {
    return (
      <Card className="rounded-xl p-6 text-center shadow-soft">
        <Loader2 className="mx-auto h-8 w-8 animate-spin text-muted-foreground" />
        <p className="mt-3 text-[13px] text-muted-foreground">Waiting for AI evaluation…</p>
        <Button className="mt-4 gap-2" onClick={onRerun} disabled={rerunPending}>
          <Sparkles className="h-4 w-4" />
          Run AI evaluation
        </Button>
      </Card>
    );
  }

  if (!evaluation) {
    return (
      <Card className="rounded-xl p-6 shadow-soft">
        <p className="text-[13px] text-muted-foreground">No evaluation data yet.</p>
        <Button className="mt-4 gap-2" onClick={onRerun} disabled={rerunPending}>
          <Sparkles className="h-4 w-4" />
          Generate evaluation
        </Button>
      </Card>
    );
  }

  const topQuestions = [...evaluation.questions].sort((a, b) => b.score - a.score).slice(0, 3);
  const weakQuestions = [...evaluation.questions].sort((a, b) => a.score - b.score).slice(0, 3);

  return (
    <div className="space-y-4">
      <Card className="rounded-xl p-5 shadow-soft">
        <div className="flex items-center gap-2">
          <ClipboardList className="h-4 w-4 text-primary" />
          <h3 className="font-semibold">How they performed</h3>
        </div>
        <p className="mt-2 text-[13px]">{evaluation.summary}</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatBox label="Overall" value={`${Math.round(effectiveScore ?? evaluation.weighted_score)}%`} />
          <StatBox label="Answers" value={submissionLoading ? "…" : String(answeredCount)} />
          <StatBox label="MCQ" value={`${mcqCorrect}/${mcqTotal} correct`} />
          <StatBox
            label="Recommendation"
            value={REC_LABEL[evaluation.recommendation]}
          />
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="rounded-xl p-4 shadow-soft">
          <h4 className="text-[13px] font-semibold text-emerald-700">Strongest responses</h4>
          <ul className="mt-3 space-y-2">
            {topQuestions.map((q) => (
              <li key={q.question_id} className="rounded-lg border border-border p-3 text-[12px]">
                <div className="flex justify-between gap-2">
                  <Badge variant="outline" className="text-[10px]">{q.type}</Badge>
                  <span className="font-semibold tabular-nums">{q.score}%</span>
                </div>
                <p className="mt-1 line-clamp-2 font-medium">{q.prompt}</p>
                <p className="mt-1 text-muted-foreground">{q.feedback}</p>
              </li>
            ))}
          </ul>
        </Card>
        <Card className="rounded-xl p-4 shadow-soft">
          <h4 className="text-[13px] font-semibold text-rose-700">Needs improvement</h4>
          <ul className="mt-3 space-y-2">
            {weakQuestions.map((q) => (
              <li key={q.question_id} className="rounded-lg border border-border p-3 text-[12px]">
                <div className="flex justify-between gap-2">
                  <Badge variant="outline" className="text-[10px]">{q.type}</Badge>
                  <span className="font-semibold tabular-nums">{q.score}%</span>
                </div>
                <p className="mt-1 line-clamp-2 font-medium">{q.prompt}</p>
                <p className="mt-1 text-muted-foreground">{q.feedback}</p>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      {answers.length > 0 && (
        <Card className="rounded-xl p-4 shadow-soft">
          <h4 className="text-[13px] font-semibold">Answer record snapshot</h4>
          <p className="mt-1 text-[12px] text-muted-foreground">
            Full answers are in the <strong>Answers</strong> tab. Preview of latest responses:
          </p>
          <ul className="mt-3 space-y-2">
            {answers.slice(0, 5).map((a, i) => (
              <li key={a.question_id} className="rounded border border-border px-3 py-2 text-[12px]">
                <span className="font-medium">Q{i + 1}</span>
                <span className="text-muted-foreground"> · {a.type}</span>
                {a.score != null && <span className="float-right font-semibold tabular-nums">{a.score}%</span>}
                <p className="mt-1 line-clamp-1 text-muted-foreground">
                  {a.answer.trim() || "(no answer)"}
                </p>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

function SubmissionPanel({
  answers,
  status,
}: {
  answers: SubmissionAnswer[];
  status: string;
}) {
  if (!["submitted", "evaluating", "evaluated"].includes(status)) {
    return (
      <Card className="rounded-xl p-6 shadow-soft">
        <p className="text-[13px] text-muted-foreground">
          Candidate answers appear here after they submit the test.
        </p>
      </Card>
    );
  }

  if (!answers.length) {
    return (
      <Card className="rounded-xl p-6 text-center shadow-soft">
        <p className="text-[13px] text-muted-foreground">
          {status === "submitted" || status === "evaluating"
            ? "No answers recorded — the candidate may not have submitted yet."
            : "Loading submission record…"}
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      <Card className="rounded-xl p-4 shadow-soft">
        <p className="text-[12.5px] text-muted-foreground">
          {answers.length} question{answers.length === 1 ? "" : "s"} recorded for this attempt.
        </p>
      </Card>
      {answers.map((a, i) => (
        <Card key={a.question_id} className="rounded-xl p-4 shadow-soft">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-medium text-muted-foreground">Q{i + 1}</span>
              <Badge variant="outline" className="text-[10px]">{a.type}</Badge>
              {a.topic ? (
                <span className="text-[11px] text-muted-foreground">{a.topic}</span>
              ) : null}
            </div>
            {a.score != null && (
              <span className="text-[12px] font-semibold tabular-nums">{a.score}%</span>
            )}
            {a.type === "mcq" && a.is_correct != null && (
              <Badge
                variant="outline"
                className={a.is_correct ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-rose-200 bg-rose-50 text-rose-700"}
              >
                {a.is_correct ? "Correct" : "Incorrect"}
              </Badge>
            )}
          </div>
          <p className="mt-2 text-[13px] font-medium">{a.prompt}</p>
          <div className="mt-3 rounded-lg border border-border bg-muted/30 p-3">
            <div className="text-[10px] font-medium uppercase text-muted-foreground">Candidate answer</div>
            <p className="mt-1 whitespace-pre-wrap text-[12.5px]">
              {a.answer.trim() || <span className="italic text-muted-foreground">No answer</span>}
            </p>
          </div>
          {a.type === "mcq" && a.correct_answer && !a.is_correct && (
            <p className="mt-2 text-[11.5px] text-muted-foreground">
              Expected: {a.correct_answer}
            </p>
          )}
        </Card>
      ))}
    </div>
  );
}

function EvaluationPanel({
  evaluation,
  status,
  onRerun,
  rerunPending,
  hrNoteBody,
  setHrNoteBody,
  onAppendNote,
  appendNotePending,
  hrNotes,
  supportLabel,
  setSupportLabel,
  supportScore,
  setSupportScore,
  onAddSupporting,
  addSupportPending,
  supportingScores,
  questionFlags,
  onFlagQuestion,
}: {
  evaluation: AiEvaluation | null;
  status: string;
  onRerun: () => void;
  rerunPending: boolean;
  hrNoteBody: string;
  setHrNoteBody: (v: string) => void;
  onAppendNote: () => void;
  appendNotePending: boolean;
  hrNotes: { id: string; author_email: string | null; body: string; created_at: string }[];
  supportLabel: string;
  setSupportLabel: (v: string) => void;
  supportScore: string;
  setSupportScore: (v: string) => void;
  onAddSupporting: () => void;
  addSupportPending: boolean;
  supportingScores: { id: string; label: string; score: number | null; score_type: string }[];
  questionFlags: { question_id: string; reason: string }[];
  onFlagQuestion: (questionId: string, reason: string) => void;
}) {
  if (!evaluation && (status === "submitted" || status === "evaluating")) {
    return (
      <Card className="rounded-xl p-6 text-center shadow-soft">
        <Loader2 className="mx-auto h-8 w-8 animate-spin text-muted-foreground" />
        <p className="mt-3 text-[13px] text-muted-foreground">
          {status === "evaluating"
            ? "AI is grading answers — this may take a minute…"
            : "Waiting for AI evaluation after submit…"}
        </p>
        <Button className="mt-4 gap-2" variant="outline" onClick={onRerun} disabled={rerunPending}>
          <RefreshCw className="h-4 w-4" />
          {rerunPending ? "Evaluating…" : "Run evaluation now"}
        </Button>
      </Card>
    );
  }

  if (!evaluation) {
    return (
      <Card className="rounded-xl p-6 shadow-soft">
        <p className="text-[13px] text-muted-foreground">
          Evaluation appears after the candidate submits. Status: {status}.
        </p>
        {["submitted", "evaluating"].includes(status) && (
          <Button className="mt-4 gap-2" onClick={onRerun} disabled={rerunPending}>
            <Sparkles className="h-4 w-4" />
            {rerunPending ? "Evaluating…" : "Run AI evaluation"}
          </Button>
        )}
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card className="rounded-xl p-5 shadow-soft">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              <h3 className="font-semibold">AI evaluation</h3>
            </div>
            <p className="mt-2 text-[13px]">{evaluation.summary}</p>
          </div>
          <div className="text-right">
            <div className="text-2xl font-bold tabular-nums">{evaluation.weighted_score}%</div>
            <Badge variant="outline" className={cn("mt-1", REC_STYLE[evaluation.recommendation])}>
              {REC_LABEL[evaluation.recommendation]}
            </Badge>
            {evaluation.evaluation_mode && evaluation.evaluation_mode !== "ai" && (
              <Badge variant="outline" className="mt-1 ml-1 text-[10px]">
                {evaluation.evaluation_mode === "heuristic" ? "Heuristic grading" : "Partial AI"}
              </Badge>
            )}
          </div>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-3 text-[12px]">
          <div className="rounded-lg border border-border p-2">
            <div className="text-muted-foreground">MCQ</div>
            <div className="font-semibold">{evaluation.mcq_score}%</div>
          </div>
          <div className="rounded-lg border border-border p-2">
            <div className="text-muted-foreground">Subjective</div>
            <div className="font-semibold">{evaluation.subjective_score}%</div>
          </div>
          <div className="rounded-lg border border-border p-2">
            <div className="text-muted-foreground">Evaluated</div>
            <div>{new Date(evaluation.evaluated_at).toLocaleString()}</div>
          </div>
        </div>
        {evaluation.strengths.length > 0 && (
          <div className="mt-4">
            <div className="text-[11px] font-medium uppercase text-muted-foreground">Strengths</div>
            <ul className="mt-1 list-inside list-disc text-[12.5px]">
              {evaluation.strengths.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ul>
          </div>
        )}
        {evaluation.weaknesses.length > 0 && (
          <div className="mt-3">
            <div className="text-[11px] font-medium uppercase text-muted-foreground">Weaknesses</div>
            <ul className="mt-1 list-inside list-disc text-[12.5px]">
              {evaluation.weaknesses.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ul>
          </div>
        )}
        {evaluation.red_flags.length > 0 && (
          <div className="mt-3 rounded-lg border border-rose-200 bg-rose-50 p-3 text-[12.5px] text-rose-800">
            <strong>Red flags:</strong> {evaluation.red_flags.join(" · ")}
          </div>
        )}
        <Button className="mt-4 gap-2" variant="outline" size="sm" onClick={onRerun} disabled={rerunPending}>
          <RefreshCw className="h-3.5 w-3.5" />
          Re-run evaluation
        </Button>
      </Card>

      <div className="space-y-2">
        {evaluation.questions.map((q) => {
          const flagged = questionFlags.some((f) => f.question_id === q.question_id);
          return (
            <Card key={q.question_id} className="rounded-xl p-4 shadow-soft">
              <div className="flex items-center justify-between gap-2">
                <Badge variant="outline" className="text-[10px]">{q.type}</Badge>
                <span className="text-[12px] font-semibold tabular-nums">{q.score}/{q.max_score}</span>
              </div>
              <p className="mt-2 text-[13px] font-medium line-clamp-2">{q.prompt}</p>
              <p className="mt-1 text-[12px] text-muted-foreground">{q.feedback}</p>
              {flagged ? (
                <Badge variant="outline" className="mt-2 text-[10px] text-amber-700">
                  Flagged by HR
                </Badge>
              ) : (
                <Button
                  size="sm"
                  variant="ghost"
                  className="mt-2 h-7 text-[11px]"
                  onClick={() => {
                    const reason = window.prompt("Reason for flagging this question?");
                    if (reason?.trim()) onFlagQuestion(q.question_id, reason.trim());
                  }}
                >
                  Flag question
                </Button>
              )}
            </Card>
          );
        })}
      </div>

      <Card className="rounded-xl p-4 shadow-soft">
        <h3 className="text-[13px] font-semibold">HR notes (read-only log)</h3>
        <p className="mt-1 text-[11px] text-muted-foreground">
          Notes are append-only. AI scores cannot be changed.
        </p>
        <ul className="mt-3 space-y-2 text-[12px]">
          {hrNotes.map((n) => (
            <li key={n.id} className="rounded border border-border px-2 py-1.5">
              <div className="text-muted-foreground">
                {n.author_email ?? "HR"} · {new Date(n.created_at).toLocaleString()}
              </div>
              <div>{n.body}</div>
            </li>
          ))}
          {!hrNotes.length ? <li className="text-muted-foreground">No HR notes yet.</li> : null}
        </ul>
        <Textarea
          value={hrNoteBody}
          onChange={(e) => setHrNoteBody(e.target.value)}
          placeholder="Add an HR note…"
          className="mt-3 min-h-20 text-[13px]"
        />
        <Button size="sm" className="mt-2" disabled={appendNotePending || !hrNoteBody.trim()} onClick={onAppendNote}>
          Add note
        </Button>
      </Card>

      <Card className="rounded-xl p-4 shadow-soft">
        <h3 className="text-[13px] font-semibold">Supporting evidence scores</h3>
        <p className="mt-1 text-[11px] text-muted-foreground">
          Paper / in-person scores are recorded separately and do not replace AI grades.
        </p>
        <ul className="mt-2 space-y-1 text-[12px]">
          {supportingScores.map((s) => (
            <li key={s.id}>
              {s.label}: {s.score != null ? `${s.score}%` : "—"} ({s.score_type})
            </li>
          ))}
        </ul>
        <div className="mt-3 flex flex-wrap gap-2">
          <Input
            value={supportLabel}
            onChange={(e) => setSupportLabel(e.target.value)}
            placeholder="Label"
            className="max-w-[180px]"
          />
          <Input
            type="number"
            min={0}
            max={100}
            value={supportScore}
            onChange={(e) => setSupportScore(e.target.value)}
            placeholder="Score %"
            className="max-w-[120px]"
          />
          <Button size="sm" disabled={addSupportPending} onClick={onAddSupporting}>
            Record score
          </Button>
        </div>
      </Card>
    </div>
  );
}
