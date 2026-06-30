import type { Pool } from "pg";
import { z } from "zod";
import { deepseekChatCompletion } from "@/lib/ai/deepseek";
import { gatherSectionMaterialPg } from "@/lib/ai/section-material.server";
import { getPgPool } from "@/lib/pg.server";

const QuestionSchema = z.object({
  type: z.enum(["mcq", "subjective"]),
  topic: z.string(),
  difficulty: z.enum(["easy", "medium", "hard"]),
  prompt: z.string(),
  options: z.array(z.string()).optional(),
  correctAnswer: z.string().optional(),
  rubric: z.string().optional(),
});

/** Generate section quiz questions from uploaded knowledge base (Postgres + S3/local assets). */
export async function regenerateSectionQuestionsForSectionPg(
  pool: Pool,
  sectionId: string,
  difficulty: string,
  count = 8,
): Promise<number> {
  const secRes = await pool.query<{
    id: string;
    title: string;
    description: string;
    objectives: string;
  }>(
    `SELECT id, title, description, objectives FROM sections WHERE id = $1`,
    [sectionId],
  );
  const section = secRes.rows[0];
  if (!section) return 0;

  await pool.query(`UPDATE sections SET questions_status = 'regenerating' WHERE id = $1`, [
    sectionId,
  ]);

  try {
    const { materialText, fileNames } = await gatherSectionMaterialPg(section, { pool });

    const systemPrompt = `You write assessment questions for a single lesson section. Difficulty target: ${difficulty}. About 70% MCQs (4 options, one correct) and 30% subjective with a short rubric. Tag each with a clear topic. Base questions strictly on the provided material.`;
    const userPrompt = `Generate exactly ${count} questions for section "${section.title}".

FILES: ${fileNames.join(", ") || "(none)"}

MATERIAL:
${materialText.slice(0, 30_000)}

Return ONLY JSON: { "questions": [ { "type": "mcq"|"subjective", "topic": "...", "difficulty": "easy"|"medium"|"hard", "prompt": "...", "options": ["A","B","C","D"], "correctAnswer": "exact text", "rubric": "..." } ] }`;

    const content = await deepseekChatCompletion({
      system: systemPrompt,
      user: userPrompt,
      jsonMode: true,
    });

    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch {
      throw new Error("AI returned malformed JSON for section questions");
    }

    const rawList = Array.isArray((parsed as { questions?: unknown }).questions)
      ? (parsed as { questions: unknown[] }).questions
      : [];

    const rows: Array<{
      section_id: string;
      type: string;
      topic: string;
      difficulty: string;
      prompt: string;
      options: string[] | null;
      correct_answer: string | null;
      rubric: string | null;
      position: number;
    }> = [];

    rawList.forEach((q, i) => {
      const r = QuestionSchema.safeParse(q);
      if (!r.success) return;
      rows.push({
        section_id: sectionId,
        type: r.data.type,
        topic: r.data.topic,
        difficulty: r.data.difficulty,
        prompt: r.data.prompt,
        options: r.data.options ?? null,
        correct_answer: r.data.correctAnswer ?? null,
        rubric: r.data.rubric ?? null,
        position: i,
      });
    });

    await pool.query(`DELETE FROM section_questions WHERE section_id = $1`, [sectionId]);
    for (const row of rows) {
      await pool.query(
        `INSERT INTO section_questions (
          section_id, type, topic, difficulty, prompt, options, correct_answer, rubric, position
        ) VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9)`,
        [
          row.section_id,
          row.type,
          row.topic,
          row.difficulty,
          row.prompt,
          row.options ? JSON.stringify(row.options) : null,
          row.correct_answer,
          row.rubric,
          row.position,
        ],
      );
    }

    await pool.query(
      `UPDATE sections
       SET questions_status = $2, questions_updated_at = now()
       WHERE id = $1`,
      [sectionId, rows.length > 0 ? "ready" : "empty"],
    );

    return rows.length;
  } catch (err) {
    await pool.query(`UPDATE sections SET questions_status = 'error' WHERE id = $1`, [sectionId]);
    throw err;
  }
}

export async function regenerateSectionQuestionsPg(
  sectionId: string,
  difficulty: string,
  count: number,
): Promise<number> {
  return regenerateSectionQuestionsForSectionPg(getPgPool(), sectionId, difficulty, count);
}
