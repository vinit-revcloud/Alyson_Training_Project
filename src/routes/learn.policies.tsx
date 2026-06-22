import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { acknowledgePolicyFn, listPoliciesFn } from "@/lib/onboarding/onboarding.functions";
import { getSignedAssetUrlFn } from "@/lib/asset.functions";
import type { AssetBucket } from "@/lib/asset-storage.shared";
import { toast } from "sonner";

function PolicyPdfLink({ bucket, storagePath }: { bucket: string; storagePath: string }) {
  const signFn = useServerFn(getSignedAssetUrlFn);
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    void signFn({
      data: {
        bucket: bucket as AssetBucket,
        storagePath,
        expiresIn: 3600,
      },
    }).then((r) => setUrl(r.url));
  }, [bucket, storagePath, signFn]);

  if (!url) return null;
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="text-sm font-medium text-primary hover:underline"
    >
      Open PDF handbook
    </a>
  );
}

export const Route = createFileRoute("/learn/policies")({
  component: PoliciesPage,
});

function PoliciesPage() {
  const load = useServerFn(listPoliciesFn);
  const ack = useServerFn(acknowledgePolicyFn);

  const { data: policies, isLoading, refetch } = useQuery({
    queryKey: ["learner-policies"],
    queryFn: () => load(),
  });

  const ackMut = useMutation({
    mutationFn: (policyId: string) => ack({ data: { policyId } }),
    onSuccess: () => {
      toast.success("Policy acknowledged");
      void refetch();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) {
    return <p className="p-6 text-sm text-muted-foreground">Loading policies…</p>;
  }

  if (!policies?.length) {
    return (
      <Card className="m-6 p-6 text-center text-sm text-muted-foreground">
        No published policies at this time.
      </Card>
    );
  }

  return (
    <div className="mx-auto max-w-2xl flex-1 space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">Company policies</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Review and acknowledge required HR documents before continuing onboarding.
        </p>
      </div>

      {policies.map((policy) => {
        const acked =
          policy.acknowledged_at != null &&
          (policy.acknowledged_version ?? 0) >= policy.version;
        return (
          <Card key={policy.id} className="space-y-4 p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">{policy.title}</h2>
                {policy.summary ? (
                  <p className="mt-1 text-sm text-muted-foreground">{policy.summary}</p>
                ) : null}
              </div>
              <Badge variant={acked ? "secondary" : "outline"}>
                {acked ? "Acknowledged" : "Required"}
              </Badge>
            </div>
            <div className="prose prose-sm max-w-none whitespace-pre-wrap dark:prose-invert">
              {policy.content}
            </div>
            {policy.storage_bucket && policy.storage_path ? (
              <PolicyPdfLink bucket={policy.storage_bucket} storagePath={policy.storage_path} />
            ) : null}
            {policy.requires_acknowledgement && !acked ? (
              <Button
                onClick={() => ackMut.mutate(policy.id)}
                disabled={ackMut.isPending}
              >
                I have read and acknowledge this policy
              </Button>
            ) : null}
          </Card>
        );
      })}
    </div>
  );
}
