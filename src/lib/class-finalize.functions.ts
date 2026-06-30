import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { Pool } from "pg";
import { deepseekChatCompletion } from "@/lib/ai/deepseek";
import { gatherClassMaterialPg } from "@/lib/ai/section-material.server";
import { regenerateSectionQuestionsForSectionPg } from "@/lib/section-questions.server";
import { requireContentManager } from "@/integrations/neon/auth-middleware";
import { getPgPool } from "@/lib/pg.server";
import { formatErrorMessage } from "@/lib/format-error";
import { autoAssignCourseToDepartmentInDb } from "@/lib/assignments.server";
import type { Question } from "@/lib/test-types";
import { TestConfigSchema } from "@/lib/class-create.validation";

export const FinalizeClassInputSchema = z.object({
  classId: z.string().uuid(),
  courseId: z.string().uuid(),
  audience: z.string().min(1),
  status: z.enum(["draft", "in-review", "published"]),
  test: TestConfigSchema,
  generateSectionQuestions: z.boolean().default(true),
  generateAssessment: z.boolean().default(false),
});

const QuestionSchema = z.object({
  type: z.enum(["mcq", "subjective"]),
  topic: z.string(),
  difficulty: z.enum(["easy", "medium", "hard"]),
  prompt: z.string(),
  options: z.array(z.string()).optional(),
  correctAnswer: z.string().optional(),
  rubric: z.string().optional(),
});

function levelFromDifficulty(d: string): "Novice" | "Mid-Level" | "Expert" {
  if (d === "Beginner") return "Novice";
  if (d === "Advanced") return "Expert";
  return "Mid-Level";
}

async function upsertCourseDepartmentPg(
  pool: Pool,
  courseId: string,
  department: string,
): Promise<void> {
  const trimmed = department.trim();
  if (!trimmed) return;
  await pool.query(
    `INSERT INTO course_departments (course_id, department)
     VALUES ($1, $2)
     ON CONFLICT (course_id, department) DO NOTHING`,
    [courseId, trimmed],
  );
}

async function savePrimaryAssessment(
  pool: Pool,
  input: {
    classId: string;
    title: string;
    description: string;
    role: string;
    difficulty: string;
    level: string;
    passMark: number;
    status: "validated" | "published";
    questions: Question[];
  },
): Promise<string> {
  const existing = await pool.query<{ id: string }>(
    `SELECT id FROM assessments WHERE class_id = $1 AND is_primary = true LIMIT 1`,
    [input.classId],
  );

  const validatedAt = new Date().toISOString();
  const publishedAt = input.status === "published" ? validatedAt : null;

  let assessmentId: string;
  if (existing.rows[0]?.id) {
    assessmentId = existing.rows[0].id;
    await pool.query(
      `UPDATE assessments SET
        title = $2, description = $3, role = $4, difficulty = $5, level = $6,
        pass_mark = $7, status = $8, source = 'class_kb', validated_at = $9,
        published_at = $10, updated_at = now()
       WHERE id = $1`,
      [
        assessmentId,
        input.title,
        input.description,
        input.role,
        input.difficulty,
        input.level,
        input.passMark,
        input.status,
        validatedAt,
        publishedAt,
      ],
    );
    await pool.query(`DELETE FROM assessment_questions WHERE assessment_id = $1`, [assessmentId]);
  } else {
    const ins = await pool.query<{ id: string }>(
      `INSERT INTO assessments (
        class_id, title, description, role, difficulty, level, pass_mark,
        duration_min, status, is_primary, source, validated_at, published_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,45,$8,true,'class_kb',$9,$10)
      RETURNING id`,
      [
        input.classId,
        input.title,
        input.description,
        input.role,
        input.difficulty,
        input.level,
        input.passMark,
        input.status,
        validatedAt,
        publishedAt,
      ],
    );
    assessmentId = ins.rows[0].id;
  }

  for (let i = 0; i < input.questions.length; i++) {
    const q = input.questions[i];
    await pool.query(
      `INSERT INTO assessment_questions (
        assessment_id, type, topic, difficulty, prompt, options, correct_answer, rubric, position
      ) VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9)`,
      [
        assessmentId,
        q.type,
        q.topic,
        q.difficulty,
        q.prompt,
        q.type === "mcq" ? JSON.stringify(q.options ?? []) : null,
        q.type === "mcq" ? q.correctAnswer ?? null : null,
        q.type === "subjective" ? q.rubric ?? null : null,
        i,
      ],
    );
  }

  return assessmentId;
}

