import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { Check, Trash2, FileText, ListChecks } from "lucide-react";
import type { Difficulty, Question } from "@/lib/test-types";

const diffStyles: Record<Difficulty, string> = {
  easy: "bg-[var(--chart-1)]/15 text-[var(--chart-1)] border-[var(--chart-1)]/30",
  medium: "bg-[var(--chart-2)]/15 text-[var(--chart-2)] border-[var(--chart-2)]/30",
  hard: "bg-[var(--chart-3)]/15 text-[var(--chart-3)] border-[var(--chart-3)]/30",
};

export function QuestionEditor({
  q,
  index,
  onChange,
  onDelete,
}: {
  q: Question;
  index: number;
  onChange: (q: Question) => void;
  onDelete: () => void;
}) {
  const setOpt = (i: number, value: string) => {
    const options = [...(q.options ?? ["", "", "", ""])];
    const oldVal = options[i];
    options[i] = value;
    const correct = q.correctAnswer === oldVal ? value : q.correctAnswer;
    onChange({ ...q, options, correctAnswer: correct });
  };

  return (
    <Card className="p-5 shadow-soft hover:shadow-glow/30 transition-shadow">
      <div className="flex items-start gap-3 mb-3">
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-hero text-xs font-bold text-primary-foreground">
          {index + 1}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <Badge variant="outline" className="gap-1 font-normal">
              {q.type === "mcq" ? <ListChecks className="h-3 w-3" /> : <FileText className="h-3 w-3" />}
              {q.type === "mcq" ? "MCQ" : "Subjective"}
            </Badge>
            <Badge variant="outline" className={diffStyles[q.difficulty]}>
              {q.difficulty}
            </Badge>
            <Input
              value={q.topic}
              onChange={(e) => onChange({ ...q, topic: e.target.value })}
              className="h-7 w-40 text-xs"
              placeholder="Topic"
            />
            <Select
              value={q.difficulty}
              onValueChange={(v: Difficulty) => onChange({ ...q, difficulty: v })}
            >
              <SelectTrigger className="h-7 w-28 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="easy">Easy</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="hard">Hard</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <Button
          size="icon"
          variant="ghost"
          onClick={onDelete}
          className="h-8 w-8 text-muted-foreground hover:text-destructive"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>

      <Textarea
        value={q.prompt}
        onChange={(e) => onChange({ ...q, prompt: e.target.value })}
        className="mb-3 min-h-16 text-sm"
      />

      {q.type === "mcq" ? (
        <div className="space-y-2">
          {(q.options ?? ["", "", "", ""]).map((opt, i) => {
            const isCorrect = q.correctAnswer === opt && opt !== "";
            return (
              <div key={i} className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => onChange({ ...q, correctAnswer: opt })}
                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md border text-xs font-semibold transition-all ${
                    isCorrect
                      ? "bg-success border-success text-success-foreground"
                      : "bg-background border-input text-muted-foreground hover:border-primary"
                  }`}
                  title="Mark as correct"
                >
                  {isCorrect ? <Check className="h-4 w-4" /> : String.fromCharCode(65 + i)}
                </button>
                <Input
                  value={opt}
                  onChange={(e) => setOpt(i, e.target.value)}
                  className="h-8 text-sm"
                  placeholder={`Option ${String.fromCharCode(65 + i)}`}
                />
              </div>
            );
          })}
        </div>
      ) : (
        <Textarea
          value={q.rubric ?? ""}
          onChange={(e) => onChange({ ...q, rubric: e.target.value })}
          placeholder="Grading rubric / model answer keypoints…"
          className="min-h-14 text-sm bg-muted/40"
        />
      )}
    </Card>
  );
}
