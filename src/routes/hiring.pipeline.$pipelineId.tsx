import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { MetricCard } from "@/components/admin/MetricCard";
import { HiringWorkflowStrip } from "@/components/hiring/HiringWorkflowStrip";
import { PipelineDetailPanels } from "@/components/hiring/PipelineDetailPanels";
import { PipelineStageTimeline } from "@/components/hiring/PipelineStageTimeline";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  convertToTraineeFn,
  createTrialProjectFn,
  getPipelineDetailFn,
  passPipelineStageFn,
  recordCeoReviewFn,
  rejectPipelineFn,
  schedulePipelineRoundFn,
  sendCandidateInviteFn,
} from "@/lib/hiring-pipeline/hiring-pipeline.functions";
import { listInterviewAssessmentsFn } from "@/lib/interview/interview.functions";
import {
  PIPELINE_STATUS_LABELS,
  STAGE_LABELS,
  STAGE_SHORT_LABELS,
  ceoReviewStatusLabel,
} from "@/lib/hiring-pipeline/hiring-pipeline.shared";
import { useSession } from "@/lib/auth";
import { isExecutiveReadOnly } from "@/lib/role-access";
import { ArrowLeft, Calendar, GitBranch, Mail, Video } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/hiring/pipeline/$pipelineId")({
  head: () => ({ meta: [{ title: "Hiring Pipeline — Alyson" }] }),
  component: PipelineDetailPage,
});

function daysSince(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
}

function PipelineDetailLoading() {
  return (
    <div className="space-y-8">
      <Skeleton className="h-24 w-full rounded-xl" />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-28 rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-32 w-full rounded-xl" />
      <div className="grid gap-6 lg:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-48 rounded-xl" />
        ))}
      </div>
    </div>
  );
}

