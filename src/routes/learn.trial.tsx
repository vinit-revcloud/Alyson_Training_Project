import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { getMyTrialProjectFn, submitTrialProjectFn } from "@/lib/hiring-pipeline/hiring-pipeline.functions";
import { ceoReviewStatusLabel } from "@/lib/hiring-pipeline/hiring-pipeline.shared";
import { toast } from "sonner";

export const Route = createFileRoute("/learn/trial")({
  component: TrialProjectPage,
});

function TrialProjectPage() {
  const load = useServerFn(getMyTrialProjectFn);
  const submit = useServerFn(submitTrialProjectFn);
  const [notes, setNotes] = useState("");

  const { data: trial, isLoading, refetch } = useQuery({
    queryKey: ["my-trial-project"],
    queryFn: () => load(),
  });

  const submitMut = useMutation({
    mutationFn: () => submit({ data: { submissionNotes: notes } }),
    onSuccess: () => {
      toast.success("Trial project submitted for CEO review");
      void refetch();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) {
    return <p className="p-6 text-sm text-muted-foreground">Loading trial project…</p>;
  }

  if (!trial) {
    return (
      <Card className="m-6 p-6 text-center text-sm text-muted-foreground">
        No trial project assigned yet. Complete tech rounds first.
      </Card>
    );
  }

  const platforms = Array.isArray(trial.platform_access)
    ? (trial.platform_access as string[])
    : [];

  return (
    <div className="mx-auto max-w-2xl flex-1 space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">{trial.title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          ~{trial.estimated_hours} hours · CEO review:{" "}
          <Badge variant="outline" className="ml-1">
            {ceoReviewStatusLabel(trial.bill_review_status)}
          </Badge>
        </p>
      </div>

      {trial.brief ? (
        <Card className="p-4">
          <h2 className="text-sm font-semibold">Brief</h2>
          <p className="mt-2 whitespace-pre-wrap text-sm">{trial.brief}</p>
        </Card>
      ) : null}

      {trial.team_context ? (
        <Card className="p-4">
          <h2 className="text-sm font-semibold">Team context</h2>
          <p className="mt-2 whitespace-pre-wrap text-sm">{trial.team_context}</p>
        </Card>
      ) : null}

      {platforms.length > 0 ? (
        <Card className="p-4">
          <h2 className="text-sm font-semibold">AI platform access</h2>
          <ul className="mt-2 list-disc pl-5 text-sm">
            {platforms.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </Card>
      ) : null}

      {trial.submitted_at ? (
        <Card className="border-green-200 bg-green-50 p-4 dark:border-green-900 dark:bg-green-950">
          <p className="text-sm font-medium">Submitted {new Date(trial.submitted_at).toLocaleString()}</p>
          {trial.submission_notes ? (
            <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">
              {trial.submission_notes}
            </p>
          ) : null}
        </Card>
      ) : (
        <Card className="p-4 space-y-3">
          <h2 className="text-sm font-semibold">Submit your work</h2>
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Describe what you built, links to repos/deliverables, and key learnings…"
            rows={6}
          />
          <Button
            onClick={() => submitMut.mutate()}
            disabled={notes.length < 10 || submitMut.isPending}
          >
            Submit for CEO review
          </Button>
        </Card>
      )}
    </div>
  );
}
