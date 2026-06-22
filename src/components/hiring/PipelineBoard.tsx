import { Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Search, Users } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { PipelineListItem } from "@/lib/hiring-pipeline/hiring-pipeline.shared";
import {
  KANBAN_STAGES,
  PIPELINE_STATUS_LABELS,
  STAGE_SHORT_LABELS,
  type PipelineStage,
} from "@/lib/hiring-pipeline/hiring-pipeline.shared";
import { DEPARTMENTS } from "@/lib/departments";

type StatusFilter = "active" | "all" | "hired" | "rejected";

function daysSince(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
}

function StatPill({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="text-2xl font-semibold tabular-nums tracking-tight text-foreground">
        {value}
      </span>
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
  );
}

function PipelineCard({ pipeline }: { pipeline: PipelineListItem }) {
  const isTerminal = pipeline.status !== "active";
  const days = daysSince(pipeline.updated_at);

  return (
    <Link
      to="/hiring/pipeline/$pipelineId"
      params={{ pipelineId: pipeline.id }}
      className="group block"
    >
      <div
        className={cn(
          "rounded-lg bg-background px-3 py-2.5 ring-1 ring-border/60 transition",
          "hover:ring-primary/25 hover:shadow-sm",
          isTerminal && "opacity-75",
        )}
      >
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm font-medium leading-snug text-foreground group-hover:text-primary">
            {pipeline.candidate_name}
          </p>
          {isTerminal ? (
            <Badge
              variant={pipeline.status === "hired" ? "secondary" : "outline"}
              className="shrink-0 text-[10px] font-normal"
            >
              {PIPELINE_STATUS_LABELS[pipeline.status]}
            </Badge>
          ) : null}
        </div>
        <p className="mt-1 truncate text-xs text-muted-foreground">{pipeline.candidate_email}</p>
        <p className="mt-2 text-[11px] text-muted-foreground">
          {pipeline.target_department}
          {days > 0 ? <span className="text-muted-foreground/70"> · {days}d</span> : null}
          {pipeline.onboarding_pct != null && pipeline.current_stage === "onboarding" ? (
            <span className="text-muted-foreground/70"> · {pipeline.onboarding_pct}%</span>
          ) : null}
        </p>
      </div>
    </Link>
  );
}

function KanbanColumn({
  stage,
  items,
}: {
  stage: PipelineStage;
  items: PipelineListItem[];
}) {
  return (
    <div className="flex w-[200px] shrink-0 flex-col">
      <div className="mb-2 flex items-center justify-between px-1">
        <h3
          className="text-xs font-medium text-foreground"
          title={stage}
        >
          {STAGE_SHORT_LABELS[stage]}
        </h3>
        <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] tabular-nums text-muted-foreground">
          {items.length}
        </span>
      </div>
      <div className="flex min-h-[120px] flex-col gap-2 rounded-xl bg-muted/40 p-2">
        {items.length === 0 ? (
          <div className="flex flex-1 items-center justify-center py-6">
            <span className="text-[11px] text-muted-foreground/60">—</span>
          </div>
        ) : (
          items.map((p) => <PipelineCard key={p.id} pipeline={p} />)
        )}
      </div>
    </div>
  );
}

export function PipelineBoard({ pipelines }: { pipelines: PipelineListItem[] }) {
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("active");
  const [deptFilter, setDeptFilter] = useState<string>("all");

  const filtered = useMemo(() => {
    return pipelines.filter((p) => {
      const hay = `${p.candidate_name} ${p.candidate_email} ${p.target_role}`.toLowerCase();
      if (q && !hay.includes(q.toLowerCase())) return false;
      if (deptFilter !== "all" && p.target_department !== deptFilter) return false;
      if (statusFilter === "active") return p.status === "active";
      if (statusFilter === "hired") return p.status === "hired";
      if (statusFilter === "rejected") return p.status === "rejected" || p.status === "withdrawn";
      return true;
    });
  }, [pipelines, q, statusFilter, deptFilter]);

  const metrics = useMemo(() => {
    const active = pipelines.filter((p) => p.status === "active");
    return {
      active: active.length,
      inTrial: active.filter((p) =>
        ["trial_project", "bill_review"].includes(p.current_stage),
      ).length,
      onboarding: active.filter((p) => p.current_stage === "onboarding").length,
      hired: pipelines.filter((p) => p.status === "hired").length,
    };
  }, [pipelines]);

  const byStage = useMemo(() => {
    const map: Record<string, PipelineListItem[]> = {};
    for (const stage of KANBAN_STAGES) map[stage] = [];
    for (const p of filtered) {
      if (p.status === "active" && map[p.current_stage]) {
        map[p.current_stage].push(p);
      }
    }
    return map;
  }, [filtered]);

  const closed = useMemo(
    () =>
      filtered.filter(
        (p) => p.status === "hired" || p.status === "rejected" || p.status === "withdrawn",
      ),
    [filtered],
  );

  const showKanban = statusFilter === "active" || statusFilter === "all";

  return (
    <div className="space-y-8">
      {/* Compact stats */}
      <div className="flex flex-wrap items-center gap-x-8 gap-y-3 border-b border-border/60 pb-6">
        <StatPill label="Active" value={metrics.active} />
        <StatPill label="Trial / review" value={metrics.inTrial} />
        <StatPill label="Onboarding" value={metrics.onboarding} />
        <StatPill label="Hired" value={metrics.hired} />
      </div>

      {/* Toolbar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1 sm:max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search candidates…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="h-10 border-border/60 bg-background pl-9"
          />
        </div>
        <div className="flex gap-2">
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
            <SelectTrigger className="h-10 w-[140px] border-border/60 bg-background">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="active">In progress</SelectItem>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="hired">Hired</SelectItem>
              <SelectItem value="rejected">Rejected</SelectItem>
            </SelectContent>
          </Select>
          <Select value={deptFilter} onValueChange={setDeptFilter}>
            <SelectTrigger className="h-10 w-[160px] border-border/60 bg-background">
              <SelectValue placeholder="Department" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All departments</SelectItem>
              {DEPARTMENTS.map((d) => (
                <SelectItem key={d} value={d}>
                  {d}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {filtered.length === 0 ? (
        <Card className="border-dashed bg-muted/20 py-16 text-center shadow-none">
          <Users className="mx-auto mb-3 h-9 w-9 text-muted-foreground/50" />
          <p className="text-sm font-medium text-foreground">No candidates yet</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Add someone to begin the hiring journey.
          </p>
        </Card>
      ) : null}

      {showKanban && filtered.some((p) => p.status === "active") ? (
        <div className="-mx-1 overflow-x-auto px-1 pb-4">
          <div className="flex gap-4">
            {KANBAN_STAGES.map((stage) => (
              <KanbanColumn key={stage} stage={stage} items={byStage[stage] ?? []} />
            ))}
          </div>
        </div>
      ) : null}

      {closed.length > 0 &&
      (statusFilter === "all" || statusFilter === "hired" || statusFilter === "rejected") ? (
        <section className="space-y-3">
          <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Closed ({closed.length})
          </h2>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {closed.map((p) => (
              <PipelineCard key={p.id} pipeline={p} />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
