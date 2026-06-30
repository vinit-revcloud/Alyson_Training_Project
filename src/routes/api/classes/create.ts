import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { assertContentManager } from "@/lib/content-manager.server";
import { createClassRecordsInDb } from "@/lib/class-create.server";
import { LevelSchema, TestConfigSchema } from "@/lib/class-create.validation";
import { userFromRequest } from "@/lib/auth-token.server";

const SectionInputSchema = z.object({
  title: z.string().min(1),
  description: z.string(),
  durationMin: z.number().int().min(1),
  objectives: z.string(),
  position: z.number().int().min(0),
  videoLink: z.string().optional(),
});

/** parentCourse is the course title (find-or-create), not a UUID — matches class-create.functions.ts */
const CreateClassBodySchema = z.object({
  name: z.string().min(1).max(200),
  parentCourse: z.string().min(1).max(200),
  level: LevelSchema,
  audience: z.string(),
  summary: z.string(),
  topics: z.array(z.string()),
  sections: z.array(SectionInputSchema).min(1),
  test: TestConfigSchema.extend({ retest: z.boolean() }),
  status: z.enum(["draft", "in-review", "published"]),
});

export const Route = createFileRoute("/api/classes/create")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const authUser = await userFromRequest(request);
          await assertContentManager(authUser.id);
          const body = CreateClassBodySchema.parse(await request.json());
          const result = await createClassRecordsInDb(body, authUser.id);
          return Response.json(result);
        } catch (err) {
          if (err instanceof z.ZodError) {
            const detail = err.issues[0]?.message ?? "validation failed";
            return Response.json({ error: "Invalid request body", details: detail }, { status: 400 });
          }
          const message = err instanceof Error ? err.message : "Create class failed";
          const status = message.includes("Unauthorized")
            ? 401
            : message.includes("Not authorized") || message.includes("Forbidden")
              ? 403
              : message.includes("parse") || message.includes("Required")
                ? 400
                : 500;
          return Response.json({ error: message }, { status });
        }
      },
    },
  },
});
