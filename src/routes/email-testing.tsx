import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { QueryLoadError } from "@/components/admin/QueryLoadError";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Mail, Send, Loader2, CheckCircle2, AlertCircle, Copy } from "lucide-react";
import { listAssignmentsFn } from "@/lib/assignments.functions";
import { enqueueAssignmentEmailFn } from "@/lib/email/enqueue-assignment-email.functions";
import {
  ASSIGNMENT_EMAIL_TYPES,
  type AssignmentEmailType,
  type EnqueueAssignmentEmailResult,
} from "@/lib/email/enqueue-assignment-email.shared";

export const Route = createFileRoute("/email-testing")({
  head: () => ({ meta: [{ title: "Email Testing — Alyson" }] }),
  component: EmailTestingPage,
});

const EMAIL_TYPE_LABELS: Record<AssignmentEmailType, string> = {
  initial: "Initial assignment",
  reminder_day7: "Day 7 reminder",
  reminder_day14: "Day 14 reminder",
  retake: "Retake offer",
  escalation_day30: "Day 30 escalation",
};

type EnqueueStatus = "queued" | "duplicate_pending" | "duplicate_logged" | "error";

function resultStatus(result: EnqueueAssignmentEmailResult): {
  status: EnqueueStatus;
  message: string;
  detail?: string;
} {
  if (!result.ok) {
    return { status: "error", message: "Enqueue failed", detail: result.error };
  }
  if (result.queued) {
    return {
      status: "queued",
      message: "Email queued",
      detail: `queueId=${result.queueId} · notificationLogId=${result.notificationLogId}`,
    };
  }
  if (result.reason === "duplicate_pending") {
    return {
      status: "duplicate_pending",
      message: "Duplicate pending",
      detail: result.queueId != null ? `Existing queue id: ${result.queueId}` : undefined,
    };
  }
  return {
    status: "duplicate_logged",
    message: "Already logged",
    detail: result.notificationLogId
      ? `notificationLogId=${result.notificationLogId}`
      : "Idempotency key already exists in notification_log",
  };
}

const STATUS_STYLES: Record<
  EnqueueStatus,
  { badge: string; icon: typeof CheckCircle2 }
> = {
  queued: {
    badge: "border-success/30 bg-success/10 text-success",
    icon: CheckCircle2,
  },
  duplicate_pending: {
    badge: "border-amber-500/30 bg-amber-500/10 text-amber-700",
    icon: Copy,
  },
  duplicate_logged: {
    badge: "border-amber-500/30 bg-amber-500/10 text-amber-700",
    icon: Copy,
  },
  error: {
    badge: "border-destructive/30 bg-destructive/10 text-destructive",
    icon: AlertCircle,
  },
};

