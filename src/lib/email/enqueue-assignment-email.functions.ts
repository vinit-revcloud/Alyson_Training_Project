import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireDbAuth } from "@/integrations/neon/auth-middleware";
import { requireAdminUserId } from "@/lib/auth-token.server";
import { enqueueAssignmentEmailInDb } from "@/lib/email/enqueue-assignment-email.server";
import {
  ASSIGNMENT_EMAIL_TYPES,
  type EnqueueAssignmentEmailResult,
} from "@/lib/email/enqueue-assignment-email.shared";

const PlaceholderSchema = z
  .object({
    learner_name: z.string().optional(),
    course_name: z.string().optional(),
    assignment_name: z.string().optional(),
    due_date: z.string().optional(),
    current_score: z.string().optional(),
    retake_link: z.string().optional(),
  })
  .optional();

const EnqueueAssignmentEmailSchema = z.object({
  user_id: z.string().uuid(),
  assignment_id: z.string().uuid(),
  email_type: z.enum(ASSIGNMENT_EMAIL_TYPES),
  placeholders: PlaceholderSchema,
});

export const enqueueAssignmentEmailFn = createServerFn({ method: "POST" })
  .middleware([requireDbAuth])
  .inputValidator((data: unknown) => EnqueueAssignmentEmailSchema.parse(data))
  .handler(async ({ data }): Promise<EnqueueAssignmentEmailResult> => {
    await requireAdminUserId();
    return enqueueAssignmentEmailInDb(data);
  });
