import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { PipelineStageRow } from "@/lib/hiring-pipeline/hiring-pipeline.shared";
import {
  KANBAN_STAGES,
  STAGE_DESCRIPTIONS,
  STAGE_SHORT_LABELS,
  type PipelineStage,
} from "@/lib/hiring-pipeline/hiring-pipeline.shared";
import { Check } from "lucide-react";

type NodeState = "passed" | "current" | "failed" | "pending";

function nodeState(
  stage: PipelineStage,
  currentStage: PipelineStage,
  stageRows: PipelineStageRow[],
): NodeState {
  const row = stageRows.find((s) => s.stage === stage);
  if (row?.status === "failed") return "failed";
  if (row?.status === "passed") return "passed";
  if (stage === currentStage) return "current";
  return "pending";
}

export function PipelineStageTimeline({
  currentStage,
  stages,
}: {
  currentStage: PipelineStage;
  stages: PipelineStageRow[];
}) {
  return (
    <Card className="mb-8 rounded-xl border-border bg-card p-5 shadow-soft">
      <h2 className="mb-4 text-base font-semibold tracking-tight">Journey progress</h2>
      <div className="-mx-1 overflow-x-auto px-1 pb-1">
        <ol className="flex min-w-[640px] items-start">
          {KANBAN_STAGES.map((stage, idx) => {
            const state = nodeState(stage, currentStage, stages);
            const isLast = idx === KANBAN_STAGES.length - 1;

            return (
              <li key={stage} className="flex flex-1 flex-col items-center">
                <div className="flex w-full items-center">
                  {idx > 0 ? (
                    <div
                      className={cn(
                        "h-0.5 flex-1",
                        state === "passed" || state === "current"
                          ? "bg-primary"
                          : "bg-border",
                      )}
                    />
                  ) : (
                    <div className="flex-1" />
                  )}
                  <div
                    title={STAGE_DESCRIPTIONS[stage]}
                    className={cn(
                      "relative flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
                      state === "passed" && "border-primary bg-primary text-primary-foreground",
                      state === "current" && "border-primary bg-card ring-4 ring-primary/20",
                      state === "failed" && "border-destructive bg-destructive/10",
                      state === "pending" && "border-border bg-muted",
                    )}
                  >
                    {state === "passed" ? (
                      <Check className="h-3.5 w-3.5" strokeWidth={2.5} />
                    ) : state === "current" ? (
                      <span className="h-2.5 w-2.5 rounded-full bg-primary" />
                    ) : state === "failed" ? (
                      <span className="h-2 w-2 rounded-full bg-destructive" />
                    ) : (
                      <span className="h-2 w-2 rounded-full bg-muted-foreground/30" />
                    )}
                  </div>
                  {!isLast ? (
                    <div
                      className={cn(
                        "h-0.5 flex-1",
                        nodeState(KANBAN_STAGES[idx + 1]!, currentStage, stages) === "passed" ||
                          nodeState(KANBAN_STAGES[idx + 1]!, currentStage, stages) === "current"
                          ? "bg-primary"
                          : "bg-border",
                      )}
                    />
                  ) : (
                    <div className="flex-1" />
                  )}
                </div>
                <p
                  className={cn(
                    "mt-2 max-w-[5.5rem] text-center text-[11px] leading-tight",
                    state === "current" ? "font-semibold text-primary" : "text-muted-foreground",
                  )}
                  title={STAGE_DESCRIPTIONS[stage]}
                >
                  {STAGE_SHORT_LABELS[stage]}
                </p>
              </li>
            );
          })}
        </ol>
      </div>
    </Card>
  );
}
