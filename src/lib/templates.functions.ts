import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireContentManager } from "@/integrations/neon/auth-middleware";
import { getPgPool } from "@/lib/pg.server";
import type { AssessmentTemplate, TemplateDifficulty, TemplateInput } from "@/lib/templates-api";

const DEFAULT_MIX = { total_questions: 20, mcq_ratio: 70, essay_ratio: 30 };

interface DbTemplateRow {
  id: string;
  title: string;
  description: string;
  role: string;
  difficulty: string;
  level: string;
  pass_mark: number;
  duration_min: number;
  questions: unknown;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

function parseMix(questions: unknown) {
  if (Array.isArray(questions) && questions.length > 0) {
    const cfg = questions[0] as Partial<typeof DEFAULT_MIX>;
    if (typeof cfg.total_questions === "number") {
      return {
        total_questions: cfg.total_questions,
        mcq_ratio: cfg.mcq_ratio ?? 70,
        essay_ratio: cfg.essay_ratio ?? 30,
      };
    }
  }
  if (questions && typeof questions === "object" && !Array.isArray(questions)) {
    const cfg = questions as Partial<typeof DEFAULT_MIX>;
    if (typeof cfg.total_questions === "number") {
      return {
        total_questions: cfg.total_questions,
        mcq_ratio: cfg.mcq_ratio ?? 70,
        essay_ratio: cfg.essay_ratio ?? 30,
      };
    }
  }
  return DEFAULT_MIX;
}

function toTemplate(row: DbTemplateRow): AssessmentTemplate {
  return {
    id: row.id,
    title: row.title,
    description: row.description ?? "",
    role: row.role ?? "",
    difficulty: (row.difficulty as TemplateDifficulty) || "Mixed",
    level: row.level ?? "Mid-Level",
    pass_mark: row.pass_mark,
    duration_min: row.duration_min,
    mix: parseMix(row.questions),
    created_by: row.created_by,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function toDbPayload(input: Partial<TemplateInput>) {
  const mix = input.mix ?? DEFAULT_MIX;
  return {
    ...(input.title !== undefined ? { title: input.title } : {}),
    ...(input.description !== undefined ? { description: input.description } : {}),
    ...(input.role !== undefined ? { role: input.role } : {}),
    ...(input.difficulty !== undefined ? { difficulty: input.difficulty } : {}),
    ...(input.level !== undefined ? { level: input.level } : {}),
    ...(input.pass_mark !== undefined ? { pass_mark: input.pass_mark } : {}),
    ...(input.duration_min !== undefined ? { duration_min: input.duration_min } : {}),
    ...(input.mix !== undefined ? { questions: [mix] } : {}),
    updated_at: new Date().toISOString(),
  };
}

export const listTemplatesFn = createServerFn({ method: "GET" })
  .middleware([requireContentManager])
  .handler(async (): Promise<AssessmentTemplate[]> => {
    const pool = getPgPool();
    const { rows } = await pool.query<DbTemplateRow>(
      `SELECT * FROM assessment_templates ORDER BY updated_at DESC`,
    );
    return rows.map(toTemplate);
  });

const TemplateInputSchema = z.object({
  title: z.string().min(1),
  description: z.string(),
  role: z.string(),
  difficulty: z.enum(["Easy", "Intermediate", "Hard", "Mixed"]),
  level: z.string(),
  pass_mark: z.number(),
  duration_min: z.number(),
  mix: z.object({
    total_questions: z.number(),
    mcq_ratio: z.number(),
    essay_ratio: z.number(),
  }),
});

export const createTemplateFn = createServerFn({ method: "POST" })
  .middleware([requireContentManager])
  .inputValidator((data: unknown) => TemplateInputSchema.parse(data))
  .handler(async ({ data }): Promise<AssessmentTemplate> => {
    const pool = getPgPool();
    const payload = toDbPayload(data);
    const { rows } = await pool.query<DbTemplateRow>(
      `INSERT INTO assessment_templates (title, description, role, difficulty, level, pass_mark, duration_min, questions, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9)
       RETURNING *`,
      [
        payload.title,
        payload.description,
        payload.role,
        payload.difficulty,
        payload.level,
        payload.pass_mark,
        payload.duration_min,
        JSON.stringify((payload as { questions?: unknown }).questions ?? [DEFAULT_MIX]),
        payload.updated_at,
      ],
    );
    return toTemplate(rows[0]);
  });

export const updateTemplateFn = createServerFn({ method: "POST" })
  .middleware([requireContentManager])
  .inputValidator((data: unknown) =>
    z.object({ id: z.string().uuid(), patch: TemplateInputSchema.partial() }).parse(data),
  )
  .handler(async ({ data }) => {
    const pool = getPgPool();
    const payload = toDbPayload(data.patch);
    const sets: string[] = [];
    const vals: unknown[] = [];
    let i = 1;
    for (const [k, v] of Object.entries(payload)) {
      if (k === "questions") {
        sets.push(`questions = $${i}::jsonb`);
        vals.push(JSON.stringify(v));
      } else {
        sets.push(`${k} = $${i}`);
        vals.push(v);
      }
      i++;
    }
    vals.push(data.id);
    await pool.query(
      `UPDATE assessment_templates SET ${sets.join(", ")} WHERE id = $${i}`,
      vals,
    );
    return { ok: true as const };
  });

export const deleteTemplateFn = createServerFn({ method: "POST" })
  .middleware([requireContentManager])
  .inputValidator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data }) => {
    const pool = getPgPool();
    await pool.query(`DELETE FROM assessment_templates WHERE id = $1`, [data.id]);
    return { ok: true as const };
  });