async function generateFinalAssessmentQuestions(
  materialText: string,
  fileNames: string[],
  role: string,
  level: "Novice" | "Mid-Level" | "Expert",
  totalCount: number,
): Promise<Question[]> {
  const difficultyHint =
    level === "Novice"
      ? "Mostly easy (60%), some medium (35%), few hard (5%)."
      : level === "Expert"
        ? "Challenging: easy 10%, medium 40%, hard 50%."
        : "Balanced: easy 25%, medium 50%, hard 25%.";

  const systemPrompt = `You are an expert technical interviewer creating a final class assessment for a ${role} candidate at the ${level} level. ${difficultyHint} About 50% MCQs (4 options, one correct) and 50% subjective. Base questions on the study material.`;

  const batchSize = 12;
  const questions: Question[] = [];

  for (let offset = 0; offset < totalCount; offset += batchSize) {
    const count = Math.min(batchSize, totalCount - offset);
    const userPrompt = `Generate exactly ${count} final assessment questions (batch ${Math.floor(offset / batchSize) + 1}).

FILES: ${fileNames.join(", ") || "none"}

MATERIAL:
${materialText.slice(0, 30_000)}

Return ONLY JSON: { "questions": [ { "type": "mcq"|"subjective", "topic": "...", "difficulty": "easy"|"medium"|"hard", "prompt": "...", "options": ["A","B","C","D"], "correctAnswer": "exact text", "rubric": "..." } ] }`;

    const content = await deepseekChatCompletion({
      system: systemPrompt,
      user: userPrompt,
      jsonMode: true,
      maxTokens: 4096,
    });

    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch {
      console.warn("[finalize] malformed JSON in assessment batch, skipping batch");
      continue;
    }

    const rawList = Array.isArray((parsed as { questions?: unknown }).questions)
      ? (parsed as { questions: unknown[] }).questions
      : [];

    rawList.forEach((q, i) => {
      const r = QuestionSchema.safeParse(q);
      if (r.success) {
        questions.push({ id: `q-${Date.now()}-${offset + i}`, ...r.data });
      }
    });
  }

  if (questions.length === 0) {
    console.warn("[finalize] AI returned no usable final assessment questions");
  }
  return questions.slice(0, totalCount);
}

export type FinalizeClassInput = z.infer<typeof FinalizeClassInputSchema>;

export type FinalizeClassResult = {
  courseDepartment: string;
  sectionQuestionCount: number;
  assessmentId: string | null;
  assessmentQuestionCount: number;
  warnings: string[];
};

export async function runFinalizeClassCreation(
  data: FinalizeClassInput,
): Promise<FinalizeClassResult> {
  const pool = getPgPool();
  const warnings: string[] = [];

  try {
    await upsertCourseDepartmentPg(pool, data.courseId, data.audience);
  } catch (err) {
    warnings.push(`Course department tag skipped: ${formatErrorMessage(err)}`);
  }

  const sectionsRes = await pool.query<{ id: string }>(
    `SELECT id FROM sections WHERE class_id = $1 ORDER BY position ASC`,
    [data.classId],
  );
  const sections = sectionsRes.rows;

  let sectionQuestionCount = 0;
  if (data.generateSectionQuestions) {
    for (const sec of sections) {
      try {
        sectionQuestionCount += await regenerateSectionQuestionsForSectionPg(
          pool,
          sec.id,
          data.test.difficulty,
        );
      } catch (err) {
        const msg = formatErrorMessage(err);
        console.error(`[finalize] section questions failed for ${sec.id}:`, msg);
        warnings.push(`Section questions skipped for one lesson: ${msg}`);
        await pool
          .query(`UPDATE sections SET questions_status = 'error' WHERE id = $1`, [sec.id])
          .catch(() => undefined);
      }
    }
  }

  let assessmentId: string | null = null;
  let assessmentQuestionCount = 0;

  const shouldGenerateAssessment = data.generateAssessment || data.status === "published";

  if (shouldGenerateAssessment && sections.length > 0) {
    try {
      const clsRes = await pool.query<{ name: string; summary: string | null }>(
        `SELECT name, summary FROM classes WHERE id = $1`,
        [data.classId],
      );
      const cls = clsRes.rows[0];

      const { materialText, fileNames } = await gatherClassMaterialPg(data.classId, pool);
      const totalCount = Math.min(60, Math.max(5, data.test.mcqCount + data.test.subjectiveCount));
      const level = levelFromDifficulty(data.test.difficulty);
      const questions = await generateFinalAssessmentQuestions(
        materialText,
        fileNames,
        data.audience,
        level,
        totalCount,
      );
      assessmentQuestionCount = questions.length;

      if (questions.length > 0) {
        const assessmentStatus = data.status === "published" ? "published" : "validated";
        assessmentId = await savePrimaryAssessment(pool, {
          classId: data.classId,
          title: `${cls?.name ?? "Class"} — Final Assessment`,
          description: cls?.summary ?? "",
          role: data.audience,
          difficulty: data.test.difficulty,
          level,
          passMark: data.test.passMark,
          status: assessmentStatus,
          questions,
        });
      } else {
        warnings.push("Final assessment was not generated — add questions manually in Assessments.");
      }
    } catch (err) {
      const msg = formatErrorMessage(err);
      console.error("[finalize] final assessment failed:", msg);
      warnings.push(`Final assessment generation failed: ${msg}`);
    }
  }

  if (data.status === "published" && data.audience.trim()) {
    try {
      const assignResult = await autoAssignCourseToDepartmentInDb(
        data.courseId,
        data.audience.trim(),
      );
      if (assignResult.assignmentsCreated > 0) {
        console.info(
          `[finalize] auto-assigned ${assignResult.assignmentsCreated} assessment(s) to ${assignResult.usersTouched} trainee(s)`,
        );
      } else if (assignResult.usersTouched === 0) {
        warnings.push(
          `No trainees with department "${data.audience}" — set department on user profiles or use Assignments to assign manually.`,
        );
      }
    } catch (err) {
      warnings.push(`Assessment auto-assign skipped: ${formatErrorMessage(err)}`);
    }
  }

  return {
    courseDepartment: data.audience,
    sectionQuestionCount,
    assessmentId,
    assessmentQuestionCount,
    warnings,
  };
}

export const finalizeClassCreation = createServerFn({ method: "POST" })
  .middleware([requireContentManager])
  .inputValidator((data: unknown) => FinalizeClassInputSchema.parse(data))
  .handler(async ({ data }) => runFinalizeClassCreation(data));
