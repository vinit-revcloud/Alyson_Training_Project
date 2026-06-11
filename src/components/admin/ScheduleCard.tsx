import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Play, Save, Plus, X, Calendar, Zap } from "lucide-react";
import { toast } from "sonner";
import {
  CRON_PRESETS,
  JOB_META,
  saveSchedule,
  type EscalationTier,
  type NotificationScheduleRow,
} from "@/lib/email/schedules-api";
import { runJobNow } from "@/lib/email/schedules.functions";

const AUDIENCE_OPTIONS: EscalationTier["audiences"][number][] = ["learner", "hr", "ceo", "admin"];

export function ScheduleCard({ schedule }: { schedule: NotificationScheduleRow }) {
  const qc = useQueryClient();
  const meta = JOB_META[schedule.job_key];
  const runNow = useServerFn(runJobNow);

  const [enabled, setEnabled] = useState(schedule.enabled);
  const [cron, setCron] = useState(schedule.cron_expression);
  const [customCron, setCustomCron] = useState(
    CRON_PRESETS.some((p) => p.value === schedule.cron_expression) ? "" : schedule.cron_expression,
  );
  const [delayHours, setDelayHours] = useState<number>(schedule.config.delay_hours ?? 0);
  const [tiers, setTiers] = useState<EscalationTier[]>(
    schedule.config.tiers ?? [{ days: 7, audiences: ["learner"] }],
  );

  useEffect(() => {
    setEnabled(schedule.enabled);
    setCron(schedule.cron_expression);
    setDelayHours(schedule.config.delay_hours ?? 0);
    setTiers(schedule.config.tiers ?? [{ days: 7, audiences: ["learner"] }]);
  }, [schedule.job_key]);

  const isPreset = CRON_PRESETS.some((p) => p.value === cron);
  const selectValue = meta.eventDriven ? "on_event" : isPreset ? cron : "custom";

  const saveM = useMutation({
    mutationFn: () =>
      saveSchedule({
        job_key: schedule.job_key,
        enabled,
        cron_expression: meta.eventDriven ? "on_event" : selectValue === "custom" ? customCron : cron,
        config: {
          ...(schedule.job_key === "failure_retake" ? { delay_hours: delayHours } : {}),
          ...(schedule.job_key === "escalation" ? { tiers } : {}),
        },
      }),
    onSuccess: () => {
      toast.success("Schedule saved");
      qc.invalidateQueries({ queryKey: ["notification-schedules"] });
    },
    onError: (e: Error) => toast.error("Save failed", { description: e.message }),
  });

  const runM = useMutation({
    mutationFn: () => runNow({ data: { jobKey: schedule.job_key } }),
    onSuccess: (r: unknown) => {
      const result = r as { queued?: number; note?: string };
      toast.success("Job triggered", {
        description: result.note ?? `Queued ${result.queued ?? 0} email(s)`,
      });
      qc.invalidateQueries({ queryKey: ["notification-schedules"] });
    },
    onError: (e: Error) => toast.error("Run failed", { description: e.message }),
  });

  const addTier = () => setTiers([...tiers, { days: 30, audiences: ["learner", "admin"] }]);
  const removeTier = (i: number) => setTiers(tiers.filter((_, idx) => idx !== i));
  const updateTier = (i: number, patch: Partial<EscalationTier>) =>
    setTiers(tiers.map((t, idx) => (idx === i ? { ...t, ...patch } : t)));

  return (
    <Card className="space-y-4 rounded-xl border-border bg-card p-5 shadow-soft">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            {meta.eventDriven ? (
              <Zap className="h-4 w-4 text-primary" strokeWidth={1.75} />
            ) : (
              <Calendar className="h-4 w-4 text-primary" strokeWidth={1.75} />
            )}
            <div className="text-sm font-semibold text-foreground">{meta.label}</div>
            <Badge variant="outline" className="text-[10px]">
              {meta.eventDriven ? "Event-driven" : "Scheduled"}
            </Badge>
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground">{meta.description}</p>
          {schedule.last_run_at && (
            <p className="mt-1 text-[10px] text-muted-foreground">
              Last run: {new Date(schedule.last_run_at).toLocaleString()} ·{" "}
              {schedule.last_run_queued ?? 0} queued
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Label htmlFor={`enabled-${schedule.job_key}`} className="text-xs">
            Enabled
          </Label>
          <Switch
            id={`enabled-${schedule.job_key}`}
            checked={enabled}
            onCheckedChange={setEnabled}
          />
        </div>
      </div>

      {!meta.eventDriven && (
        <div className="space-y-2">
          <Label className="text-xs">Schedule</Label>
          <Select
            value={selectValue}
            onValueChange={(v) => {
              if (v === "custom") setCron(customCron || "0 9 * * *");
              else setCron(v);
            }}
          >
            <SelectTrigger className="h-9 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CRON_PRESETS.map((p) => (
                <SelectItem key={p.value} value={p.value} className="text-xs">
                  {p.label}
                </SelectItem>
              ))}
              <SelectItem value="custom" className="text-xs">
                Custom cron…
              </SelectItem>
            </SelectContent>
          </Select>
          {selectValue === "custom" && (
            <Input
              value={customCron}
              onChange={(e) => setCustomCron(e.target.value)}
              placeholder="0 9 * * *"
              className="h-9 font-mono text-xs"
            />
          )}
        </div>
      )}

      {schedule.job_key === "failure_retake" && (
        <div className="space-y-1.5">
          <Label htmlFor="delay" className="text-xs">
            Delay after failed attempt (hours)
          </Label>
          <Input
            id="delay"
            type="number"
            min={0}
            max={168}
            value={delayHours}
            onChange={(e) => setDelayHours(Number(e.target.value))}
            className="h-9 text-xs"
          />
        </div>
      )}

      {schedule.job_key === "escalation" && (
        <div className="space-y-2">
          <Label className="text-xs">Escalation tiers</Label>
          <div className="space-y-2">
            {tiers.map((tier, i) => (
              <div key={i} className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-background p-2">
                <span className="text-[11px] text-muted-foreground">After</span>
                <Input
                  type="number"
                  min={1}
                  max={365}
                  value={tier.days}
                  onChange={(e) => updateTier(i, { days: Number(e.target.value) })}
                  className="h-8 w-16 text-xs"
                />
                <span className="text-[11px] text-muted-foreground">days, notify:</span>
                <div className="flex flex-wrap gap-1">
                  {AUDIENCE_OPTIONS.map((a) => {
                    const on = tier.audiences.includes(a);
                    return (
                      <button
                        key={a}
                        type="button"
                        onClick={() =>
                          updateTier(i, {
                            audiences: on
                              ? tier.audiences.filter((x) => x !== a)
                              : [...tier.audiences, a],
                          })
                        }
                        className={`rounded px-2 py-0.5 text-[10px] font-medium border transition-colors ${
                          on
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-border bg-background text-muted-foreground hover:bg-accent"
                        }`}
                      >
                        {a}
                      </button>
                    );
                  })}
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="ml-auto h-7 w-7 p-0"
                  onClick={() => removeTier(i)}
                  disabled={tiers.length <= 1}
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
            <Button type="button" variant="outline" size="sm" onClick={addTier}>
              <Plus className="mr-1 h-3.5 w-3.5" /> Add tier
            </Button>
          </div>
        </div>
      )}

      <div className="flex gap-2 pt-1">
        <Button size="sm" onClick={() => saveM.mutate()} disabled={saveM.isPending}>
          <Save className="mr-1 h-3.5 w-3.5" />
          {saveM.isPending ? "Saving…" : "Save"}
        </Button>
        {!meta.eventDriven && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => runM.mutate()}
            disabled={runM.isPending || !enabled}
          >
            <Play className="mr-1 h-3.5 w-3.5" />
            {runM.isPending ? "Running…" : "Run now"}
          </Button>
        )}
      </div>
    </Card>
  );
}
