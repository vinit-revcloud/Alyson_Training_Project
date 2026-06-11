import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Save, Send, History, Eye } from "lucide-react";
import { PLACEHOLDERS } from "@/lib/email/render";
import {
  saveTemplate,
  listVersions,
  type EmailTemplateRow,
} from "@/lib/email/templates-api";
import { EmailPreview } from "@/components/admin/EmailPreview";
import { sendTemplatedEmail } from "@/lib/email/send-template.functions";
import { useSession } from "@/lib/auth";

const PLACEHOLDER_GROUPS: { label: string; keys: string[] }[] = [
  { label: "Learner", keys: ["learner_name"] },
  { label: "Test", keys: ["assignment_name", "course_name", "current_score"] },
  { label: "Dates", keys: ["due_date"] },
  { label: "Links", keys: ["retake_link"] },
];

export function EmailTemplateEditor({ template }: { template: EmailTemplateRow }) {
  const qc = useQueryClient();
  const { user } = useSession();
  const [subject, setSubject] = useState(template.subject);
  const [bodyMd, setBodyMd] = useState(template.body_md);
  const [showHistory, setShowHistory] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const send = useServerFn(sendTemplatedEmail);

  useEffect(() => {
    setSubject(template.subject);
    setBodyMd(template.body_md);
  }, [template.id]);

  const saveM = useMutation({
    mutationFn: () => saveTemplate({ id: template.id, subject, body_md: bodyMd }),
    onSuccess: () => {
      toast.success("Template saved");
      qc.invalidateQueries({ queryKey: ["email-templates"] });
      qc.invalidateQueries({ queryKey: ["template-versions", template.id] });
    },
    onError: (e: Error) => toast.error("Save failed", { description: e.message }),
  });

  const testM = useMutation({
    mutationFn: () =>
      send({
        data: {
          templateKey: template.key,
          testRecipient: user?.email ?? undefined,
        },
      }),
    onSuccess: () => toast.success("Test queued", { description: `Sent to ${user?.email}` }),
    onError: (e: Error) => toast.error("Test failed", { description: e.message }),
  });

  const versionsQ = useQuery({
    queryKey: ["template-versions", template.id],
    queryFn: () => listVersions(template.id),
    enabled: showHistory,
  });

  const insertPlaceholder = (k: string) => {
    const token = `{${k}}`;
    const ta = textareaRef.current;
    if (!ta) {
      setBodyMd((b) => `${b}${token}`);
      return;
    }
    const start = ta.selectionStart ?? bodyMd.length;
    const end = ta.selectionEnd ?? bodyMd.length;
    const next = bodyMd.slice(0, start) + token + bodyMd.slice(end);
    setBodyMd(next);
    requestAnimationFrame(() => {
      ta.focus();
      const pos = start + token.length;
      ta.setSelectionRange(pos, pos);
    });
  };


  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card className="space-y-3 rounded-xl border-border bg-card p-5 shadow-soft">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="text-sm font-semibold text-foreground">Edit template</div>
            <div className="text-[11px] text-muted-foreground">
              Audience: <Badge variant="outline" className="ml-1 capitalize">{template.audience}</Badge>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => setShowHistory((v) => !v)}>
              <History className="mr-1 h-3.5 w-3.5" /> History
            </Button>
            <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm">
                  <Eye className="mr-1 h-3.5 w-3.5" /> Preview
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-3xl">
                <DialogHeader>
                  <DialogTitle className="text-sm">Preview with sample data</DialogTitle>
                </DialogHeader>
                <div className="space-y-2 text-xs">
                  <div className="text-muted-foreground">
                    To: <span className="text-foreground">{user?.email ?? "learner@example.com"}</span>
                  </div>
                  <EmailPreview subject={subject} bodyMd={bodyMd} />
                </div>
              </DialogContent>
            </Dialog>
            <Button
              variant="outline"
              size="sm"
              onClick={() => testM.mutate()}
              disabled={testM.isPending || !user?.email}
            >
              <Send className="mr-1 h-3.5 w-3.5" />
              {testM.isPending ? "Sending…" : "Test to me"}
            </Button>
            <Button size="sm" onClick={() => saveM.mutate()} disabled={saveM.isPending}>
              <Save className="mr-1 h-3.5 w-3.5" />
              {saveM.isPending ? "Saving…" : "Save"}
            </Button>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="subject" className="text-xs">Subject</Label>
          <Input
            id="subject"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="body" className="text-xs">Body (Markdown)</Label>
          <Textarea
            ref={textareaRef}
            id="body"
            rows={14}
            value={bodyMd}
            onChange={(e) => setBodyMd(e.target.value)}
            className="font-mono text-xs"
          />
        </div>

        <div className="space-y-2">
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
            Variables — click to insert at cursor
          </div>
          {PLACEHOLDER_GROUPS.map((group) => (
            <div key={group.label} className="flex flex-wrap items-center gap-1.5">
              <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground w-14 shrink-0">
                {group.label}
              </span>
              {group.keys.map((k) => {
                const meta = PLACEHOLDERS.find((p) => p.key === k);
                if (!meta) return null;
                return (
                  <button
                    key={k}
                    type="button"
                    onClick={() => insertPlaceholder(k)}
                    className="rounded-md border border-border bg-background px-2 py-1 text-[11px] font-mono hover:bg-accent"
                    title={meta.label}
                  >
                    {`{${k}}`}
                  </button>
                );
              })}
            </div>
          ))}
        </div>


        {showHistory && (
          <div className="mt-2 rounded-md border border-border bg-background p-3">
            <div className="mb-2 text-[11px] uppercase tracking-wider text-muted-foreground">
              Recent versions
            </div>
            {versionsQ.isLoading && <div className="text-xs text-muted-foreground">Loading…</div>}
            {versionsQ.data?.length === 0 && (
              <div className="text-xs text-muted-foreground">No previous versions yet.</div>
            )}
            <ul className="space-y-1.5">
              {(versionsQ.data ?? []).map((v) => (
                <li key={v.id} className="flex items-center justify-between gap-2 text-xs">
                  <div className="min-w-0 truncate">
                    <span className="text-muted-foreground">{new Date(v.created_at).toLocaleString()}</span>
                    <span className="ml-2 truncate text-foreground">{v.subject}</span>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setSubject(v.subject);
                      setBodyMd(v.body_md);
                      toast.info("Loaded prior version — click Save to apply");
                    }}
                  >
                    Load
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Card>

      <Card className="space-y-3 rounded-xl border-border bg-card p-5 shadow-soft">
        <div className="text-sm font-semibold text-foreground">Live preview</div>
        <p className="text-[11px] text-muted-foreground">
          Rendered with sample data. Unknown placeholders are flagged.
        </p>
        <EmailPreview subject={subject} bodyMd={bodyMd} />
      </Card>
    </div>
  );
}
