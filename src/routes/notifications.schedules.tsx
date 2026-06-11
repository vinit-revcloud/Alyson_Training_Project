import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Mail } from "lucide-react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ScheduleCard } from "@/components/admin/ScheduleCard";
import { listSchedules } from "@/lib/email/schedules-api";

export const Route = createFileRoute("/notifications/schedules")({
  head: () => ({ meta: [{ title: "Notification Schedules — Alyson" }] }),
  component: SchedulesPage,
});

function SchedulesPage() {
  const q = useQuery({ queryKey: ["notification-schedules"], queryFn: listSchedules });
  const schedules = q.data ?? [];

  return (
    <AdminLayout
      title="Notification Schedules"
      subtitle="Configure timing rules for assignments, reminders, and escalations · cron times are UTC"
      actions={
        <div className="flex gap-2">
          <Button asChild variant="outline" size="sm">
            <Link to="/notifications/templates">
              <Mail className="mr-1 h-3.5 w-3.5" /> Edit templates
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link to="/notifications">
              <ArrowLeft className="mr-1 h-3.5 w-3.5" /> Back to activity
            </Link>
          </Button>
        </div>
      }
    >
      {q.isLoading ? (
        <Card className="rounded-xl border-border bg-card p-10 text-center text-sm text-muted-foreground shadow-soft">
          Loading schedules…
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {schedules.map((s) => (
            <ScheduleCard key={s.job_key} schedule={s} />
          ))}
        </div>
      )}
    </AdminLayout>
  );
}
