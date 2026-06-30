import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Calendar, PlayCircle, Plus, Trash2, User } from "lucide-react";
import { BulkInterviewImportDialog } from "@/components/hiring/BulkInterviewImportDialog";
import { HiringWorkflowStrip } from "@/components/hiring/HiringWorkflowStrip";
import { InterviewGuide } from "@/components/hiring/InterviewGuide";
import { QueryLoadError } from "@/components/admin/QueryLoadError";
import { INTERVIEW_LIST_POLL_MS, INTERVIEW_POLL_OPTS } from "@/lib/query-options";
import { useSession } from "@/lib/auth";
import { isExecutiveReadOnly } from "@/lib/role-access";
import {
  createInterviewSessionFn,
  deleteInterviewSessionFn,
  listInterviewAssessmentsFn,
  listInterviewSessionsFn,
  openInterviewSessionFn,
} from "@/lib/interview/interview.functions";
import { INTERVIEW_LIST_DEFAULT_LIMIT } from "@/lib/interview/interview.shared";
import type {
  AssessmentMode,
  HireRecommendation,
  InterviewSessionListItem,
  InterviewSessionStatus,
} from "@/lib/interview/interview.shared";
import { ASSESSMENT_MODE_LABELS } from "@/lib/interview/interview.shared";

const REC_LABEL: Record<HireRecommendation, string> = {
  strong_hire: "Strong hire",
  hire: "Hire",
  borderline: "Borderline",
  no_hire: "No hire",
};

export const Route = createFileRoute("/interviews/")({
  head: () => ({ meta: [{ title: "Interviews — Alyson" }] }),
  component: InterviewsPage,
});

const STATUS_STYLE: Record<InterviewSessionStatus, string> = {
  scheduled: "border-blue-200 bg-blue-50 text-blue-700",
  waiting: "border-violet-200 bg-violet-50 text-violet-700",
  opened: "border-amber-200 bg-amber-50 text-amber-800",
  in_progress: "border-orange-200 bg-orange-50 text-orange-800",
  submitted: "border-sky-200 bg-sky-50 text-sky-700",
  evaluating: "border-indigo-200 bg-indigo-50 text-indigo-700",
  evaluated: "border-emerald-200 bg-emerald-50 text-emerald-700",
  cancelled: "border-slate-200 bg-slate-100 text-slate-600",
  expired: "border-slate-200 bg-slate-100 text-slate-600",
};

