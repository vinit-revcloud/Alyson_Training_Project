import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { QueryLoadError } from "@/components/admin/QueryLoadError";
import { listMyAssignments } from "@/lib/learn-api";
import { useSession } from "@/lib/auth";
import { Clock, PlayCircle } from "lucide-react";

export const Route = createFileRoute("/learn/assignments")({
  component: LearnAssignmentsPage,
});

function LearnAssignmentsPage() {
  const { user } = useSession();
  const { data: assignments = [], isLoading, isError, refetch } = useQuery({
    queryKey: ["my-assignments", user?.id],
    queryFn: () => listMyAssignments(user!.id),
    enabled: !!user?.id,
  });

  return (
    <div className="mx-auto max-w-2xl flex-1 space-y-4 p-6">
      <h1 className="text-xl font-semibold tracking-tight">Assessments</h1>
      {isError ? (
        <QueryLoadError message="Could not load your assessments" onRetry={() => void refetch()} />
      ) : isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : assignments.length === 0 ? (
        <Card className="p-6 text-center text-sm text-muted-foreground">
          No assessments yet. Complete onboarding modules first — tests appear when assigned.
        </Card>
      ) : (
        assignments.map((a) => {
          const overdue =
            ["assigned", "in_progress"].includes(a.status) &&
            new Date(a.due_at).getTime() < Date.now();
          return (
            <Card key={a.id} className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-sm font-semibold">{a.assessment_title}</h2>
                  {a.course_title ? (
                    <p className="text-xs text-muted-foreground">{a.course_title}</p>
                  ) : null}
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Badge variant="outline" className="text-xs capitalize">
                      {a.mode}
                    </Badge>
                    <Badge
                      variant={a.status === "passed" ? "default" : "secondary"}
                      className="text-xs capitalize"
                    >
                      {a.status.replace("_", " ")}
                    </Badge>
                    {overdue ? (
                      <Badge variant="destructive" className="text-xs">
                        Overdue
                      </Badge>
                    ) : null}
                  </div>
                </div>
                {a.status !== "passed" ? (
                  <Button asChild size="sm" className="shrink-0">
                    <Link to="/attempt/$assignmentId" params={{ assignmentId: a.id }}>
                      <PlayCircle className="mr-1 h-4 w-4" />
                      {a.status === "in_progress" ? "Continue" : "Start"}
                    </Link>
                  </Button>
                ) : null}
              </div>
              <div className="mt-3 flex items-center gap-1 text-xs text-muted-foreground">
                <Clock className="h-3.5 w-3.5" />
                Due {new Date(a.due_at).toLocaleDateString()} · Pass {a.pass_mark}% · Attempts{" "}
                {a.attempts_used}/{a.max_attempts}
              </div>
            </Card>
          );
        })
      )}
    </div>
  );
}
