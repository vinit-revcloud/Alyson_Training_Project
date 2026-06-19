import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { HiringWorkflowStrip } from "@/components/hiring/HiringWorkflowStrip";
import { InterviewGuide } from "@/components/hiring/InterviewGuide";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { listInterviewAssessmentsFn } from "@/lib/interview/interview.functions";
import { Eye, Plus, Video } from "lucide-react";

export const Route = createFileRoute("/interviews/assessments")({
  head: () => ({ meta: [{ title: "Interview Tests — Alyson" }] }),
  component: InterviewAssessmentsPage,
});

function InterviewAssessmentsPage() {
  const listFn = useServerFn(listInterviewAssessmentsFn);
  const { data: assessments = [], isLoading } = useQuery({
    queryKey: ["interview-assessments"],
    queryFn: () => listFn(),
  });

  return (
    <AdminLayout
      title="Interview tests"
      subtitle="Screening assessments for external candidates — separate from employee training"
      actions={
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline" size="sm" className="gap-1.5">
            <Link to="/interviews">
              <Video className="h-3.5 w-3.5" />
              Schedule interview
            </Link>
          </Button>
          <Button asChild size="sm" className="gap-1.5">
            <Link to="/assessments/builder" search={{ purpose: "interview" }}>
              <Plus className="h-3.5 w-3.5" />
              Create interview test
            </Link>
          </Button>
        </div>
      }
    >
      <HiringWorkflowStrip className="mb-5" />
      <InterviewGuide variant="tests" className="mb-5" />

      <Card className="overflow-hidden rounded-xl border-border shadow-soft">
        {isLoading ? (
          <div className="p-8 text-center text-sm text-muted-foreground">Loading…</div>
        ) : assessments.length === 0 ? (
          <div className="space-y-3 p-8 text-center text-sm text-muted-foreground">
            <p>No interview tests yet.</p>
            <p className="text-[12px]">
              Create a test here, then schedule it for a candidate on the Interviews page. Tests stay
              in the interview pool unless you explicitly link one to a course when building.
            </p>
            <Button asChild size="sm" className="mt-2">
              <Link to="/assessments/builder" search={{ purpose: "interview" }}>
                Create your first interview test
              </Link>
            </Button>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {assessments.map((a) => (
              <div
                key={a.id}
                className="flex flex-wrap items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/40"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-medium">{a.title}</p>
                  <p className="text-[11px] text-muted-foreground">
                    For candidate interviews only — not shown in employee Assignments
                  </p>
                </div>
                <Badge variant="outline" className="text-[10px] capitalize">
                  {a.status}
                </Badge>
                <Button asChild size="sm" variant="outline">
                  <Link to="/assessments/$assessmentId/preview" params={{ assessmentId: a.id }}>
                    <Eye className="mr-1.5 h-3.5 w-3.5" />
                    Preview
                  </Link>
                </Button>
                <Button asChild size="sm">
                  <Link to="/interviews">Use in schedule</Link>
                </Button>
              </div>
            ))}
          </div>
        )}
      </Card>
    </AdminLayout>
  );
}
