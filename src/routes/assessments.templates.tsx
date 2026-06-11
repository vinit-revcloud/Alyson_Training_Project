import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Plus, Pencil, Trash2, Layers, Sparkles } from "lucide-react";
import {
  listTemplates,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  type AssessmentTemplate,
  type TemplateInput,
  type TemplateDifficulty,
} from "@/lib/templates-api";

export const Route = createFileRoute("/assessments/templates")({
  head: () => ({ meta: [{ title: "Test Templates — Alyson" }] }),
  component: TemplatesPage,
});

const ROLES = [
  "Data Scientist",
  "Product Manager",
  "Marketing",
  "Engineer",
  "Analyst",
  "Affiliate",
  "HR",
];
const DIFFICULTIES: TemplateDifficulty[] = ["Easy", "Intermediate", "Hard", "Mixed"];
const LEVELS = ["Entry", "Mid-Level", "Senior", "Lead"];

const emptyDraft: TemplateInput = {
  title: "",
  description: "",
  role: "",
  difficulty: "Mixed",
  level: "Mid-Level",
  pass_mark: 60,
  duration_min: 45,
  mix: { total_questions: 20, mcq_ratio: 70, essay_ratio: 30 },
};

function TemplatesPage() {
  const qc = useQueryClient();
  const { data: templates = [], isLoading } = useQuery({
    queryKey: ["assessment-templates"],
    queryFn: listTemplates,
  });

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<AssessmentTemplate | null>(null);
  const [draft, setDraft] = useState<TemplateInput>(emptyDraft);

  const create = useMutation({
    mutationFn: (input: TemplateInput) => createTemplate(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["assessment-templates"] });
      toast.success("Template created");
      setOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const update = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<TemplateInput> }) =>
      updateTemplate(id, patch),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["assessment-templates"] });
      toast.success("Template updated");
      setOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const remove = useMutation({
    mutationFn: (id: string) => deleteTemplate(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["assessment-templates"] });
      toast.success("Template deleted");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function openCreate() {
    setEditing(null);
    setDraft(emptyDraft);
    setOpen(true);
  }
  function openEdit(t: AssessmentTemplate) {
    setEditing(t);
    setDraft({
      title: t.title,
      description: t.description,
      role: t.role,
      difficulty: t.difficulty,
      level: t.level,
      pass_mark: t.pass_mark,
      duration_min: t.duration_min,
      mix: { ...t.mix },
    });
    setOpen(true);
  }
  function save() {
    if (!draft.title.trim()) return toast.error("Title is required");
    if (draft.mix.mcq_ratio + draft.mix.essay_ratio !== 100)
      return toast.error("MCQ + essay must equal 100%");
    if (editing) update.mutate({ id: editing.id, patch: draft });
    else create.mutate(draft);
  }
  function setMcq(v: number) {
    setDraft((d) => ({
      ...d,
      mix: { ...d.mix, mcq_ratio: v, essay_ratio: 100 - v },
    }));
  }

  return (
    <AdminLayout
      title="Test Templates"
      subtitle="Define randomized test recipes per role — MCQ/essay ratios, difficulty, and length."
      actions={
        <Button onClick={openCreate} className="h-9 gap-1.5 rounded-lg">
          <Plus className="h-4 w-4" /> New template
        </Button>
      }
    >
      <Card className="rounded-xl border-border shadow-soft">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Template</TableHead>
              <TableHead>Role</TableHead>
              <TableHead className="text-right">Questions</TableHead>
              <TableHead>Mix</TableHead>
              <TableHead>Difficulty</TableHead>
              <TableHead>Level</TableHead>
              <TableHead className="text-right">Duration</TableHead>
              <TableHead className="text-right">Pass</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center text-muted-foreground">
                  Loading…
                </TableCell>
              </TableRow>
            ) : templates.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="py-10 text-center text-muted-foreground">
                  <Layers className="mx-auto mb-2 h-6 w-6 opacity-50" />
                  No templates yet. Create one to start configuring randomized tests per role.
                </TableCell>
              </TableRow>
            ) : (
              templates.map((t) => (
                <TableRow key={t.id}>
                  <TableCell>
                    <div className="font-medium text-foreground">{t.title}</div>
                    {t.description ? (
                      <div className="text-[11.5px] text-muted-foreground line-clamp-1">
                        {t.description}
                      </div>
                    ) : null}
                  </TableCell>
                  <TableCell>
                    {t.role ? (
                      <Badge variant="outline" className="rounded-md">
                        {t.role}
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground">Any</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{t.mix.total_questions}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1 text-[11.5px]">
                      <span className="rounded bg-primary/10 px-1.5 py-0.5 font-medium text-primary">
                        {t.mix.mcq_ratio}% MCQ
                      </span>
                      <span className="rounded bg-muted px-1.5 py-0.5 font-medium text-muted-foreground">
                        {t.mix.essay_ratio}% Essay
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="rounded-md">
                      {t.difficulty}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-[12.5px] text-muted-foreground">{t.level}</TableCell>
                  <TableCell className="text-right tabular-nums">{t.duration_min}m</TableCell>
                  <TableCell className="text-right tabular-nums">{t.pass_mark}%</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8"
                        onClick={() => openEdit(t)}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 text-destructive hover:text-destructive"
                        onClick={() => {
                          if (confirm(`Delete template "${t.title}"?`)) remove.mutate(t.id);
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              {editing ? "Edit template" : "New randomized test template"}
            </DialogTitle>
            <DialogDescription>
              Configure how the randomizer should build tests for this role.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-2">
            <div className="grid gap-1.5">
              <Label>Title</Label>
              <Input
                value={draft.title}
                onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
                placeholder="e.g. DS Foundations — Final"
              />
            </div>
            <div className="grid gap-1.5">
              <Label>Description</Label>
              <Textarea
                rows={2}
                value={draft.description}
                onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
                placeholder="Optional notes about when this template applies"
              />
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div className="grid gap-1.5">
                <Label>Role</Label>
                <Select
                  value={draft.role || "__any"}
                  onValueChange={(v) =>
                    setDraft((d) => ({ ...d, role: v === "__any" ? "" : v }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Any role" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__any">Any role</SelectItem>
                    {ROLES.map((r) => (
                      <SelectItem key={r} value={r}>
                        {r}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label>Level</Label>
                <Select
                  value={draft.level}
                  onValueChange={(v) => setDraft((d) => ({ ...d, level: v }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {LEVELS.map((l) => (
                      <SelectItem key={l} value={l}>
                        {l}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid gap-1.5">
              <div className="flex items-center justify-between">
                <Label>Question mix</Label>
                <div className="text-[11.5px] text-muted-foreground">
                  {draft.mix.mcq_ratio}% MCQ · {draft.mix.essay_ratio}% Essay
                </div>
              </div>
              <Slider
                value={[draft.mix.mcq_ratio]}
                onValueChange={(v) => setMcq(v[0])}
                min={0}
                max={100}
                step={5}
              />
            </div>

            <div className="grid gap-3 md:grid-cols-4">
              <div className="grid gap-1.5">
                <Label>Total questions</Label>
                <Input
                  type="number"
                  min={1}
                  max={200}
                  value={draft.mix.total_questions}
                  onChange={(e) =>
                    setDraft((d) => ({
                      ...d,
                      mix: { ...d.mix, total_questions: Number(e.target.value) || 0 },
                    }))
                  }
                />
              </div>
              <div className="grid gap-1.5">
                <Label>Difficulty</Label>
                <Select
                  value={draft.difficulty}
                  onValueChange={(v) =>
                    setDraft((d) => ({ ...d, difficulty: v as TemplateDifficulty }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DIFFICULTIES.map((d) => (
                      <SelectItem key={d} value={d}>
                        {d}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label>Duration (min)</Label>
                <Input
                  type="number"
                  min={5}
                  max={480}
                  value={draft.duration_min}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, duration_min: Number(e.target.value) || 0 }))
                  }
                />
              </div>
              <div className="grid gap-1.5">
                <Label>Pass mark (%)</Label>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  value={draft.pass_mark}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, pass_mark: Number(e.target.value) || 0 }))
                  }
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={save} disabled={create.isPending || update.isPending}>
              {editing ? "Save changes" : "Create template"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
