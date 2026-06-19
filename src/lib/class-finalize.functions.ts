import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { deepseekChatCompletion } from "@/lib/ai/deepseek";
import { gatherClassMaterial, gatherSectionMaterial } from "@/lib/ai/section-material.server";
import { requireContentManager } from "@/integrations/neon/auth-middleware";
import { dbAdmin } from "@/integrations/neon/client.server";
import type { DbAdminClient } from "@/integrations/neon/client-types";
import type { Question } from "@/lib/test-types";
import { TestConfigSchema } from "@/lib/class-create.validation";

type DbClient = DbAdminClient;

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

async function upsertCourseDepartment(
  supabase: DbClient,
  courseId: string,
  department: string,
): Promise<void> {
  const { data: existing } = await supabase
    .from("course_departments")
    .select("id")
    .eq("course_id", courseId)
    .eq("department", department)
    .maybeSingle();
  if (!existing) {
    const { error } = await supabase
      .from("course_departments")
      .insert({ course_id: courseId, department });
    if (error) throw error;
  }
}

async function regenerateSectionQuestionsForSection(
  supabase: DbClient,
  sectionId: string,
  difficulty: string,
  count = 8,
): Promise<number> {
  const { data: section, error: secErr } = await supabase
    .from("sections")
    .select("id, title, description, objectives")
    .eq("id", sectionId)
    .maybeSingle();
  if (secErr) throw secErr;
  if (!section) return 0;

  await supabase.from("sections").update({ questions_status: "regenerating" }).eq("id", sectionId);

  try {
    const { materialText, fileNames } = await gatherSectionMaterial(supabase, section);

    const systemPrompt = `You write assessment questions for a single lesson section. Difficulty target: ${difficulty}. About 70% MCQs (4 options, one correct) and 30% subjective with a short rubric. Base questions strictly on the provided material.`;
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

    await supabase.from("section_questions").delete().eq("section_id", sectionId);
    if (rows.length > 0) {
      const { error: insErr } = await supabase.from("section_questions").insert(rows);
      if (insErr) throw insErr;
    }

    await supabase
      .from("sections")
      .update({
        questions_status: rows.length > 0 ? "ready" : "empty",
        questions_updated_at: new Date().toISOString(),
      })
      .eq("id", sectionId);

    return rows.length;
  } catch (err) {
    await supabase.from("sections").update({ questions_status: "error" }).eq("id", sectionId);
    throw err;
  }
}

async function savePrimaryAssessment(
  supabase: DbClient,
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
  const { data: existing } = await supabase
    .from("assessments")
    .select("id")
    .eq("class_id", input.classId)
    .eq("is_primary", true)
    .maybeSingle();

  const payload = {
    class_id: input.classId,
    title: input.title,
    description: input.description,
    role: input.role,
    difficulty: input.difficulty,
    level: input.level,
    pass_mark: input.passMark,
    duration_min: 45,
    status: input.status,
    is_primary: true,
    source: "class_kb",
    validated_at: new Date().toISOString(),
    published_at: input.status === "published" ? new Date().toISOString() : null,
  };

  let assessmentId: string;
  if (existing?.id) {
    const { error } = await supabase.from("assessments").update(payload).eq("id", existing.id);
    if (error) throw error;
    assessmentId = existing.id;
    await supabase.from("assessment_questions").delete().eq("assessment_id", assessmentId);
  } else {
    const { data, error } = await supabase
      .from("assessments")
      .insert(payload)
      .select("id")
      .single();
    if (error) throw error;
    assessmentId = data.id;
  }

  if (input.questions.length > 0) {
    const rows = input.questions.map((q, i) => ({
      assessment_id: assessmentId,
      type: q.type,
      topic: q.topic,
      difficulty: q.difficulty,
      prompt: q.prompt,
      options: q.type === "mcq" ? q.options ?? null : null,
      correct_answer: q.type === "mcq" ? q.correctAnswer ?? null : null,
      rubric: q.type === "subjective" ? q.rubric ?? null : null,
      position: i,
    }));
    const { error } = await supabase.from("assessment_questions").insert(rows);
    if (error) throw error;
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
  const supabase = dbAdmin;
  const warnings: string[] = [];

  await upsertCourseDepartment(supabase, data.courseId, data.audience);

  const { data: sections } = await supabase
    .from("sections")
    .select("id")
    .eq("class_id", data.classId)
    .order("position", { ascending: true });

  let sectionQuestionCount = 0;
  if (data.generateSectionQuestions) {
    for (const sec of sections ?? []) {
      try {
        sectionQuestionCount += await regenerateSectionQuestionsForSection(
          supabase,
          sec.id,
          data.test.difficulty,
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[finalize] section questions failed for ${sec.id}:`, msg);
        warnings.push(`Section questions skipped for one lesson: ${msg}`);
        await supabase.from("sections").update({ questions_status: "error" }).eq("id", sec.id);
      }
    }
  }

  let assessmentId: string | null = null;
  let assessmentQuestionCount = 0;

  const shouldGenerateAssessment = data.generateAssessment || data.status === "published";

  if (shouldGenerateAssessment && (sections?.length ?? 0) > 0) {
    try {
      const { data: cls } = await supabase
        .from("classes")
        .select("name, summary")
        .eq("id", data.classId)
        .maybeSingle();

      const { materialText, fileNames } = await gatherClassMaterial(supabase, data.classId);
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
        assessmentId = await savePrimaryAssessment(supabase, {
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
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[finalize] final assessment failed:", msg);
      warnings.push(`Final assessment generation failed: ${msg}`);
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