function InterviewsPage() {
  const qc = useQueryClient();
  const { roles } = useSession();
  const readOnly = isExecutiveReadOnly(roles);
  const listFn = useServerFn(listInterviewSessionsFn);
  const [page, setPage] = useState(0);
  const [deleteTarget, setDeleteTarget] = useState<InterviewSessionListItem | null>(null);
  const deleteFn = useServerFn(deleteInterviewSessionFn);
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["interview-sessions", page],
    queryFn: () =>
      listFn({
        data: { limit: INTERVIEW_LIST_DEFAULT_LIMIT, offset: page * INTERVIEW_LIST_DEFAULT_LIMIT },
      }),
    refetchInterval: INTERVIEW_LIST_POLL_MS,
    ...INTERVIEW_POLL_OPTS,
  });
  const sessions = data?.sessions ?? [];
  const total = data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / INTERVIEW_LIST_DEFAULT_LIMIT));

  const remove = useMutation({
    mutationFn: (sessionId: string) => deleteFn({ data: { sessionId } }),
    onSuccess: () => {
      toast.success("Interview session deleted");
      setDeleteTarget(null);
      qc.invalidateQueries({ queryKey: ["interview-sessions"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <AdminLayout
      title="Interviews"
      subtitle={
        readOnly
          ? "Read-only view of candidate interview sessions"
          : "Schedule and proctor external candidate tests"
      }
    >
      <HiringWorkflowStrip className="mb-5" />
      <InterviewGuide variant="hub" className="mb-5" />
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-[13px] text-muted-foreground">
          Click <strong>Open test</strong> on a session row when the candidate is in the waiting room (other browser/incognito). They will then see Start test.
        </p>
        <div className="flex shrink-0 items-center gap-2">
          <Button asChild variant="outline" size="sm">
            <Link to="/interviews/assessments">Interview tests</Link>
          </Button>
          {!readOnly ? (
            <>
              <Button asChild variant="outline" size="sm">
                <Link to="/assessments/builder" search={{ purpose: "interview" }}>
                  Create interview test
                </Link>
              </Button>
              <BulkInterviewImportDialog
                onImported={() => qc.invalidateQueries({ queryKey: ["interview-sessions"] })}
              />
              <ScheduleDialog onCreated={() => qc.invalidateQueries({ queryKey: ["interview-sessions"] })} />
            </>
          ) : null}
        </div>
      </div>

      <Card className="overflow-hidden rounded-xl border-border shadow-soft">
        {isLoading ? (
          <div className="p-8 text-center text-sm text-muted-foreground">Loading…</div>
        ) : isError ? (
          <div className="p-6">
            <QueryLoadError message="Could not load interview sessions" onRetry={() => void refetch()} />
          </div>
        ) : sessions.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            No interview sessions yet. Schedule one to send a candidate a magic link.
          </div>
        ) : (
          <>
            <div className="divide-y divide-border">
              {sessions.map((s) => (
                <InterviewSessionRow
                  key={s.id}
                  session={s}
                  readOnly={readOnly}
                  onDelete={() => setDeleteTarget(s)}
                />
              ))}
            </div>
            {total > INTERVIEW_LIST_DEFAULT_LIMIT ? (
              <div className="flex items-center justify-between border-t border-border px-4 py-3 text-[12px] text-muted-foreground">
                <span>
                  Showing {page * INTERVIEW_LIST_DEFAULT_LIMIT + 1}–
                  {Math.min((page + 1) * INTERVIEW_LIST_DEFAULT_LIMIT, total)} of {total}
                </span>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={page === 0}
                    onClick={() => setPage((p) => Math.max(0, p - 1))}
                  >
                    Previous
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={page + 1 >= pageCount}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    Next
                  </Button>
                </div>
              </div>
            ) : null}
          </>
        )}
      </Card>

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete interview session?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the session for{" "}
              <strong>{deleteTarget?.candidate_name}</strong> ({deleteTarget?.candidate_email}),
              including submissions, AI evaluation, paper uploads, and proctor notes. The interview
              assessment template is not deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={remove.isPending}
              onClick={(e) => {
                e.preventDefault();
                if (deleteTarget) remove.mutate(deleteTarget.id);
              }}
            >
              {remove.isPending ? "Deleting…" : "Delete session"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AdminLayout>
  );
}

function InterviewSessionRow({
  session: s,
  readOnly,
  onDelete,
}: {
  session: InterviewSessionListItem;
  readOnly: boolean;
  onDelete: () => void;
}) {
  const qc = useQueryClient();
  const openFn = useServerFn(openInterviewSessionFn);
  const isPaperOnly = s.assessment_mode === "paper_only";
  const canOpen = !isPaperOnly && ["waiting", "opened"].includes(s.status);

  const open = useMutation({
    mutationFn: () => openFn({ data: { sessionId: s.id } }),
    onSuccess: () => {
      toast.success("Test opened — candidate can click Start test.");
      qc.invalidateQueries({ queryKey: ["interview-sessions"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="flex flex-wrap items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/40">
      <Link
        to="/interviews/$sessionId"
        params={{ sessionId: s.id }}
        className="min-w-0 flex-1"
      >
        <div className="flex items-center gap-2">
          <User className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-[13px] font-medium">{s.candidate_name}</span>
          <span className="text-[12px] text-muted-foreground">{s.candidate_email}</span>
        </div>
        <div className="mt-0.5 text-[12px] text-muted-foreground">
          {s.assessment_title} · {s.role} · {new Date(s.scheduled_at).toLocaleString()}
        </div>
      </Link>
      <Badge variant="outline" className={STATUS_STYLE[s.status]}>
        {s.status.replace("_", " ")}
      </Badge>
      {isPaperOnly ? (
        <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-800 text-[10px]">
          Paper only
        </Badge>
      ) : s.assessment_mode === "hybrid" ? (
        <Badge variant="outline" className="text-[10px]">
          Online + paper
        </Badge>
      ) : null}
      {s.final_score != null && (
        <Badge variant="outline" className="tabular-nums">
          {Math.round(Number(s.final_score))}%
        </Badge>
      )}
      {s.final_recommendation && (
        <Badge variant="outline" className="hidden sm:inline-flex">
          {REC_LABEL[s.final_recommendation as HireRecommendation]}
        </Badge>
      )}
      {canOpen && !readOnly ? (
        <Button
          size="sm"
          className="gap-1.5 shrink-0"
          disabled={open.isPending}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            open.mutate();
          }}
        >
          <PlayCircle className="h-3.5 w-3.5" />
          {open.isPending ? "Opening…" : "Open test"}
        </Button>
      ) : null}
      <Button asChild size="sm" variant="outline" className="shrink-0">
        <Link to="/interviews/$sessionId" params={{ sessionId: s.id }}>
          Manage
        </Link>
      </Button>
      {!readOnly ? (
      <Button
        size="sm"
        variant="outline"
        className="shrink-0 text-destructive hover:text-destructive"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onDelete();
        }}
        aria-label={`Delete session for ${s.candidate_name}`}
      >
        <Trash2 className="h-3.5 w-3.5" />
      </Button>
      ) : null}
    </div>
  );
}

function ScheduleDialog({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [candidateName, setCandidateName] = useState("");
  const [candidateEmail, setCandidateEmail] = useState("");
  const [role, setRole] = useState("");
  const [level, setLevel] = useState("");
  const [assessmentId, setAssessmentId] = useState("");
  const [scheduledAt, setScheduledAt] = useState(() => {
    const d = new Date();
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 16);
  });
  const [expiresAt, setExpiresAt] = useState(() => {
    const d = new Date(Date.now() + 7 * 86400000);
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 16);
  });
  const [magicLink, setMagicLink] = useState<string | null>(null);
  const [assessmentMode, setAssessmentMode] = useState<AssessmentMode>("online");
  const [createdMode, setCreatedMode] = useState<AssessmentMode | null>(null);

  const listAssessments = useServerFn(listInterviewAssessmentsFn);
  const { data: assessments = [], isError: assessmentsError, refetch: refetchAssessments } = useQuery({
    queryKey: ["interview-assessments"],
    queryFn: () => listAssessments(),
    enabled: open,
  });

  const createFn = useServerFn(createInterviewSessionFn);
  const create = useMutation({
    mutationFn: () =>
      createFn({
        data: {
          assessmentId,
          candidateName,
          candidateEmail,
          role,
          level: level || "Mid-Level",
          scheduledAt: new Date(scheduledAt).toISOString(),
          expiresAt: new Date(expiresAt).toISOString(),
          assessmentMode,
        },
      }),
    onSuccess: (res) => {
      setCreatedMode(res.assessmentMode ?? assessmentMode);
      setMagicLink(res.magicLink);
      if (res.assessmentMode === "paper_only") {
        toast.success("Paper-only session created — open Manage to upload paper photos.");
      } else if (res.emailSent) {
        toast.success("Interview scheduled — invite email queued.");
      } else {
        toast.warning(
          res.emailError
            ? `Session created — copy the link below (email failed: ${res.emailError})`
            : "Session created — copy the magic link below.",
        );
      }
      onCreated();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const reset = () => {
    setMagicLink(null);
    setCreatedMode(null);
    setCandidateName("");
    setCandidateEmail("");
    setAssessmentId("");
    setAssessmentMode("online");
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button className="gap-2 shrink-0">
          <Plus className="h-4 w-4" />
          Schedule interview
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Schedule interview test</DialogTitle>
        </DialogHeader>
        {magicLink || createdMode === "paper_only" ? (
          <div className="space-y-3 text-[13px]">
            {createdMode === "paper_only" ? (
              <p className="text-muted-foreground">
                Paper-only session is ready. Click <strong>Manage</strong> on the interviews list,
                open the <strong>Paper test</strong> tab, upload photos, then run AI grading.
              </p>
            ) : (
              <>
                <p className="text-muted-foreground">
                  Invite sent (if SES is configured). Copy the magic link for backup:
                </p>
                {magicLink ? (
                  <Input readOnly value={magicLink} onFocus={(e) => e.target.select()} />
                ) : null}
              </>
            )}
            <DialogFooter>
              <Button onClick={() => setOpen(false)}>Done</Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-3">
            <Input placeholder="Candidate name" value={candidateName} onChange={(e) => setCandidateName(e.target.value)} />
            <Input
              type="email"
              placeholder="Candidate email"
              value={candidateEmail}
              onChange={(e) => setCandidateEmail(e.target.value)}
            />
            <div>
              <label className="text-[11px] font-medium text-muted-foreground">
                Job title for this interview
              </label>
              <Input
                placeholder="e.g. Software Engineer, Marketing Analyst"
                value={role}
                onChange={(e) => setRole(e.target.value)}
                className="mt-1"
              />
              <p className="mt-1 text-[11px] text-muted-foreground">
                Shown to the candidate in the invite — enter the role you are hiring for (nothing is pre-filled).
              </p>
            </div>
            <Select value={level || undefined} onValueChange={setLevel}>
              <SelectTrigger>
                <SelectValue placeholder="Seniority level (optional)" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Novice">Novice</SelectItem>
                <SelectItem value="Mid-Level">Mid-Level</SelectItem>
                <SelectItem value="Expert">Expert</SelectItem>
              </SelectContent>
            </Select>
            <div>
              <label className="text-[11px] font-medium text-muted-foreground">Assessment delivery</label>
              <Select
                value={assessmentMode}
                onValueChange={(v) => setAssessmentMode(v as AssessmentMode)}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.entries(ASSESSMENT_MODE_LABELS) as [AssessmentMode, string][]).map(
                    ([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ),
                  )}
                </SelectContent>
              </Select>
              {assessmentMode === "paper_only" ? (
                <p className="mt-1 text-[11px] text-muted-foreground">
                  No magic link — HR uploads completed paper photos after the in-person test.
                </p>
              ) : null}
            </div>
            <Select value={assessmentId} onValueChange={setAssessmentId}>
              <SelectTrigger>
                <SelectValue
                  placeholder={
                    assessmentsError ? "Failed to load assessments" : "Interview assessment"
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {assessmentsError ? (
                  <SelectItem value="_err" disabled>
                    Could not load — close and reopen dialog to retry
                  </SelectItem>
                ) : assessments.length === 0 ? (
                  <SelectItem value="_none" disabled>
                    No interview assessments — create one with purpose &quot;interview&quot;
                  </SelectItem>
                ) : (
                  assessments.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.title}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
            <div>
              <label className="text-[11px] font-medium text-muted-foreground">Scheduled</label>
              <Input
                type="datetime-local"
                value={scheduledAt}
                onChange={(e) => setScheduledAt(e.target.value)}
                className="mt-1"
              />
            </div>
            <div>
              <label className="text-[11px] font-medium text-muted-foreground">Link expires</label>
              <Input
                type="datetime-local"
                value={expiresAt}
                onChange={(e) => setExpiresAt(e.target.value)}
                className="mt-1"
              />
            </div>
            <DialogFooter>
              <Button
                disabled={
                  !candidateName ||
                  !candidateEmail ||
                  !role.trim() ||
                  !assessmentId ||
                  create.isPending
                }
                onClick={() => create.mutate()}
                className="gap-2"
              >
                <Calendar className="h-4 w-4" />
                {create.isPending
                  ? "Scheduling…"
                  : assessmentMode === "paper_only"
                    ? "Schedule paper session"
                    : "Schedule & send invite"}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
