import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getLearner360Fn } from "@/lib/learner-360.functions";
import { ArrowLeft, ExternalLink } from "lucide-react";

export const Route = createFileRoute("/users/$userId/learner")({
  component: Learner360Page,
});

function Learner360Page() {
  const { userId } = Route.useParams();
  const load = useServerFn(getLearner360Fn);

  const { data, isLoading } = useQuery({
    queryKey: ["learner-360", userId],
    queryFn: () => load({ data: { userId } }),
  });

  if (isLoading) {
    return (
      <AdminLayout title="Learner 360">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </AdminLayout>
    );
  }

  if (!data) {
    return (
      <AdminLayout title="Learner 360">
        <p className="text-sm text-muted-foreground">User not found.</p>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout
      title={data.displayName ?? "Learner 360"}
      subtitle={data.email ?? data.userId}
      actions={
        <div className="flex gap-2">
          <Link to="/users">
            <Button variant="outline" size="sm" className="gap-1">
              <ArrowLeft className="h-3.5 w-3.5" /> Users
            </Button>
          </Link>
          <a href="/learn/dashboard" onClick={() => localStorage.setItem("alyson-view-mode", "student")}>
            <Button size="sm" className="gap-1">
              View as learner <ExternalLink className="h-3.5 w-3.5" />
            </Button>
          </a>
        </div>
      }
    >
      <div className="grid gap-5 lg:grid-cols-3">
        <Card className="p-5 lg:col-span-1">
          <h3 className="text-sm font-semibold text-muted-foreground">Overview</h3>
          <dl className="mt-3 space-y-2 text-sm">
            <div className="flex justify-between">
              <dt>Department</dt>
              <dd>{data.department ?? "—"}</dd>
            </div>
            <div className="flex justify-between">
              <dt>Roles</dt>
              <dd>{data.roles.join(", ") || "—"}</dd>
            </div>
            <div className="flex justify-between">
              <dt>Pipeline stage</dt>
              <dd>{data.pipelineStageLabel ?? "—"}</dd>
            </div>
            <div className="flex justify-between">
              <dt>Onboarding</dt>
              <dd className="font-semibold text-primary">{data.onboardingPct}%</dd>
            </div>
            <div className="flex justify-between">
              <dt>Policies</dt>
              <dd>
                {data.pendingPolicies > 0 ? (
                  <Badge variant="outline">{data.pendingPolicies} pending</Badge>
                ) : (
                  "Complete"
                )}
              </dd>
            </div>
            {data.trialDueAt ? (
              <div className="flex justify-between">
                <dt>Trial</dt>
                <dd>{data.trialSubmitted ? "Submitted" : `Due ${new Date(data.trialDueAt).toLocaleDateString()}`}</dd>
              </div>
            ) : null}
          </dl>
          {data.pipelineId ? (
            <Link
              to="/hiring/pipeline/$pipelineId"
              params={{ pipelineId: data.pipelineId }}
              className="mt-4 inline-block text-sm text-primary hover:underline"
            >
              Open pipeline →
            </Link>
          ) : null}
        </Card>

        <Card className="p-5 lg:col-span-2">
          <h3 className="text-sm font-semibold text-muted-foreground">Learning paths</h3>
          <ul className="mt-3 divide-y divide-border">
            {data.paths.length === 0 ? (
              <li className="py-2 text-sm text-muted-foreground">No path assignments</li>
            ) : (
              data.paths.map((p) => (
                <li key={p.courseId} className="flex items-center justify-between py-2 text-sm">
                  <span>
                    {p.courseTitle}{" "}
                    <span className="text-muted-foreground">({p.assignmentType})</span>
                  </span>
                  <span className="font-medium">{p.progressPct}%</span>
                </li>
              ))
            )}
          </ul>
        </Card>

        <Card className="p-5 lg:col-span-2">
          <h3 className="text-sm font-semibold text-muted-foreground">Assessments</h3>
          <ul className="mt-3 divide-y divide-border">
            {data.assessments.length === 0 ? (
              <li className="py-2 text-sm text-muted-foreground">None assigned</li>
            ) : (
              data.assessments.map((a) => (
                <li key={a.id} className="flex items-center justify-between py-2 text-sm">
                  <span>{a.assessmentTitle}</span>
                  <Badge variant="outline">{a.status}</Badge>
                </li>
              ))
            )}
          </ul>
        </Card>

        <Card className="p-5">
          <h3 className="text-sm font-semibold text-muted-foreground">Policy acknowledgements</h3>
          <ul className="mt-3 space-y-2">
            {data.policies.map((p) => (
              <li key={p.id} className="flex justify-between text-sm">
                <span>{p.title}</span>
                <Badge variant={p.acknowledged ? "secondary" : "outline"}>
                  {p.acknowledged ? "Done" : "Pending"}
                </Badge>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </AdminLayout>
  );
}