function PipelineDetailPage() {
  const { pipelineId } = Route.useParams();
  const { roles } = useSession();
  const readOnly = isExecutiveReadOnly(roles);
  const load = useServerFn(getPipelineDetailFn);
  const scheduleRound = useServerFn(schedulePipelineRoundFn);
  const passStage = useServerFn(passPipelineStageFn);
  const sendInvite = useServerFn(sendCandidateInviteFn);
  const createTrial = useServerFn(createTrialProjectFn);
  const ceoReview = useServerFn(recordCeoReviewFn);
  const convert = useServerFn(convertToTraineeFn);
  const reject = useServerFn(rejectPipelineFn);
  const loadTests = useServerFn(listInterviewAssessmentsFn);
  const qc = useQueryClient();

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["pipeline-detail", pipelineId],
    queryFn: () => load({ data: { pipelineId } }),
    retry: 1,
  });

  const { data: tests = [] } = useQuery({
    queryKey: ["interview-assessments"],
    queryFn: () => loadTests(),
    enabled: !readOnly,
  });

  const [assessmentId, setAssessmentId] = useState("");
  const [roundType, setRoundType] = useState<"tech_round_1" | "tech_round_2" | "ceo_interview">(
    "tech_round_1",
  );
  const [trialTitle, setTrialTitle] = useState("Trial project");
  const [trialBrief, setTrialBrief] = useState("");

  const invalidate = () => void qc.invalidateQueries({ queryKey: ["pipeline-detail", pipelineId] });

  const scheduleMut = useMutation({
    mutationFn: () => {
      const scheduledAt = new Date(Date.now() + 3600_000).toISOString();
      const expiresAt = new Date(Date.now() + 7 * 86_400_000).toISOString();
      return scheduleRound({
        data: {
          pipelineId,
          assessmentId,
          roundType,
          scheduledAt,
          expiresAt,
        },
      });
    },
    onSuccess: (res) => {
      toast.success(`Round scheduled. Magic link: ${res.magicLink}`);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const passMut = useMutation({
    mutationFn: (stage: string) => passStage({ data: { pipelineId, stage: stage as never } }),
    onSuccess: () => {
      toast.success("Stage marked passed");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const inviteMut = useMutation({
    mutationFn: () => sendInvite({ data: { pipelineId } }),
    onSuccess: (res) => {
      toast.success(`Invite sent to ${res.email}: ${res.inviteUrl}`);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const trialMut = useMutation({
    mutationFn: () =>
      createTrial({
        data: {
          pipelineId,
          title: trialTitle,
          brief: trialBrief || undefined,
          dueAt: new Date(Date.now() + 14 * 86_400_000).toISOString(),
        },
      }),
    onSuccess: () => {
      toast.success("Trial project created");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const ceoReviewMut = useMutation({
    mutationFn: (status: "passed" | "failed") =>
      ceoReview({ data: { pipelineId, status } }),
    onSuccess: () => {
      toast.success("CEO review recorded");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const hireMut = useMutation({
    mutationFn: () => convert({ data: { pipelineId } }),
    onSuccess: () => {
      toast.success("Converted to trainee — full onboarding assigned");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rejectMut = useMutation({
    mutationFn: () => reject({ data: { pipelineId } }),
    onSuccess: () => {
      toast.success("Pipeline rejected");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  useEffect(() => {
    if (data?.pipeline.candidate_name) {
      document.title = `${data.pipeline.candidate_name} — Hiring Pipeline — Alyson`;
    }
  }, [data?.pipeline.candidate_name]);

  if (isLoading) {
    return (
      <AdminLayout title="Pipeline" subtitle="Loading…">
        <PipelineDetailLoading />
      </AdminLayout>
    );
  }

  if (isError || !data) {
    return (
      <AdminLayout
        title="Pipeline"
        subtitle="Could not load candidate"
        actions={
          <Link to="/hiring/pipeline">
            <Button size="sm" variant="outline" className="h-8 gap-1 text-xs">
              <ArrowLeft className="h-3.5 w-3.5" /> Back to board
            </Button>
          </Link>
        }
      >
        <p className="text-sm text-muted-foreground">
          {error instanceof Error ? error.message : "Pipeline not found or you do not have access."}
        </p>
      </AdminLayout>
    );
  }

  const { pipeline, stages, trialProject, interviewSessions } = data;

  return (
    <AdminLayout
      title={pipeline.candidate_name}
      subtitle={`${pipeline.target_role} · ${pipeline.target_department}`}
      actions={
        <div className="flex items-center gap-2">
          {pipeline.user_id ? (
            <Link to="/users/$userId/learner" params={{ userId: pipeline.user_id }}>
              <Button size="sm" variant="outline" className="h-8 gap-1 text-xs">
                Learner 360
              </Button>
            </Link>
          ) : null}
          <Link to="/hiring/pipeline">
            <Button size="sm" variant="outline" className="h-8 gap-1 text-xs">
              <ArrowLeft className="h-3.5 w-3.5" /> Back to board
            </Button>
          </Link>
        </div>
      }
    >
      <HiringWorkflowStrip className="mb-6" />

      <div className="mb-6 flex flex-wrap items-center gap-x-4 gap-y-2">
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Mail className="h-3.5 w-3.5" />
          {pipeline.candidate_email}
        </span>
        <Badge variant="outline">{PIPELINE_STATUS_LABELS[pipeline.status]}</Badge>
        <Badge className="bg-primary/10 text-primary hover:bg-primary/10">
          {STAGE_LABELS[pipeline.current_stage]}
        </Badge>
      </div>

      <section className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <MetricCard
          label="Current stage"
          value={STAGE_SHORT_LABELS[pipeline.current_stage]}
          icon={GitBranch}
        />
        <MetricCard
          label="Interviews"
          value={String(interviewSessions.length)}
          icon={Video}
          sub={interviewSessions.length === 1 ? "session scheduled" : "sessions scheduled"}
        />
        <MetricCard
          label="CEO review"
          value={ceoReviewStatusLabel(trialProject?.bill_review_status ?? "pending")}
          icon={Calendar}
        />
        <MetricCard
          label="Days in pipeline"
          value={String(daysSince(pipeline.created_at))}
          icon={GitBranch}
          sub="since added"
        />
      </section>

      <PipelineStageTimeline currentStage={pipeline.current_stage} stages={stages} />

      <PipelineDetailPanels
        readOnly={readOnly}
        currentStage={pipeline.current_stage}
        stages={stages}
        interviewSessions={interviewSessions}
        trialProject={trialProject}
        tests={tests}
        assessmentId={assessmentId}
        roundType={roundType}
        trialTitle={trialTitle}
        trialBrief={trialBrief}
        onAssessmentChange={setAssessmentId}
        onRoundTypeChange={setRoundType}
        onTrialTitleChange={setTrialTitle}
        onTrialBriefChange={setTrialBrief}
        onPassStage={(stage) => passMut.mutate(stage)}
        passPending={passMut.isPending}
        onSchedule={() => scheduleMut.mutate()}
        schedulePending={scheduleMut.isPending}
        scheduleDisabled={!assessmentId}
        onCreateTrial={() => trialMut.mutate()}
        createTrialPending={trialMut.isPending}
        onSendInvite={() => inviteMut.mutate()}
        invitePending={inviteMut.isPending}
        onCeoReview={(status) => ceoReviewMut.mutate(status)}
        ceoReviewPending={ceoReviewMut.isPending}
        onHire={() => hireMut.mutate()}
        hirePending={hireMut.isPending}
        onReject={() => rejectMut.mutate()}
        rejectPending={rejectMut.isPending}
      />
    </AdminLayout>
  );
}
