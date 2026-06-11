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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Calendar, PlayCircle, Plus, User } from "lucide-react";
import {
  createInterviewSessionFn,
  listInterviewAssessmentsFn,
  listInterviewSessionsFn,
  openInterviewSessionFn,
} from "@/lib/interview/interview.functions";
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
  const listFn = useServerFn(listInterviewSessionsFn);
  const { data: sessions = [], isLoading } = useQuery({
    queryKey: ["interview-sessions"],
    queryFn: () => listFn(),
    refetchInterval: 5000,
  });

  return (
    <AdminLayout title="Interviews" subtitle="Schedule and proctor external candidate tests">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-[13px] text-muted-foreground">
          Click <strong>Open test</strong> on a session row when the candidate is in the waiting room (other browser/incognito). They will then see Start test.
        </p>
        <div className="flex shrink-0 items-center gap-2">
          <Button asChild variant="outline" size="sm">
            <Link to="/assessments/builder" search={{ purpose: "interview" }}>
              Create interview assessment
            </Link>
          </Button>
          <ScheduleDialog onCreated={() => qc.invalidateQueries({ queryKey: ["interview-sessions"] })} />
        </div>
      </div>

      <Card className="overflow-hidden rounded-xl border-border shadow-soft">
        {isLoading ? (
          <div className="p-8 text-center text-sm text-muted-foreground">Loading…</div>
        ) : sessions.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            No interview sessions yet. Schedule one to send a candidate a magic link.
          </div>
        ) : (
          <div className="divide-y divide-border">
            {sessions.map((s) => (
              <InterviewSessionRow key={s.id} session={s} />
            ))}
          </div>
        )}
      </Card>
    </AdminLayout>
  );
}

function InterviewSessionRow({ session: s }: { session: InterviewSessionListItem }) {
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
      {canOpen ? (
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
    </div>
  );
}

function ScheduleDialog({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [candidateName, setCandidateName] = useState("");
  const [candidateEmail, setCandidateEmail] = useState("");
  const [role, setRole] = useState("Data Scientist");
  const [level, setLevel] = useState("Mid-Level");
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
  const { data: assessments = [] } = useQuery({
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
          level,
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
            <Input
              placeholder="Candidate name"
              value={candidateName}
              onChange={(e) => setCandidateName(e.target.value)}
            />
            <Input
              type="email"
              placeholder="Candidate email"
              value={candidateEmail}
              onChange={(e) => setCandidateEmail(e.target.value)}
            />
            <Input placeholder="Role" value={role} onChange={(e) => setRole(e.target.value)} />
            <Select value={level} onValueChange={setLevel}>
              <SelectTrigger>
                <SelectValue />
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
                <SelectValue placeholder="Interview assessment" />
              </SelectTrigger>
              <SelectContent>
                {assessments.length === 0 ? (
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
