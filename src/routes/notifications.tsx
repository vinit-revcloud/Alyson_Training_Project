import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { MetricCard } from "@/components/admin/MetricCard";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Mail,
  Send,
  AlertTriangle,
  Clock,
  ShieldAlert,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import { fetchEmailMetrics, type EmailStatus } from "@/lib/notifications-api";
import { getAssignmentMetrics } from "@/lib/test-assignments-api";
import {
  fetchEmailHealthFn,
  processEmailQueueFn,
} from "@/lib/email/email-settings.functions";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export const Route = createFileRoute("/notifications")({
  head: () => ({ meta: [{ title: "Notifications — Alyson" }] }),
  component: NotificationsPage,
});

const STATUS_STYLES: Record<EmailStatus, string> = {
  sent: "bg-success/10 text-success border-success/30",
  pending: "bg-muted text-muted-foreground border-border",
  queued: "bg-primary/10 text-primary border-primary/30",
  bounced: "bg-destructive/10 text-destructive border-destructive/30",
  failed: "bg-destructive/10 text-destructive border-destructive/30",
  complained: "bg-destructive/10 text-destructive border-destructive/30",
  suppressed: "bg-warning/10 text-warning border-warning/30",
};

function StatusBadge({ status }: { status: EmailStatus }) {
  return (
    <Badge
      variant="outline"
      className={cn("capitalize text-[11px] font-medium", STATUS_STYLES[status])}
    >
      {status}
    </Badge>
  );
}

