import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Camera, Loader2, Sparkles, Trash2, Upload } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SignedAssetImage } from "@/components/SignedAssetImage";
import { db } from "@/integrations/neon/client";
import {
  gradePaperAssessmentFn,
  registerPaperUploadFn,
  removePaperUploadFn,
  updateInPersonFlowFn,
} from "@/lib/interview/interview.functions";
import type {
  AiEvaluation,
  InPersonFlow,
  InPersonStage,
  InPersonStageStatus,
  PaperAssessment,
} from "@/lib/interview/interview.shared";
import { parseInPersonFlow, parsePaperAssessment } from "@/lib/interview/interview.shared";
import { cn } from "@/lib/utils";

async function authHeaders(): Promise<HeadersInit> {
  const { data } = await db.auth.getSession();
  const token =
    data.session?.access_token ??
    (typeof db.auth.getJWTToken === "function" ? await db.auth.getJWTToken() : null);
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function uploadPaperPhoto(sessionId: string, file: File): Promise<string> {
  const safe = file.name.replace(/[^a-zA-Z0-9_.-]/g, "_");
  const storagePath = `${sessionId}/${Date.now()}-${safe}`;
  const form = new FormData();
  form.append("file", file);
  form.append("bucket", "interview-papers");
  form.append("path", storagePath);

  const res = await fetch("/api/internal/assets/upload", {
    method: "POST",
    credentials: "include",
    headers: await authHeaders(),
    body: form,
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(err.slice(0, 200) || "Upload failed");
  }
  return storagePath;
}

const STAGE_STATUS_LABEL: Record<InPersonStageStatus, string> = {
  pending: "Pending",
  in_progress: "In progress",
  completed: "Completed",
  skipped: "Skipped",
};

export function ProfileReportPanel({
  evaluation,
  status,
  onGenerateProfile,
  generating,
}: {
  evaluation: AiEvaluation | null;
  status: string;
  onGenerateProfile?: () => void;
  generating?: boolean;
}) {
  const hasProfile = !!evaluation?.profile_dimensions?.length;

  if (!hasProfile) {
    return (
      <Card className="rounded-xl p-6 shadow-soft">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <h3 className="font-semibold">AI candidate profile</h3>
        </div>
        <p className="mt-3 text-[13px] text-muted-foreground">
          {generating
            ? "Generating the structured 7-dimension profile — this usually takes 15–30 seconds…"
            : ["submitted", "evaluating", "evaluated"].includes(status)
              ? "The structured AI candidate profile has not been generated yet for this session."
              : "Profile report appears after the candidate completes the test and AI evaluation runs."}
        </p>
        {evaluation?.summary ? (
          <p className="mt-3 rounded-lg border border-border bg-muted/30 p-3 text-[12.5px]">
            {evaluation.summary}
          </p>
        ) : null}
        {["submitted", "evaluating", "evaluated"].includes(status) && onGenerateProfile ? (
          <Button className="mt-4 gap-2" onClick={onGenerateProfile} disabled={generating}>
            {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {generating ? "Generating profile…" : "Generate AI profile report"}
          </Button>
        ) : null}
      </Card>
    );
  }

  const dims = evaluation.profile_dimensions!;

  return (
    <div className="space-y-4">
      <Card className="rounded-xl p-5 shadow-soft">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <h3 className="font-semibold">AI candidate profile</h3>
        </div>
        {evaluation.overall_profile ? (
          <p className="mt-3 text-[13px] leading-relaxed">{evaluation.overall_profile}</p>
        ) : (
          <p className="mt-3 text-[13px] text-muted-foreground">{evaluation.summary}</p>
        )}
      </Card>

      <Card className="rounded-xl p-5 shadow-soft">
        <h4 className="text-[13px] font-semibold">Competency dimensions</h4>
        <div className="mt-4 space-y-4">
          {dims.map((d) => (
            <div key={d.key}>
              <div className="mb-1 flex items-center justify-between gap-2 text-[12.5px]">
                <span className="font-medium">{d.label}</span>
                <span className="tabular-nums font-semibold">{d.score}%</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-muted">
                <div
                  className={cn(
                    "h-full rounded-full transition-all",
                    d.score >= 70 ? "bg-emerald-500" : d.score >= 50 ? "bg-amber-500" : "bg-rose-500",
                  )}
                  style={{ width: `${d.score}%` }}
                />
              </div>
              <p className="mt-1.5 text-[12px] text-muted-foreground">{d.summary}</p>
              {d.evidence.length > 0 && (
                <ul className="mt-1 list-inside list-disc text-[11.5px] text-muted-foreground">
                  {d.evidence.map((e, i) => (
                    <li key={i}>{e}</li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      </Card>

      {(evaluation.personality_summary || evaluation.communication_fit) && (
        <div className="grid gap-4 lg:grid-cols-2">
          {evaluation.personality_summary ? (
            <Card className="rounded-xl p-4 shadow-soft">
              <h4 className="text-[13px] font-semibold">Personality & work style</h4>
              <p className="mt-2 text-[12.5px] leading-relaxed">{evaluation.personality_summary}</p>
            </Card>
          ) : null}
          {evaluation.communication_fit ? (
            <Card className="rounded-xl p-4 shadow-soft">
              <h4 className="text-[13px] font-semibold">Communication & team fit</h4>
              <p className="mt-2 text-[12.5px] leading-relaxed">{evaluation.communication_fit}</p>
            </Card>
          ) : null}
        </div>
      )}

      {evaluation.in_person_synthesis ? (
        <Card className="rounded-xl p-4 shadow-soft">
          <h4 className="text-[13px] font-semibold">In-person interview synthesis</h4>
          <p className="mt-2 text-[12.5px] leading-relaxed">{evaluation.in_person_synthesis}</p>
        </Card>
      ) : null}
    </div>
  );
}

export function InPersonFlowPanel({
  sessionId,
  flowRaw,
}: {
  sessionId: string;
  flowRaw: unknown;
}) {
  const qc = useQueryClient();
  const saveFn = useServerFn(updateInPersonFlowFn);
  const [stages, setStages] = useState<InPersonStage[]>(() => parseInPersonFlow(flowRaw).stages);

  useEffect(() => {
    setStages(parseInPersonFlow(flowRaw).stages);
  }, [flowRaw]);

  const save = useMutation({
    mutationFn: () => saveFn({ data: { sessionId, stages } }),
    onSuccess: () => {
      toast.success("In-person flow saved");
      qc.invalidateQueries({ queryKey: ["interview-session", sessionId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateStage = (id: string, patch: Partial<InPersonStage>) => {
    setStages((prev) =>
      prev.map((s) => {
        if (s.id !== id) return s;
        const next = { ...s, ...patch };
        if (patch.status === "completed" && !next.completed_at) {
          next.completed_at = new Date().toISOString();
        }
        return next;
      }),
    );
  };

  return (
    <div className="space-y-4">
      <Card className="rounded-xl border-primary/20 bg-primary/5 p-4 shadow-soft">
        <h3 className="text-[14px] font-semibold">In-person interview day</h3>
        <p className="mt-1 text-[12px] text-muted-foreground">
          Track each stage when the candidate visits the office: written test, team meet, lunch, and
          verbal interview. Notes and scores feed into the AI profile report.
        </p>
      </Card>

      {stages.map((stage) => (
        <Card key={stage.id} className="rounded-xl p-4 shadow-soft">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h4 className="text-[13px] font-semibold">{stage.label}</h4>
              <p className="mt-0.5 text-[11.5px] text-muted-foreground">{stage.description}</p>
            </div>
            <Select
              value={stage.status}
              onValueChange={(v) => updateStage(stage.id, { status: v as InPersonStageStatus })}
            >
              <SelectTrigger className="h-8 w-[140px] text-[12px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(STAGE_STATUS_LABEL).map(([k, label]) => (
                  <SelectItem key={k} value={k}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_120px]">
            <Textarea
              value={stage.notes}
              onChange={(e) => updateStage(stage.id, { notes: e.target.value })}
              placeholder="Observations: communication, rapport, red flags…"
              className="min-h-[72px] text-[12.5px]"
            />
            <div>
              <label className="text-[11px] font-medium text-muted-foreground">Fit score (1–5)</label>
              <Select
                value={stage.score != null ? String(stage.score) : "__none__"}
                onValueChange={(v) =>
                  updateStage(stage.id, { score: v === "__none__" ? null : Number(v) })
                }
              >
                <SelectTrigger className="mt-1 h-9 text-[12px]">
                  <SelectValue placeholder="—" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Not rated</SelectItem>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <SelectItem key={n} value={String(n)}>
                      {n} / 5
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {stage.completed_at ? (
                <p className="mt-2 text-[10px] text-muted-foreground">
                  Completed {new Date(stage.completed_at).toLocaleString()}
                </p>
              ) : null}
            </div>
          </div>
        </Card>
      ))}

      <Button onClick={() => save.mutate()} disabled={save.isPending} className="gap-2">
        {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        Save in-person flow
      </Button>
    </div>
  );
}

export function PaperTestPanel({
  sessionId,
  paperRaw,
  onGraded,
}: {
  sessionId: string;
  paperRaw: unknown;
  onGraded: () => void;
}) {
  const qc = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const registerFn = useServerFn(registerPaperUploadFn);
  const removeFn = useServerFn(removePaperUploadFn);
  const gradeFn = useServerFn(gradePaperAssessmentFn);
  const paper = parsePaperAssessment(paperRaw) ?? { uploads: [], status: "pending" as const };
  const [uploading, setUploading] = useState(false);

  const handleFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        const path = await uploadPaperPhoto(sessionId, file);
        await registerFn({
          data: { sessionId, storagePath: path, filename: file.name },
        });
      }
      toast.success("Paper photos uploaded");
      qc.invalidateQueries({ queryKey: ["interview-session", sessionId] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const remove = useMutation({
    mutationFn: (uploadId: string) => removeFn({ data: { sessionId, uploadId } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["interview-session", sessionId] }),
  });

  const grade = useMutation({
    mutationFn: () => gradeFn({ data: { sessionId } }),
    onSuccess: () => {
      toast.success("Paper test graded — profile report updated");
      qc.invalidateQueries({ queryKey: ["interview-session", sessionId] });
      onGraded();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <Card className="rounded-xl border-amber-200/60 bg-amber-50/40 p-4 shadow-soft">
        <div className="flex items-start gap-3">
          <Camera className="mt-0.5 h-5 w-5 text-amber-700" />
          <div>
            <h3 className="text-[14px] font-semibold">Paper test grading</h3>
            <p className="mt-1 text-[12px] text-muted-foreground">
              After the candidate completes a paper assessment, photograph each page and upload here.
              AI will transcribe answers, grade them, and merge results into the candidate profile.
            </p>
          </div>
        </div>
      </Card>

      <Card className="rounded-xl p-4 shadow-soft">
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => void handleFiles(e.target.files)}
        />
        <Button
          variant="outline"
          className="gap-2"
          disabled={uploading}
          onClick={() => inputRef.current?.click()}
        >
          {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          Upload paper photos
        </Button>

        {paper.uploads.length > 0 ? (
          <ul className="mt-4 grid gap-3 sm:grid-cols-2">
            {paper.uploads.map((u) => (
              <li key={u.id} className="overflow-hidden rounded-lg border border-border">
                <SignedAssetImage
                  bucket="interview-papers"
                  storagePath={u.storage_path}
                  alt={u.filename}
                  className="h-40 w-full object-cover bg-muted"
                />
                <div className="flex items-center justify-between gap-2 px-2 py-1.5 text-[11px]">
                  <span className="truncate">{u.filename}</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 shrink-0"
                    onClick={() => remove.mutate(u.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-[12px] text-muted-foreground">No paper photos uploaded yet.</p>
        )}

        <Button
          className="mt-4 gap-2"
          disabled={!paper.uploads.length || grade.isPending}
          onClick={() => grade.mutate()}
        >
          {grade.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Sparkles className="h-4 w-4" />
          )}
          Grade paper test with AI
        </Button>
      </Card>

      {paper.status === "graded" && (
        <PaperGradingResults paper={paper} />
      )}
    </div>
  );
}

function PaperGradingResults({ paper }: { paper: PaperAssessment }) {
  return (
    <Card className="rounded-xl p-4 shadow-soft">
      <div className="flex items-center justify-between gap-2">
        <h4 className="text-[13px] font-semibold">Paper grading results</h4>
        {paper.overall_score != null && (
          <Badge variant="outline" className="tabular-nums">
            {paper.overall_score}%
          </Badge>
        )}
      </div>
      {paper.summary ? <p className="mt-2 text-[12.5px]">{paper.summary}</p> : null}
      {paper.extracted_text ? (
        <details className="mt-3">
          <summary className="cursor-pointer text-[12px] font-medium text-primary">
            View extracted text
          </summary>
          <pre className="mt-2 max-h-64 overflow-auto rounded-lg bg-muted/40 p-3 text-[11px] whitespace-pre-wrap">
            {paper.extracted_text}
          </pre>
        </details>
      ) : null}
      {paper.profile_dimensions?.length ? (
        <div className="mt-4 space-y-2">
          <p className="text-[11px] font-medium uppercase text-muted-foreground">From paper test</p>
          {paper.profile_dimensions.map((d) => (
            <div key={d.key} className="flex justify-between text-[12px]">
              <span>{d.label}</span>
              <span className="font-semibold tabular-nums">{d.score}%</span>
            </div>
          ))}
        </div>
      ) : null}
    </Card>
  );
}
