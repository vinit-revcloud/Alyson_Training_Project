import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireContentManager } from "@/integrations/neon/auth-middleware";
import { LevelSchema, TestConfigSchema } from "@/lib/class-create.validation";
import { createClassRecordsInDb } from "@/lib/class-create.server";

const SectionInputSchema = z.object({
  title: z.string().min(1),
  description: z.string(),
  durationMin: z.number().int().min(1),
  objectives: z.string(),
  position: z.number().int().min(0),
  videoLink: z.string().optional(),
});

const CreateClassInputSchema = z.object({
  name: z.string().min(1),
  parentCourse: z.string().min(1),
  level: LevelSchema,
  audience: z.string(),
  summary: z.string(),
  topics: z.array(z.string()),
  sections: z.array(SectionInputSchema).min(1),
  test: TestConfigSchema.extend({ retest: z.boolean() }),
  status: z.enum(["draft", "in-review", "published"]),
});

export const createClassRecords = createServerFn({ method: "POST" })
  .middleware([requireContentManager])
  .inputValidator((data: unknown) => CreateClassInputSchema.parse(data))
  .handler(async ({ data, context }) => {
    return createClassRecordsInDb(data, context.userId);
  });
