import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireContentManager } from "@/integrations/neon/auth-middleware";
import { assertAiRateLimit } from "@/lib/ai-rate-limit.server";
import { regenerateSectionQuestionsPg } from "@/lib/section-questions.server";

const InputSchema = z.object({
  sectionId: z.string().uuid(),
  count: z.number().int().min(3).max(20).default(8),
  difficulty: z.enum(["Beginner", "Intermediate", "Advanced"]).default("Beginner"),
});

export const regenerateSectionQuestions = createServerFn({ method: "POST" })
  .middleware([requireContentManager])
  .inputValidator((data: unknown) => InputSchema.parse(data))
  .handler(async ({ data, context }) => {
    assertAiRateLimit(context.userId);
    const count = await regenerateSectionQuestionsPg(
      data.sectionId,
      data.difficulty,
      data.count,
    );
    return { count };
  });
