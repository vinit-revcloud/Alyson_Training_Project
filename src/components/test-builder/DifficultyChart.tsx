import { Card } from "@/components/ui/card";
import {
  Bar,
  BarChart,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { Question } from "@/lib/test-types";

const COLORS: Record<string, string> = {
  easy: "var(--chart-1)",
  medium: "var(--chart-2)",
  hard: "var(--chart-3)",
};

export function DifficultyChart({ questions }: { questions: Question[] }) {
  const counts = { easy: 0, medium: 0, hard: 0 } as Record<string, number>;
  for (const q of questions) counts[q.difficulty]++;
  const data = (["easy", "medium", "hard"] as const).map((k) => ({
    name: k.charAt(0).toUpperCase() + k.slice(1),
    value: counts[k],
    fill: COLORS[k],
  }));

  const mcqCount = questions.filter((q) => q.type === "mcq").length;
  const subjCount = questions.length - mcqCount;
  const estMin = Math.round(mcqCount * 1.2 + subjCount * 4);

  return (
    <Card className="p-5 shadow-soft">
      <div className="flex items-baseline justify-between mb-3">
        <h3 className="text-sm font-semibold text-foreground">Difficulty distribution</h3>
        <span className="text-xs text-muted-foreground">~{estMin} min</span>
      </div>
      <div className="h-40">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
            <XAxis dataKey="name" tickLine={false} axisLine={false} fontSize={11} />
            <YAxis allowDecimals={false} tickLine={false} axisLine={false} fontSize={11} />
            <Tooltip
              cursor={{ fill: "var(--muted)" }}
              contentStyle={{
                background: "var(--popover)",
                border: "1px solid var(--border)",
                borderRadius: 8,
                fontSize: 12,
              }}
            />
            <Bar dataKey="value" radius={[6, 6, 0, 0]}>
              {data.map((d, i) => (
                <Cell key={i} fill={d.fill} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
        <Stat label="MCQ" value={mcqCount} />
        <Stat label="Subjective" value={subjCount} />
        <Stat label="Topics" value={new Set(questions.map((q) => q.topic)).size} />
      </div>
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md bg-muted/60 py-2">
      <div className="text-base font-bold text-foreground">{value}</div>
      <div className="text-muted-foreground">{label}</div>
    </div>
  );
}
