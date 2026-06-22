import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { QueryLoadError } from "@/components/admin/QueryLoadError";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  listAdminPoliciesFn,
  publishPolicyFn,
  uploadPolicyPdfFn,
  upsertPolicyFn,
} from "@/lib/onboarding/policy-admin.functions";
import { toast } from "sonner";
import { FileUp, Plus } from "lucide-react";

export const Route = createFileRoute("/settings/policies")({
  head: () => ({ meta: [{ title: "HR Policies — Alyson" }] }),
  component: PoliciesAdminPage,
});

function PoliciesAdminPage() {
  const listFn = useServerFn(listAdminPoliciesFn);
  const upsertFn = useServerFn(upsertPolicyFn);
  const uploadFn = useServerFn(uploadPolicyPdfFn);
  const publishFn = useServerFn(publishPolicyFn);

  const { data: policies = [], refetch, isLoading, isError } = useQuery({
    queryKey: ["admin-policies"],
    queryFn: () => listFn(),
  });

  const [editing, setEditing] = useState<{
    id?: string;
    slug: string;
    title: string;
    summary: string;
    content: string;
  } | null>(null);

  const saveMut = useMutation({
    mutationFn: (body: {
      id?: string;
      slug: string;
      title: string;
      summary: string;
      content: string;
    }) =>
      upsertFn({
        data: {
          ...body,
          requiresAcknowledgement: true,
          status: "draft",
          sortOrder: 0,
        },
      }),
    onSuccess: () => {
      toast.success("Policy saved");
      setEditing(null);
      void refetch();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const publishMut = useMutation({
    mutationFn: (policyId: string) => publishFn({ data: { policyId } }),
    onSuccess: () => {
      toast.success("Policy published");
      void refetch();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const uploadMut = useMutation({
    mutationFn: async ({ policyId, file }: { policyId: string; file: File }) => {
      const buf = new Uint8Array(await file.arrayBuffer());
      let binary = "";
      for (let i = 0; i < buf.length; i++) binary += String.fromCharCode(buf[i]!);
      const base64 = btoa(binary);
      return uploadFn({ data: { policyId, fileName: file.name, base64 } });
    },
    onSuccess: () => {
      toast.success("PDF uploaded — version bumped");
      void refetch();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <AdminLayout
      title="HR policies"
      subtitle="Upload handbook PDFs and manage acknowledgement requirements"
      actions={
        <Link to="/settings">
          <Button variant="outline" className="h-9 rounded-lg">
            ← Settings
          </Button>
        </Link>
      }
    >
      <div className="space-y-5">
        {isError ? (
          <QueryLoadError message="Could not load policies" onRetry={() => void refetch()} />
        ) : null}
        <div className="flex justify-end">
          <Button
            className="gap-2"
            onClick={() =>
              setEditing({ slug: "", title: "", summary: "", content: "" })
            }
          >
            <Plus className="h-4 w-4" /> New policy
          </Button>
        </div>

        {editing ? (
          <Card className="space-y-4 p-5">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label>Slug</Label>
                <Input
                  value={editing.slug}
                  onChange={(e) => setEditing({ ...editing, slug: e.target.value })}
                  placeholder="employee-handbook"
                />
              </div>
              <div>
                <Label>Title</Label>
                <Input
                  value={editing.title}
                  onChange={(e) => setEditing({ ...editing, title: e.target.value })}
                />
              </div>
            </div>
            <div>
              <Label>Summary</Label>
              <Input
                value={editing.summary}
                onChange={(e) => setEditing({ ...editing, summary: e.target.value })}
              />
            </div>
            <div>
              <Label>Content (markdown)</Label>
              <Textarea
                rows={6}
                value={editing.content}
                onChange={(e) => setEditing({ ...editing, content: e.target.value })}
              />
            </div>
            <div className="flex gap-2">
              <Button
                onClick={() => saveMut.mutate(editing)}
                disabled={saveMut.isPending || !editing.slug || !editing.title}
              >
                Save draft
              </Button>
              <Button variant="outline" onClick={() => setEditing(null)}>
                Cancel
              </Button>
            </div>
          </Card>
        ) : null}

        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : isError ? null : policies.length === 0 ? (
          <Card className="p-8 text-center text-sm text-muted-foreground">
            No policies yet. Create one to publish handbook content for learners.
          </Card>
        ) : (
          policies.map((p) => (
            <Card key={p.id} className="space-y-3 p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="font-semibold">{p.title}</h3>
                  <p className="text-xs text-muted-foreground">
                    {p.slug} · v{p.version}
                  </p>
                </div>
                <Badge variant={p.status === "published" ? "default" : "outline"}>
                  {p.status}
                </Badge>
              </div>
              {p.summary ? (
                <p className="text-sm text-muted-foreground">{p.summary}</p>
              ) : null}
              <div className="flex flex-wrap gap-2">
                {p.status !== "published" ? (
                  <Button
                    size="sm"
                    onClick={() => publishMut.mutate(p.id)}
                    disabled={publishMut.isPending}
                  >
                    Publish
                  </Button>
                ) : null}
                <label className="inline-flex cursor-pointer items-center gap-2">
                  <input
                    type="file"
                    accept="application/pdf"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) uploadMut.mutate({ policyId: p.id, file });
                      e.target.value = "";
                    }}
                  />
                  <Button size="sm" variant="outline" className="gap-2" asChild>
                    <span>
                      <FileUp className="h-3.5 w-3.5" /> Upload PDF
                    </span>
                  </Button>
                </label>
                {p.storage_path ? (
                  <span className="text-xs text-muted-foreground self-center">
                    PDF on file
                  </span>
                ) : null}
              </div>
            </Card>
          ))
        )}
      </div>
    </AdminLayout>
  );
}
