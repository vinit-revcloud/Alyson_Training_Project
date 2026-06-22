import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState, useMemo, useEffect } from "react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { QueryLoadError } from "@/components/admin/QueryLoadError";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Mail, ArrowLeft } from "lucide-react";
import { listTemplates, TEMPLATE_LABELS, type TemplateKey } from "@/lib/email/templates-api";
import { EmailTemplateEditor } from "@/components/admin/EmailTemplateEditor";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/notifications/templates")({
  head: () => ({ meta: [{ title: "Email Templates — Alyson" }] }),
  component: TemplatesPage,
});

function TemplatesPage() {
  const q = useQuery({ queryKey: ["email-templates"], queryFn: listTemplates });
  const templates = q.data ?? [];
  const [selectedKey, setSelectedKey] = useState<TemplateKey | null>(null);

  useEffect(() => {
    if (!selectedKey && templates.length) setSelectedKey(templates[0].key);
  }, [templates, selectedKey]);

  const selected = useMemo(
    () => templates.find((t) => t.key === selectedKey) ?? null,
    [templates, selectedKey],
  );

  return (
    <AdminLayout
      title="Email Templates"
      subtitle="Edit subject and body for assignment, reminder, and escalation emails · live preview"
      actions={
        <Button asChild variant="outline" size="sm">
          <Link to="/notifications">
            <ArrowLeft className="mr-1 h-3.5 w-3.5" /> Back to activity
          </Link>
        </Button>
      }
    >
      <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
        {q.isError ? (
          <div className="lg:col-span-2">
            <QueryLoadError
              message="Could not load email templates"
              onRetry={() => void q.refetch()}
            />
          </div>
        ) : null}
        <Card className="rounded-xl border-border bg-card p-3 shadow-soft">
          <div className="mb-2 px-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Templates
          </div>
          <ul className="space-y-1">
            {templates.map((t) => {
              const meta = TEMPLATE_LABELS[t.key];
              const active = t.key === selectedKey;
              return (
                <li key={t.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedKey(t.key)}
                    className={cn(
                      "flex w-full items-start gap-2 rounded-md px-2.5 py-2 text-left text-xs transition-colors",
                      active
                        ? "bg-accent text-foreground"
                        : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
                    )}
                  >
                    <Mail className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" strokeWidth={1.75} />
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium text-foreground">{meta.label}</span>
                      <span className="block truncate text-[11px] text-muted-foreground">
                        {meta.description}
                      </span>
                      <Badge
                        variant="outline"
                        className="mt-1 text-[10px] capitalize"
                      >
                        {t.audience}
                      </Badge>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </Card>

        <div>
          {selected ? (
            <EmailTemplateEditor template={selected} />
          ) : (
            <Card className="rounded-xl border-border bg-card p-10 text-center text-sm text-muted-foreground shadow-soft">
              {q.isLoading ? "Loading…" : q.isError ? "Templates unavailable." : "Select a template on the left."}
            </Card>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}
