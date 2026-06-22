import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import type { LucideIcon } from "lucide-react";
import {
  Briefcase,
  ListChecks,
  UserCheck,
  Video,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { PipelineStageRow, TrialProjectRow } from "@/lib/hiring-pipeline/hiring-pipeline.shared";
import {
  ROUND_TYPE_LABELS,
  STAGE_ACTION_HINTS,
  STAGE_LABELS,
  ceoReviewStatusLabel,
  type PipelineStage,
} from "@/lib/hiring-pipeline/hiring-pipeline.shared";

function PanelCard({
  icon: Icon,
  title,
  hint,
  children,
}: {
  icon: LucideIcon;
  title: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <Card className="rounded-xl border-border bg-card p-5 shadow-soft transition hover:shadow-glow">
      <div className="mb-1 flex items-center gap-2">
        <Icon className="h-4 w-4 text-primary" strokeWidth={1.75} />
        <h2 className="text-base font-semibold tracking-tight">{title}</h2>
      </div>
      {hint ? <p className="mb-4 text-xs text-muted-foreground">{hint}</p> : <div className="mb-4" />}
      {children}
    </Card>
  );
}

type InterviewSession = {
  id: string;
  round_type: string | null;
  status: string;
  final_score: number | null;
};

type Assessment = { id: string; title: string };

export function PipelineDetailPanels({
  readOnly = false,
  currentStage,
  stages,
  interviewSessions,
  trialProject,
  tests,
  assessmentId,
  roundType,
  trialTitle,
  trialBrief,
  onAssessmentChange,
  onRoundTypeChange,
  onTrialTitleChange,
  onTrialBriefChange,
  onPassStage,
  passPending,
  onSchedule,
  schedulePending,
  scheduleDisabled,
  onCreateTrial,
  createTrialPending,
  onSendInvite,
  invitePending,
  onCeoReview,
  ceoReviewPending,
  onHire,
  hirePending,
  onReject,
  rejectPending,
}: {
  readOnly?: boolean;
  currentStage: PipelineStage;
  stages: PipelineStageRow[];
  interviewSessions: InterviewSession[];
  trialProject: TrialProjectRow | null;
  tests: Assessment[];
  assessmentId: string;
  roundType: "tech_round_1" | "tech_round_2" | "ceo_interview";
  trialTitle: string;
  trialBrief: string;
  onAssessmentChange: (id: string) => void;
  onRoundTypeChange: (type: "tech_round_1" | "tech_round_2" | "ceo_interview") => void;
  onTrialTitleChange: (title: string) => void;
  onTrialBriefChange: (brief: string) => void;
  onPassStage: (stage: string) => void;
  passPending: boolean;
  onSchedule: () => void;
  schedulePending: boolean;
  scheduleDisabled: boolean;
  onCreateTrial: () => void;
  createTrialPending: boolean;
  onSendInvite: () => void;
  invitePending: boolean;
  onCeoReview: (status: "passed" | "failed") => void;
  ceoReviewPending: boolean;
  onHire: () => void;
  hirePending: boolean;
  onReject: () => void;
  rejectPending: boolean;
}) {
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <PanelCard
        icon={ListChecks}
        title="Stages"
        hint={STAGE_ACTION_HINTS[currentStage]}
      >
        <ul className="space-y-2 text-sm">
          {stages.map((s) => (
            <li key={s.id} className="flex items-center justify-between gap-2">
              <span>{STAGE_LABELS[s.stage]}</span>
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="text-xs capitalize">
                  {s.status}
                </Badge>
                {s.status !== "passed" && s.status !== "failed" && !readOnly ? (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs"
                    onClick={() => onPassStage(s.stage)}
                    disabled={passPending}
                  >
                    Pass
                  </Button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      </PanelCard>

      <PanelCard icon={Video} title="Interview sessions">
        {interviewSessions.length === 0 ? (
          <p className="text-xs text-muted-foreground">No rounds scheduled yet.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {interviewSessions.map((s) => (
              <li key={s.id}>
                <Link
                  to="/interviews/$sessionId"
                  params={{ sessionId: s.id }}
                  className="font-medium text-primary hover:underline"
                >
                  {s.round_type
                    ? ROUND_TYPE_LABELS[s.round_type as keyof typeof ROUND_TYPE_LABELS]
                    : "Interview"}
                </Link>
                <span className="ml-2 text-xs text-muted-foreground capitalize">
                  {s.status}
                  {s.final_score != null ? ` · ${s.final_score}%` : ""}
                </span>
              </li>
            ))}
          </ul>
        )}

        {!readOnly ? (
          <div className="mt-4 space-y-2 border-t border-border pt-4">
            <Label>Schedule interview round</Label>
            <Select value={roundType} onValueChange={(v) => onRoundTypeChange(v as typeof roundType)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="tech_round_1">Tech Round 1 (AI)</SelectItem>
                <SelectItem value="tech_round_2">Tech Round 2 (Domain)</SelectItem>
                <SelectItem value="ceo_interview">CEO Interview</SelectItem>
              </SelectContent>
            </Select>
            <Select value={assessmentId} onValueChange={onAssessmentChange}>
              <SelectTrigger>
                <SelectValue placeholder="Select interview test" />
              </SelectTrigger>
              <SelectContent>
                {tests.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              size="sm"
              onClick={onSchedule}
              disabled={scheduleDisabled || schedulePending}
            >
              Schedule & send invite
            </Button>
          </div>
        ) : null}
      </PanelCard>

      <PanelCard icon={Briefcase} title="Trial & workspace access">
        {trialProject ? (
          <div className="text-sm">
            <p className="font-medium">{trialProject.title}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              CEO review:{" "}
              <Badge variant="outline" className="ml-1">
                {ceoReviewStatusLabel(trialProject.bill_review_status)}
              </Badge>
            </p>
          </div>
        ) : !readOnly ? (
          <div className="space-y-2">
            <Input value={trialTitle} onChange={(e) => onTrialTitleChange(e.target.value)} />
            <Textarea
              value={trialBrief}
              onChange={(e) => onTrialBriefChange(e.target.value)}
              placeholder="Trial brief…"
              rows={3}
            />
            <Button size="sm" onClick={onCreateTrial} disabled={createTrialPending}>
              Create trial project
            </Button>
          </div>
        ) : null}
        {!readOnly ? (
          <>
            <Button
              size="sm"
              variant="outline"
              className="mt-3"
              onClick={onSendInvite}
              disabled={invitePending}
            >
              Send @cintara.ai candidate invite
            </Button>
            <div className="mt-4 border-t border-border pt-4">
              <p className="mb-2 text-xs font-medium text-muted-foreground">
                Record CEO review (after trial submission)
              </p>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => onCeoReview("passed")}
                  disabled={ceoReviewPending}
                >
                  CEO review passed
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => onCeoReview("failed")}
                  disabled={ceoReviewPending}
                >
                  CEO review failed
                </Button>
              </div>
            </div>
          </>
        ) : null}
      </PanelCard>

      <PanelCard icon={UserCheck} title="Hire decision">
        <p className="mb-4 text-xs text-muted-foreground">
          Candidate must accept workspace invite before conversion to trainee. Complete CEO review
          and CEO interview first.
        </p>
        {!readOnly ? (
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button onClick={onHire} disabled={hirePending}>
              Convert to trainee (hired)
            </Button>
            <Button variant="destructive" onClick={onReject} disabled={rejectPending}>
              Reject candidate
            </Button>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">Read-only view for executive review.</p>
        )}
      </PanelCard>
    </div>
  );
}
