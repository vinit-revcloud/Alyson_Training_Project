import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Mail,
  Clock,
  AlertTriangle,
  ShieldAlert,
  RefreshCw,
  Send,
  CheckCircle2,
} from "lucide-react";
import { simulateEmailScenario } from "@/lib/email-testing.functions";
import { Link } from "@tanstack/react-router";

export const Route = createFileRoute("/email-testing")({
  head: () => ({ meta: [{ title: "Email Testing — Alyson" }] }),
  component: EmailTestingPage,
});

const SCENARIOS = [
  {
    id: "assignment_sent",
    label: "Send assignment email",
    description: "Triggers a new-assignment notification from training.group@cintara.ai",
    icon: Send,
  },
  {
    id: "reminder_day_7",
    label: "Day 7 reminder",
    description: "Simulates the 7-day overdue reminder",
    icon: Clock,
  },
  {
    id: "reminder_day_14",
    label: "Day 14 reminder",
    description: "Simulates the 14-day overdue reminder",
    icon: Clock,
  },
  {
    id: "reminder_day_30",
    label: "Day 30 reminder",
    description: "Simulates the 30-day final reminder",
    icon: AlertTriangle,
  },
  {
    id: "failure_retake",
    label: "Failure + retake offer",
    description: "Simulates a failed attempt and offers a retake",
    icon: RefreshCw,
  },
  {
    id: "escalation_hr",
    label: "Escalate to HR",
    description: "Routes an escalation notification to HR",
    icon: ShieldAlert,
  },
  {
    id: "escalation_ceo",
    label: "Escalate to CEO",
    description: "Routes a critical escalation to leadership",
    icon: ShieldAlert,
  },
] as const;

function EmailTestingPage() {
  const [learnerEmail, setLearnerEmail] = useState("test.learner@alyson.io");
  const [learnerName, setLearnerName] = useState("Test Learner");
  const [assignmentTitle, setAssignmentTitle] = useState(
    "DS Foundations · Final Test",
  );
  const [lastRun, setLastRun] = useState<Record<string, string>>({});
  const queryClient = useQueryClient();

  const simulate = useServerFn(simulateEmailScenario);
  const mutation = useMutation({
    mutationFn: (scenario: (typeof SCENARIOS)[number]["id"]) =>
      simulate({
        data: {
          scenario,
          learnerEmail,
          learnerName,
          assignmentTitle,
        },
      }),
    onSuccess: (_data, scenario) => {
      setLastRun((s) => ({ ...s, [scenario]: new Date().toLocaleTimeString() }));
      queryClient.invalidateQueries({ queryKey: ["email-notifications"] });
      toast.success("Test email logged", {
        description: "View it on the Notifications dashboard.",
      });
    },
    onError: (e: Error) =>
      toast.error("Simulation failed", { description: e.message }),
  });

  return (
    <AdminLayout
      title="Email Testing & Verification"
      subtitle="Trigger end-to-end scenarios for assignment, reminder, retake and escalation emails"
    >
      <div className="space-y-6">
        <Card className="rounded-xl border-border bg-card p-5 shadow-soft">
          <h3 className="mb-3 text-sm font-semibold text-foreground">
            Test case parameters
          </h3>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="learnerEmail" className="text-xs">
                Learner email
              </Label>
              <Input
                id="learnerEmail"
                type="email"
                value={learnerEmail}
                onChange={(e) => setLearnerEmail(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="learnerName" className="text-xs">
                Learner name
              </Label>
              <Input
                id="learnerName"
                value={learnerName}
                onChange={(e) => setLearnerName(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="assignmentTitle" className="text-xs">
                Assignment title
              </Label>
              <Input
                id="assignmentTitle"
                value={assignmentTitle}
                onChange={(e) => setAssignmentTitle(e.target.value)}
              />
            </div>
          </div>
          <p className="mt-3 text-[11px] text-muted-foreground">
            Sender:{" "}
            <span className="font-mono text-foreground">
              training.group@cintara.ai
            </span>{" "}
            · Each scenario writes a row to the email log so the dashboard
            metrics update in real time.
          </p>
        </Card>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {SCENARIOS.map((s) => {
            const Icon = s.icon;
            const ran = lastRun[s.id];
            const pending =
              mutation.isPending && mutation.variables === s.id;
            return (
              <Card
                key={s.id}
                className="flex flex-col gap-3 rounded-xl border-border bg-card p-5 shadow-soft transition hover:shadow-glow"
              >
                <div className="flex items-start justify-between">
                  <div className="flex h-8 w-8 items-center justify-center rounded-md bg-accent text-primary">
                    <Icon className="h-4 w-4" strokeWidth={1.75} />
                  </div>
                  {ran && (
                    <Badge
                      variant="outline"
                      className="border-success/30 bg-success/10 text-[10px] text-success"
                    >
                      <CheckCircle2 className="mr-1 h-3 w-3" />
                      Sent {ran}
                    </Badge>
                  )}
                </div>
                <div>
                  <div className="text-sm font-semibold text-foreground">
                    {s.label}
                  </div>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {s.description}
                  </p>
                </div>
                <Button
                  size="sm"
                  className="mt-auto"
                  disabled={pending || !learnerEmail}
                  onClick={() => mutation.mutate(s.id)}
                >
                  {pending ? "Running…" : "Run scenario"}
                </Button>
              </Card>
            );
          })}
        </div>

        <Card className="flex flex-wrap items-center justify-between gap-3 rounded-xl border-border bg-card p-5 shadow-soft">
          <div className="flex items-center gap-2 text-sm">
            <Mail className="h-4 w-4 text-primary" />
            <span className="text-foreground font-medium">
              Verify on the Notifications dashboard
            </span>
            <span className="text-[11px] text-muted-foreground">
              Cards, delivery failures and escalation panels reflect each run.
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