function NotificationsPage() {
  const qc = useQueryClient();
  const loadHealth = useServerFn(fetchEmailHealthFn);
  const runProcess = useServerFn(processEmailQueueFn);

  const emails = useQuery({
    queryKey: ["email-notifications"],
    queryFn: fetchEmailMetrics,
    refetchInterval: 60 * 60_000,
  });
  const health = useQuery({
    queryKey: ["email-health"],
    queryFn: () => loadHealth(),
    refetchInterval: 60_000,
  });
  const assignments = useQuery({
    queryKey: ["assignment-metrics-notifications"],
    queryFn: getAssignmentMetrics,
    refetchInterval: 60 * 60_000,
  });

  const processMut = useMutation({
    mutationFn: () => runProcess(),
    onSuccess: (r) => {
      toast.success(`Sent ${r.processed} email(s) from queue`);
      void qc.invalidateQueries({ queryKey: ["email-notifications"] });
      void qc.invalidateQueries({ queryKey: ["email-health"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const m = emails.data;
  const a = assignments.data;
  const h = health.data;

  return (
    <AdminLayout
      title="Notifications & Email Activity"
      subtitle="Reminder, escalation and delivery status across the platform · auto-refreshes hourly"
      actions={
        <div className="flex gap-2">
          <Link
            to="/notifications/schedules"
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground hover:bg-accent"
          >
            <Clock className="h-3.5 w-3.5 text-primary" /> Schedules
          </Link>
          <Link
            to="/notifications/templates"
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground hover:bg-accent"
          >
            <Mail className="h-3.5 w-3.5 text-primary" /> Edit templates
          </Link>
          <Button
            size="sm"
            variant="default"
            className="h-8"
            disabled={processMut.isPending}
            onClick={() => processMut.mutate()}
          >
            {processMut.isPending ? "Sending…" : "Process queue"}
          </Button>
        </div>
      }
    >
      <div className="space-y-6">
        {h ? (
          <section className="grid grid-cols-2 gap-3 md:grid-cols-3">
            <Card className="rounded-xl border-border bg-card p-4">
              <div className="text-[11px] uppercase text-muted-foreground">Queue depth</div>
              <div className="mt-1 text-2xl font-semibold">{h.queueDepth}</div>
            </Card>
            <Card className="rounded-xl border-border bg-card p-4">
              <div className="text-[11px] uppercase text-muted-foreground">Suppressed</div>
              <div className="mt-1 text-2xl font-semibold">{h.suppressedCount}</div>
            </Card>
            <Card className="rounded-xl border-border bg-card p-4">
              <div className="text-[11px] uppercase text-muted-foreground">Last state update</div>
              <div className="mt-1 text-sm font-medium">
                {h.lastProcessed ? new Date(h.lastProcessed).toLocaleString() : "—"}
              </div>
            </Card>
          </section>
        ) : null}

        {/* Assignment metrics */}
        <section>
          <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Assignment health
          </h2>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <MetricCard
              label="Pending"
              value={String((a?.assigned ?? 0) + (a?.in_progress ?? 0))}
              icon={Clock}
              sub={`${a?.assigned ?? 0} assigned · ${a?.in_progress ?? 0} in progress`}
            />
            <MetricCard
              label="Overdue / expired"
              value={String(a?.expired ?? 0)}
              icon={AlertTriangle}
              trend="down"
              sub="Past due date"
            />
            <MetricCard
              label="At risk / failed"
              value={String(a?.failed_capped ?? 0)}
              icon={ShieldAlert}
              trend="down"
              sub={`${a?.failureRetakeRate ?? 0}% retake rate`}
            />
            <MetricCard
              label="Completion"
              value={`${a?.completionPct ?? 0}%`}
              icon={CheckCircle2}
              sub={`${a?.passed ?? 0} passed of ${a?.total ?? 0}`}
            />
          </div>
        </section>

        {/* Email metrics */}
        <section>
          <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Email delivery
          </h2>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <MetricCard
              label="Total sent"
              value={String(m?.total ?? 0)}
              icon={Mail}
              sub="Last 500 events"
            />
            <MetricCard
              label="Delivered"
              value={String(m?.sent ?? 0)}
              icon={Send}
              sub={
                m?.total
                  ? `${Math.round(((m.sent ?? 0) / m.total) * 100)}% success`
                  : "—"
              }
            />
            <MetricCard
              label="Bounced"
              value={String(m?.bounced ?? 0)}
              icon={XCircle}
              trend="down"
              sub="Hard / soft bounces"
            />
            <MetricCard
              label="Failed / queued"
              value={String((m?.failed ?? 0) + (m?.pending ?? 0))}
              icon={AlertTriangle}
              trend="down"
              sub={`${m?.pending ?? 0} pending retry`}
            />
          </div>
        </section>

        {/* Recent emails */}
        <Card className="rounded-xl border-border bg-card p-5 shadow-soft">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-foreground">
                Recent email activity
              </h3>
              <p className="text-[11px] text-muted-foreground">
                Reminders, escalations and notifications sent to learners and staff
              </p>
            </div>
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-[11px] uppercase tracking-wider text-muted-foreground">
                    Recipient
                  </TableHead>
                  <TableHead className="text-[11px] uppercase tracking-wider text-muted-foreground">
                    Subject
                  </TableHead>
                  <TableHead className="text-[11px] uppercase tracking-wider text-muted-foreground">
                    Kind
                  </TableHead>
                  <TableHead className="text-[11px] uppercase tracking-wider text-muted-foreground">
                    Audience
                  </TableHead>
                  <TableHead className="text-[11px] uppercase tracking-wider text-muted-foreground">
                    Status
                  </TableHead>
                  <TableHead className="text-[11px] uppercase tracking-wider text-muted-foreground">
                    Sent
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(m?.recent ?? []).map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="text-xs font-medium text-foreground">
                      {row.recipient_email}
                    </TableCell>
                    <TableCell className="max-w-[280px] truncate text-xs text-foreground">
                      {row.subject}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="capitalize text-[11px]">
                        {row.kind}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs capitalize text-muted-foreground">
                      {row.audience}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={row.status} />
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {row.sent_at
                        ? new Date(row.sent_at).toLocaleString()
                        : "—"}
                    </TableCell>
                  </TableRow>
                ))}
                {!m?.recent.length && (
                  <TableRow>
                    <TableCell
                      colSpan={6}
                      className="py-8 text-center text-xs text-muted-foreground"
                    >
                      {emails.isLoading
                        ? "Loading…"
                        : "No email activity yet. Reminders and escalations will appear here."}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </Card>

        {/* SES delivery monitoring: failures + bounces */}
        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="rounded-xl border-border bg-card p-5 shadow-soft">
            <div className="mb-3 flex items-center gap-2">
              <XCircle className="h-4 w-4 text-destructive" />
              <div>
                <h3 className="text-sm font-semibold text-foreground">
                  Recent delivery failures
                </h3>
                <p className="text-[11px] text-muted-foreground">
                  SES rejects, hard failures, suppressed sends
                </p>
              </div>
            </div>
            <div className="space-y-2">
              {(m?.recent.filter((r) => r.status === "failed" || r.status === "suppressed") ?? []).slice(0, 8).map((row) => (
                <div
                  key={row.id}
                  className="rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="truncate text-xs font-medium text-foreground">
                      {row.recipient_email}
                    </div>
                    <StatusBadge status={row.status} />
                  </div>
                  <div className="mt-1 truncate text-[11px] text-muted-foreground">
                    {row.subject}
                  </div>
                  {row.error_message && (
                    <div className="mt-1 truncate text-[11px] text-destructive">
                      {row.error_message}
                    </div>
                  )}
                </div>
              ))}
              {!m?.recent.some((r) => r.status === "failed" || r.status === "suppressed") && (
                <div className="py-6 text-center text-xs text-muted-foreground">
                  No delivery failures. 🎉
                </div>
              )}
            </div>
          </Card>

          <Card className="rounded-xl border-border bg-card p-5 shadow-soft">
            <div className="mb-3 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-warning" />
              <div>
                <h3 className="text-sm font-semibold text-foreground">
                  Bounced &amp; complained
                </h3>
                <p className="text-[11px] text-muted-foreground">
                  Recipients flagged by SES CloudWatch metrics
                </p>
              </div>
            </div>
            <div className="space-y-2">
              {(m?.recent.filter((r) => r.status === "bounced" || r.status === "complained") ?? []).slice(0, 8).map((row) => (
                <div
                  key={row.id}
                  className="flex items-center justify-between gap-2 rounded-lg border border-warning/30 bg-warning/5 px-3 py-2"
                >
                  <div className="min-w-0">
                    <div className="truncate text-xs font-medium text-foreground">
                      {row.recipient_email}
                    </div>
                    <div className="text-[11px] text-muted-foreground">
                      {row.kind} · {row.sent_at ? new Date(row.sent_at).toLocaleDateString() : "—"}
                    </div>
                  </div>
                  <StatusBadge status={row.status} />
                </div>
              ))}
              {!m?.recent.some((r) => r.status === "bounced" || r.status === "complained") && (
                <div className="py-6 text-center text-xs text-muted-foreground">
                  No bounces or complaints reported.
                </div>
              )}
            </div>
          </Card>
        </div>


        {/* Escalations */}
        <Card className="rounded-xl border-border bg-card p-5 shadow-soft">
          <div className="mb-3 flex items-center gap-2">
            <ShieldAlert className="h-4 w-4 text-primary" />
            <div>
              <h3 className="text-sm font-semibold text-foreground">
                HR &amp; CEO escalations
              </h3>
              <p className="text-[11px] text-muted-foreground">
                Notifications routed to leadership for overdue or at-risk learners
              </p>
            </div>
          </div>
          <div className="space-y-2">
            {(m?.escalations ?? []).map((row) => (
              <div
                key={row.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-background px-3 py-2"
              >
                <div className="min-w-0">
                  <div className="truncate text-xs font-medium text-foreground">
                    {row.subject}
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    To {row.recipient_email} · {row.audience.toUpperCase()}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge status={row.status} />
                  <span className="text-[11px] text-muted-foreground">
                    {row.sent_at
                      ? new Date(row.sent_at).toLocaleString()
                      : "Queued"}
                  </span>
                </div>
              </div>
            ))}
            {!m?.escalations.length && (
              <div className="py-6 text-center text-xs text-muted-foreground">
                No escalation emails sent.
              </div>
            )}
          </div>
        </Card>
      </div>
    </AdminLayout>
  );
}
