import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { deepseekChatCompletion } from "@/lib/ai/deepseek";
import { gatherSectionMaterial } from "@/lib/ai/section-material.server";
import { requireContentManager } from "@/integrations/neon/auth-middleware";
import { assertAiRateLimit } from "@/lib/ai-rate-limit.server";

const InputSchema = z.object({
  sectionId: z.string().uuid(),
  count: z.number().int().min(3).max(20).default(8),
  difficulty: z.enum(["Beginner", "Intermediate", "Advanced"]).default("Beginner"),
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

export const regenerateSectionQuestions = createServerFn({ method: "POST" })
  .middleware([requireContentManager])
  .inputValidator((data: unknown) => InputSchema.parse(data))
  .handler(async ({ data, context }) => {
    assertAiRateLimit(context.userId);
    const { supabase } = context;

    await supabase
      .from("sections")
      .update({ questions_status: "regenerating" })
      .eq("id", data.sectionId);

    try {
      const { data: section, error: secErr } = await supabase
        .from("sections")
        .select("id, title, description, objectives")
        .eq("id", data.sectionId)
        .maybeSingle();
      if (secErr) throw secErr;
      if (!section) throw new Error("Section not found");

      const { materialText, fileNames } = await gatherSectionMaterial(supabase, section);

      const systemPrompt = `You write assessment questions for a single lesson section. Difficulty target: ${data.difficulty}. About 70% MCQs (4 options, one correct) and 30% subjective with a short rubric. Tag each with a clear topic. Base questions strictly on the provided material.`;
      const userPrompt = `Generate exactly ${data.count} questions for section "${section.title}".

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
        throw new Error("AI returned malformed JSON");
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
          section_id: data.sectionId,
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

      await supabase.from("section_questions").delete().eq("section_id", data.sectionId);
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
        .eq("id", data.sectionId);

      return { count: rows.length };
    } catch (err) {
      await supabase
        .from("sections")
        .update({ questions_status: "error" })
        .eq("id", data.sectionId);
      throw err;
    }
  });
