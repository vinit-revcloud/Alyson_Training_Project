import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { TestBuilder } from "@/components/test-builder/TestBuilder";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getClassAssessmentSeed } from "@/lib/classes-api";
import { ArrowLeft, Sparkles } from "lucide-react";

interface BuilderSearch {
  classId?: string;
  className?: string;
  role?: string;
  topics?: string;
  difficulty?: "Beginner" | "Intermediate" | "Advanced";
  mcq?: number;
  subjective?: number;
  passMark?: number;
  purpose?: "training" | "interview";
}

const ALLOWED_DIFF = ["Beginner", "Intermediate", "Advanced"] as const;
const numOrUndef = (v: unknown) =>
  v === undefined || v === null || v === "" ? undefined : Number(v);
const strOrUndef = (v: unknown) =>
  typeof v === "string" && v.length ? v : undefined;

export const Route = createFileRoute("/assessments/builder")({
  head: () => ({ meta: [{ title: "Question Randomizer — Alyson" }] }),
  validateSearch: (search: Record<string, unknown>): BuilderSearch => ({
    classId: strOrUndef(search.classId),
    className: strOrUndef(search.className),
    role: strOrUndef(search.role),
    topics: strOrUndef(search.topics),
    difficulty: ALLOWED_DIFF.includes(search.difficulty as never)
      ? (search.difficulty as BuilderSearch["difficulty"])
      : undefined,
    mcq: numOrUndef(search.mcq),
    subjective: numOrUndef(search.subjective),
    passMark: numOrUndef(search.passMark),
    purpose:
      search.purpose === "interview" || search.purpose === "training"
        ? search.purpose
        : undefined,
  }),
  component: BuilderPage,
});

function BuilderPage() {
  const preset = Route.useSearch();
  const topics = preset.topics ? preset.topics.split(",").filter(Boolean) : [];
  const hasPreset = Boolean(preset.classId || preset.className);
  const { data: classSeed, isLoading: loadingSeed } = useQuery({
    queryKey: ["class-assessment-seed", preset.classId],
    queryFn: () => getClassAssessmentSeed(preset.classId!),
    enabled: Boolean(preset.classId),
  });

  return (
    <AdminLayout
      title="Question Randomizer"
      subtitle="Generate, review and publish a calibrated assessment"
      actions={
        preset.classId ? (
          <Button asChild variant="outline" className="h-9 gap-1.5 rounded-lg border-border text-[12.5px]">
            <Link to="/classes/$classId" params={{ classId: preset.classId }}>
              <ArrowLeft className="h-3.5 w-3.5" /> Back to class
            </Link>
          </Button>
        ) : hasPreset ? (
          <Button asChild variant="outline" className="h-9 gap-1.5 rounded-lg border-border text-[12.5px]">
            <Link to="/classes/new">
              <ArrowLeft className="h-3.5 w-3.5" /> Back to class
            </Link>
          </Button>
        ) : null
      }
    >
      {preset.purpose === "interview" ? (
        <div className="mb-5 rounded-xl border border-violet-200 bg-violet-50/80 p-4 shadow-soft">
          <p className="text-[13px] font-semibold text-violet-900">Interview assessment mode</p>
          <p className="mt-1 text-[12px] text-violet-800">
            Generate hard, scenario-based questions. On the review step, pick a class, validate, and{" "}
            <strong>Save assessment</strong> — it will appear when scheduling interviews.
          </p>
        </div>
      ) : null}

      {hasPreset ? (
        <div className="mb-5 rounded-xl border border-primary/25 bg-accent/60 p-4 shadow-soft">
          <div className="flex flex-wrap items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            <span className="text-[12.5px] font-semibold text-foreground">
              Pre-filled from class
              {preset.className ? <span className="ml-1 font-normal text-muted-foreground">· {preset.className}</span> : null}
            </span>
            {preset.difficulty ? (
              <Badge variant="outline" className="rounded-md border-primary/30 bg-card text-[10.5px] font-medium text-primary">
                {preset.difficulty}
              </Badge>
            ) : null}
            {typeof preset.mcq === "number" ? (
              <Badge variant="outline" className="rounded-md border-border bg-card text-[10.5px] font-medium text-muted-foreground">
                {preset.mcq} MCQ
              </Badge>
            ) : null}
            {typeof preset.subjective === "number" ? (
              <Badge variant="outline" className="rounded-md border-border bg-card text-[10.5px] font-medium text-muted-foreground">
                {preset.subjective} subjective
              </Badge>
            ) : null}
            {typeof preset.passMark === "number" ? (
              <Badge variant="outline" className="rounded-md border-border bg-card text-[10.5px] font-medium text-muted-foreground">
                Pass {preset.passMark}%
              </Badge>
            ) : null}
          </div>
          {topics.length ? (
            <div className="mt-2 flex flex-wrap gap-1.5">
              <span className="text-[10.5px] uppercase tracking-[0.14em] text-muted-foreground">Topics</span>
              {topics.map((t: string) => (
                <Badge key={t} variant="outline" className="rounded-md border-border bg-card text-[10.5px] font-medium text-foreground">
                  {t}
                </Badge>
              ))}
            </div>
          ) : null}
          {preset.classId ? (
            <div className="mt-2 flex flex-wrap gap-1.5 text-[11px] text-muted-foreground">
              <span>{loadingSeed ? "Loading class material…" : `${classSeed?.sectionCount ?? 0} sections`}</span>
              <span>·</span>
              <span>{classSeed?.assetCount ?? 0} uploaded assets</span>
              <span>·</span>
              <span>{classSeed?.questions.length ?? 0} saved section questions</span>
            </div>
          ) : null}
          <p className="mt-2 text-[11px] text-muted-foreground">
            Use these as your starting parameters in Profile + Generate steps below.
          </p>
        </div>
      ) : null}

      <div className="-mx-6 lg:-mx-8">
        <TestBuilder
          preset={{
            classId: preset.classId,
            className: preset.className,
            role: preset.role,
            topics,
            difficulty: preset.difficulty,
            mcq: preset.mcq,
            subjective: preset.subjective,
            passMark: preset.passMark,
            materialText: classSeed?.materialText,
            fileNames: classSeed?.fileNames,
            questions: classSeed?.questions,
            purpose: preset.purpose,
          }}
        />
      </div>
    </AdminLayout>
  );
}
