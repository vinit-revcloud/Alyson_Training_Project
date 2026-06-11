import { Card } from "@/components/ui/card";
import { ArrowUpRight, ArrowDownRight, type LucideIcon } from "lucide-react";

export function MetricCard({
  label,
  value,
  delta,
  trend = "up",
  icon: Icon,
  sub,
}: {
  label: string;
  value: string;
  delta?: string;
  trend?: "up" | "down" | "flat";
  icon?: LucideIcon;
  sub?: string;
}) {
  const trendColor =
    trend === "up" ? "text-success" : trend === "down" ? "text-destructive" : "text-muted-foreground";
  const TrendIcon = trend === "down" ? ArrowDownRight : ArrowUpRight;
  return (
    <Card className="rounded-xl border-border bg-card p-5 shadow-soft transition hover:shadow-glow">
      <div className="flex items-center justify-between">
        <div className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
          {label}
        </div>
        {Icon ? (
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-accent text-primary">
            <Icon className="h-3.5 w-3.5" strokeWidth={1.75} />
          </div>
        ) : null}
      </div>
      <div className="mt-3 flex items-baseline gap-2">
        <div className="text-[28px] font-bold leading-none tracking-tight text-foreground">
          {value}
        </div>
        {delta ? (
          <div className={`flex items-center gap-0.5 text-[11px] font-semibold ${trendColor}`}>
            <TrendIcon className="h-3 w-3" />
            {delta}
          </div>
        ) : null}
      </div>
      {sub ? <div className="mt-1 text-[11px] text-muted-foreground">{sub}</div> : null}
    </Card>
  );
}
