import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Cloud, Sparkles, Bell, CheckCircle2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  getEmailSettingsFn,
  saveEmailSettingsFn,
  processEmailQueueFn,
} from "@/lib/email/email-settings.functions";
import { TRAINING_SENDER_EMAIL } from "@/lib/email/constants";
import { useState, useEffect } from "react";

export const Route = createFileRoute("/settings")({
  head: () => ({ meta: [{ title: "Settings — Alyson" }] }),
  component: SettingsPage,
});

function SettingsPage() {
  const qc = useQueryClient();
  const loadSettings = useServerFn(getEmailSettingsFn);
  const saveSettings = useServerFn(saveEmailSettingsFn);
  const processQueue = useServerFn(processEmailQueueFn);

  const { data: emailSettings, isLoading } = useQuery({
    queryKey: ["email-settings"],
    queryFn: () => loadSettings(),
  });

  const [notifyOnFailure, setNotifyOnFailure] = useState(true);
  const [weeklyCeoSummary, setWeeklyCeoSummary] = useState(false);
  const [retakeDeadlineAlert, setRetakeDeadlineAlert] = useState(true);

  useEffect(() => {
    if (!emailSettings) return;
    setNotifyOnFailure(emailSettings.notifyOnFailure);
    setWeeklyCeoSummary(emailSettings.weeklyCeoSummary);
    setRetakeDeadlineAlert(emailSettings.retakeDeadlineAlert);
  }, [emailSettings]);

  const saveMut = useMutation({
    mutationFn: () =>
      saveSettings({
        data: {
          notifyOnFailure,
          weeklyCeoSummary,
          retakeDeadlineAlert,
          reminderDueWithinDays: 1,
        },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["email-settings"] });
      qc.invalidateQueries({ queryKey: ["notification-schedules"] });
      toast.success("Email settings saved");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Save failed"),
  });

  const processMut = useMutation({
    mutationFn: () => processQueue(),
    onSuccess: (r) => {
      toast.success(`Processed ${r.processed} queued email(s)`);
      qc.invalidateQueries({ queryKey: ["email-notifications"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Process failed"),
  });

  return (
    <AdminLayout title="Settings" subtitle="Workspace, integrations and notifications">
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Card className="rounded-xl border-border bg-card p-5 shadow-soft">
          <div className="text-[14px] font-semibold">Workspace</div>
          <div className="mt-4 space-y-3">
            <Field label="Workspace name" defaultValue="Alyson Training" />
            <Field label="Training email (all outbound mail)" defaultValue={TRAINING_SENDER_EMAIL} readOnly />
            <Field label="Default learner role" defaultValue="Data Scientist" />
          </div>
        </Card>

        <Card className="rounded-xl border-border bg-card p-5 shadow-soft">
          <div className="flex items-center gap-2">
            <Cloud className="h-4 w-4 text-primary" />
            <div className="text-[14px] font-semibold">Storage (S3)</div>
            <Badge variant="outline" className="ml-auto rounded-md border-success/30 bg-success/10 text-[10px] font-medium text-success">
              <CheckCircle2 className="mr-1 h-3 w-3" /> Connected
            </Badge>
          </div>
          <p className="mt-2 text-[12px] text-muted-foreground">
            Videos, transcripts and PDFs are uploaded to your S3 bucket.
          </p>
          <div className="mt-4 space-y-3">
            <Field label="Bucket name" defaultValue="alyson-training-media" />
            <Field label="Region" defaultValue="us-east-1" />
          </div>
        </Card>

        <Card className="rounded-xl border-border bg-card p-5 shadow-soft">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            <div className="text-[14px] font-semibold">AI integration</div>
            <Badge variant="outline" className="ml-auto rounded-md border-primary/30 bg-accent text-[10px] font-medium text-primary">
              Inbuilt
            </Badge>
          </div>
          <p className="mt-2 text-[12px] text-muted-foreground">
            DeepSeek generates class structure and assessment questions from uploaded materials.
          </p>
          <div className="mt-4 space-y-3">
            <Toggle label="Auto-generate blog lessons from transcripts" defaultChecked />
            <Toggle label="AI grading for essay questions" defaultChecked />
            <Toggle label="Auto-shuffle questions on each attempt" defaultChecked />
          </div>
        </Card>

        <Card className="rounded-xl border-border bg-card p-5 shadow-soft">
          <div className="text-[14px] font-semibold">HR policies</div>
          <p className="mt-2 text-[12px] text-muted-foreground">
            Upload handbook PDFs and manage learner acknowledgement requirements.
          </p>
          <Link to="/settings/policies" className="mt-4 inline-block">
            <Button variant="outline" size="sm" className="rounded-lg">
              Manage policies
            </Button>
          </Link>
        </Card>

        <Card className="rounded-xl border-border bg-card p-5 shadow-soft">
          <div className="flex items-center gap-2">
            <Bell className="h-4 w-4 text-primary" />
            <div className="text-[14px] font-semibold">Email (AWS SES)</div>
            <Badge variant="outline" className="ml-auto rounded-md border-primary/30 bg-accent text-[10px] font-medium text-primary">
              {TRAINING_SENDER_EMAIL}
            </Badge>
          </div>
          <p className="mt-2 text-[12px] text-muted-foreground">
            Assignments, reminders, escalations, invites, and test results are sent from this address.
            With <code className="text-[11px]">EMAIL_AUTO_PROCESS=1</code> in dev, the queue drains after each enqueue.
          </p>
          {isLoading ? (
            <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading email settings…
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              <ToggleRow
                label="Email learner on assessment failure (retake offer)"
                checked={notifyOnFailure}
                onCheckedChange={setNotifyOnFailure}
              />
              <ToggleRow
                label="Weekly progress summary to leadership (admins)"
                checked={weeklyCeoSummary}
                onCheckedChange={setWeeklyCeoSummary}
              />
              <ToggleRow
                label="Due-date reminders within 24 hours"
                checked={retakeDeadlineAlert}
                onCheckedChange={setRetakeDeadlineAlert}
              />
            </div>
          )}
          <div className="mt-4">
            <Button
              variant="outline"
              size="sm"
              disabled={processMut.isPending}
              onClick={() => processMut.mutate()}
            >
              {processMut.isPending ? "Processing…" : "Process email queue now"}
            </Button>
          </div>
        </Card>
      </div>

      <div className="mt-6 flex justify-end">
        <Button
          className="h-9 rounded-lg bg-primary text-primary-foreground hover:bg-primary-glow"
          disabled={saveMut.isPending || isLoading}
          onClick={() => saveMut.mutate()}
        >
          {saveMut.isPending ? "Saving…" : "Save changes"}
        </Button>
      </div>
    </AdminLayout>
  );
}

function Field({
  label,
  defaultValue,
  readOnly,
}: {
  label: string;
  defaultValue: string;
  readOnly?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-[11px] font-medium text-muted-foreground">{label}</Label>
      <Input
        defaultValue={defaultValue}
        readOnly={readOnly}
        className="h-9 rounded-md border-border bg-background text-sm"
      />
    </div>
  );
}

function Toggle({ label, defaultChecked }: { label: string; defaultChecked?: boolean }) {
  return (
    <div className="flex items-center justify-between rounded-md border border-border bg-background px-3 py-2">
      <span className="text-[12px] text-foreground">{label}</span>
      <Switch defaultChecked={defaultChecked} />
    </div>
  );
}

function ToggleRow({
  label,
  checked,
  onCheckedChange,
}: {
  label: string;
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between rounded-md border border-border bg-background px-3 py-2">
      <span className="text-[12px] text-foreground">{label}</span>
      <Switch checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  );
}
