import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireContentManager } from "@/integrations/neon/auth-middleware";
import { assertAiRateLimit } from "@/lib/ai-rate-limit.server";
import { deepseekChatCompletion } from "@/lib/ai/deepseek";
import { gatherClassMaterialPg } from "@/lib/ai/section-material.server";
import type { Question } from "./test-types";

const InputSchema = z.object({
  materialText: z.string().max(60000).optional().default(""),
  fileNames: z.array(z.string()).default([]),
  classId: z.string().uuid().optional(),
  level: z.enum(["Novice", "Mid-Level", "Expert"]),
  role: z.string().default("Data Scientist"),
  count: z.number().int().min(10).max(60).default(35),
  purpose: z.enum(["training", "interview"]).default("training"),
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

export const generateQuestions = createServerFn({ method: "POST" })
  .middleware([requireContentManager])
  .inputValidator((data: unknown) => InputSchema.parse(data))
  .handler(async ({ data, context }): Promise<{ questions: Question[] }> => {
    assertAiRateLimit(context.userId);
    const isInterview = data.purpose === "interview";

    let materialText = data.materialText?.trim() ?? "";
    let fileNames = data.fileNames ?? [];
    if (data.classId && materialText.length < 800) {
      const gathered = await gatherClassMaterialPg(data.classId);
      if (gathered.materialText.trim().length > materialText.length) {
        materialText = gathered.materialText;
        fileNames = [...new Set([...fileNames, ...gathered.fileNames])];
      }
    }

    const difficultyHint = isInterview
      ? "Interview-grade: minimum 70% medium or hard combined. No trivia. Prefer scenario-based, multi-step reasoning, debugging, system design, and applied problems."
      : data.level === "Novice"
        ? "Mostly easy (60%), some medium (35%), few hard (5%)."
        : data.level === "Mid-Level"
          ? "Balanced: easy 25%, medium 50%, hard 25%."
          : "Challenging: easy 10%, medium 40%, hard 50%.";

    const materialExcerpt =
      materialText.slice(0, 30000) ||
      (isInterview
        ? "(No material — use rigorous role-specific interview topics: architecture, trade-offs, debugging, code review, data/ML pipelines, product sense as appropriate.)"
        : "(No material uploaded — use general Data Science fundamentals: stats, ML, deep learning, Python, SQL, model evaluation, feature engineering.)");

    const mcqRatio = isInterview ? "About 40% MCQs" : "About 50% should be MCQs";
    const rubricRule = isInterview
      ? "Every subjective question MUST include a detailed rubric (scoring criteria)."
      : "For subjective include rubric.";

    const systemPrompt = isInterview
      ? `You are a senior hiring manager creating a rigorous technical interview for a ${data.role} at ${data.level}. ${difficultyHint} ${mcqRatio} (4 options, one correct) and 60% subjective open-ended. ${rubricRule} Questions must require deep understanding, not memorization.`
      : `You are an expert technical interviewer creating an assessment for a ${data.role} candidate at the ${data.level} level. ${difficultyHint} About 50% should be MCQs (4 options each, one correct) and 50% subjective (open-ended with a short grading rubric). Tag each question with a clear topic. Base questions on the provided study material. Be precise and unambiguous.`;

    const userPrompt = `Generate exactly ${data.count} assessment questions from this material.

FILES: ${fileNames.join(", ") || "none"}

MATERIAL:
${materialExcerpt}

Return ONLY a JSON object: { "questions": [ { "type": "mcq"|"subjective", "topic": "...", "difficulty": "easy"|"medium"|"hard", "prompt": "...", "options": ["A","B","C","D"], "correctAnswer": "exact text", "rubric": "..." } ] }
For MCQs include options (4) and correctAnswer (exact match to one option). For subjective include rubric.`;

    const content = await deepseekChatCompletion({
      system: systemPrompt,
      user: userPrompt,
      jsonMode: true,
    });

    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch {
      throw new Error("AI returned malformed JSON");
    }

    const root = parsed as { questions?: unknown };
    const rawList = Array.isArray(root.questions) ? root.questions : [];
    const questions: Question[] = [];
    for (let i = 0; i < rawList.length; i++) {
      const result = QuestionSchema.safeParse(rawList[i]);
      if (result.success) {
        if (isInterview && result.data.type === "subjective" && !result.data.rubric?.trim()) {
          continue;
        }
        questions.push({ id: `q-${Date.now()}-${i}`, ...result.data });
      }
    }
    if (questions.length === 0) throw new Error("AI returned no usable questions");

    if (isInterview) {
      const hardMedium = questions.filter(
        (q) => q.difficulty === "hard" || q.difficulty === "medium",
      ).length;
      if (hardMedium / questions.length < 0.7) {
        console.warn("[generate-questions] interview profile below 70% medium/hard");
      }
    }
    return { questions };
  });