function EmailTestingPage() {
  const [assignmentId, setAssignmentId] = useState("");
  const [emailType, setEmailType] = useState<AssignmentEmailType>("initial");
  const [lastResult, setLastResult] = useState<ReturnType<typeof resultStatus> | null>(
    null,
  );
  const queryClient = useQueryClient();

  const loadAssignments = useServerFn(listAssignmentsFn);
  const enqueueEmail = useServerFn(enqueueAssignmentEmailFn);

  const { data: assignments = [], isLoading: loadingAssignments, isError, refetch } = useQuery({
    queryKey: ["assignments", "list"],
    queryFn: () => loadAssignments(),
  });

  const selected = assignments.find((a) => a.id === assignmentId);

  const mutation = useMutation({
    mutationFn: async () => {
      if (!selected) throw new Error("Select an assignment");
      return enqueueEmail({
        data: {
          user_id: selected.learner_user_id,
          assignment_id: selected.id,
          email_type: emailType,
        },
      });
    },
    onSuccess: (result) => {
      const parsed = resultStatus(result);
      setLastResult(parsed);
      queryClient.invalidateQueries({ queryKey: ["email-notifications"] });
      queryClient.invalidateQueries({ queryKey: ["email-metrics"] });

      if (parsed.status === "queued") {
        toast.success(parsed.message, { description: parsed.detail });
      } else if (parsed.status === "error") {
        toast.error(parsed.message, { description: parsed.detail });
      } else {
        toast.info(parsed.message, { description: parsed.detail });
      }
    },
    onError: (e: Error) => {
      const parsed = { status: "error" as const, message: "Request failed", detail: e.message };
      setLastResult(parsed);
      toast.error(parsed.message, { description: e.message });
    },
  });

  const StatusIcon = lastResult ? STATUS_STYLES[lastResult.status].icon : CheckCircle2;

  return (
    <AdminLayout
      title="Email Testing & Verification"
      subtitle="Enqueue assignment workflow emails for AWS Step Functions — no in-app SES send"
    >
      <div className="space-y-6">
        {isError ? (
          <QueryLoadError
            message="Could not load assignments for testing"
            onRetry={() => void refetch()}
          />
        ) : null}
        <Card className="rounded-xl border-border bg-card p-5 shadow-soft">
          <h3 className="mb-4 text-sm font-semibold text-foreground">Enqueue test email</h3>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Assignment</Label>
              <Select
                value={assignmentId}
                onValueChange={(v) => {
                  setAssignmentId(v);
                  setLastResult(null);
                }}
                disabled={loadingAssignments || isError}
              >
                <SelectTrigger>
                  <SelectValue
                    placeholder={
                      loadingAssignments ? "Loading…" : isError ? "Unavailable" : "Select assignment"
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {assignments.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.learner?.display_name ?? a.learner?.email ?? "Learner"} ·{" "}
                      {a.assessment.title} ({a.status})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Email type</Label>
              <Select
                value={emailType}
                onValueChange={(v) => {
                  setEmailType(v as AssignmentEmailType);
                  setLastResult(null);
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ASSIGNMENT_EMAIL_TYPES.map((type) => (
                    <SelectItem key={type} value={type}>
                      {EMAIL_TYPE_LABELS[type]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {selected && (
            <div className="mt-4 rounded-lg border border-border bg-muted/30 p-3 text-[12px] text-muted-foreground">
              <div>
                <span className="font-medium text-foreground">Learner:</span>{" "}
                {selected.learner?.display_name ?? "—"} ({selected.learner?.email ?? "no email"})
              </div>
              <div>
                <span className="font-medium text-foreground">Assessment:</span>{" "}
                {selected.assessment.title}
              </div>
              <div>
                <span className="font-medium text-foreground">user_id:</span>{" "}
                <code className="text-[11px]">{selected.learner_user_id}</code>
              </div>
              <div>
                <span className="font-medium text-foreground">assignment_id:</span>{" "}
                <code className="text-[11px]">{selected.id}</code>
              </div>
            </div>
          )}

          <p className="mt-3 text-[11px] text-muted-foreground">
            Sender:{" "}
            <span className="font-mono text-foreground">training.group@cintara.ai</span> · Writes
            to <code className="text-[11px]">email_queue</code> +{" "}
            <code className="text-[11px]">notification_log</code> for Step Functions / SES.
          </p>

          <Button
            className="mt-4"
            disabled={!assignmentId || mutation.isPending || isError}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Enqueueing…
              </>
            ) : (
              <>
                <Send className="mr-2 h-4 w-4" />
                Enqueue email
              </>
            )}
          </Button>
        </Card>

        {lastResult && (
          <Card className="rounded-xl border-border bg-card p-5 shadow-soft">
            <div className="flex items-start gap-3">
              <StatusIcon
                className={`mt-0.5 h-5 w-5 ${
                  lastResult.status === "queued"
                    ? "text-success"
                    : lastResult.status === "error"
                      ? "text-destructive"
                      : "text-amber-600"
                }`}
              />
              <div className="flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold text-foreground">Last result</span>
                  <Badge
                    variant="outline"
                    className={`text-[10px] ${STATUS_STYLES[lastResult.status].badge}`}
                  >
                    {lastResult.status}
                  </Badge>
                </div>
                <p className="mt-1 text-sm text-foreground">{lastResult.message}</p>
                {lastResult.detail && (
                  <p className="mt-1 font-mono text-[11px] text-muted-foreground">
                    {lastResult.detail}
                  </p>
                )}
              </div>
            </div>
          </Card>
        )}

        <Card className="flex flex-wrap items-center justify-between gap-3 rounded-xl border-border bg-card p-5 shadow-soft">
          <div className="flex items-center gap-2 text-sm">
            <Mail className="h-4 w-4 text-primary" />
            <span className="font-medium text-foreground">Verify on the Notifications dashboard</span>
            <span className="text-[11px] text-muted-foreground">
              Queue depth and send logs update after Step Functions processes the row.
            </span>
          </div>
          <Button asChild variant="outline" size="sm">
            <Link to="/notifications">Open Notifications</Link>
          </Button>
        </Card>
      </div>
    </AdminLayout>
  );
}
