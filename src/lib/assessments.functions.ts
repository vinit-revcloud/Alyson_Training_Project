import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireContentManager, requireDbAuth } from "@/integrations/neon/auth-middleware";
import {
  deleteAssessmentFromDb,
  duplicateAssessmentInDb,
  getAssessmentAttemptSummaryFromDb,
  getAssessmentFromDb,
  getClassAssessmentFromDb,
  listAllAssessmentsWithStatsFromDb,
  listAssessmentQuestionsFromDb,
  publishAssessmentInDb,
  saveClassAssessmentInDb,
  setAssessmentStatusInDb,
} from "@/lib/assessments.server";
import type {
  AssessmentQuestionRow,
  AssessmentRow,
  AssessmentStatus,
  AssessmentSummaryRow,
  AttemptSummary,
  SaveAssessmentInput,
} from "@/lib/assessments-api";
import type { Question } from "@/lib/test-types";

const AssessmentIdSchema = z.object({ assessmentId: z.string().uuid() });
const ClassIdSchema = z.object({ classId: z.string().uuid() });

const AssessmentStatusSchema = z.enum(["draft", "validated", "published", "archived"]);

const QuestionSchema = z.object({
  id: z.string().optional(),
  type: z.enum(["mcq", "subjective"]),
  topic: z.string(),
  difficulty: z.enum(["easy", "medium", "hard"]),
  prompt: z.string(),
  options: z.array(z.string()).optional(),
  correctAnswer: z.string().optional(),
  rubric: z.string().optional(),
});

const SaveAssessmentInputSchema = z.object({
  classId: z.string().uuid().optional(),
  title: z.string().min(1),
  description: z.string().optional(),
  role: z.string(),
  difficulty: z.string(),
  level: z.string(),
  passMark: z.number().int(),
  durationMin: z.number().int().optional(),
  status: AssessmentStatusSchema,
  questions: z.array(QuestionSchema),
  purpose: z.enum(["training", "interview"]).optional(),
});

export const getClassAssessmentFn = createServerFn({ method: "POST" })
  .middleware([requireDbAuth])
  .inputValidator((data: unknown) => ClassIdSchema.parse(data))
  .handler(async ({ data }): Promise<AssessmentRow | null> =>
    getClassAssessmentFromDb(data.classId),
  );

export const getAssessmentFn = createServerFn({ method: "POST" })
  .middleware([requireDbAuth])
  .inputValidator((data: unknown) => AssessmentIdSchema.parse(data))
  .handler(async ({ data }): Promise<AssessmentRow | null> =>
    getAssessmentFromDb(data.assessmentId),
  );

export const listAssessmentQuestionsFn = createServerFn({ method: "POST" })
  .middleware([requireDbAuth])
  .inputValidator((data: unknown) => AssessmentIdSchema.parse(data))
  .handler(async ({ data }): Promise<AssessmentQuestionRow[]> =>
    listAssessmentQuestionsFromDb(data.assessmentId),
  );

export const saveClassAssessmentFn = createServerFn({ method: "POST" })
  .middleware([requireContentManager])
  .inputValidator((data: unknown) => SaveAssessmentInputSchema.parse(data))
  .handler(async ({ data }): Promise<string> =>
    saveClassAssessmentInDb(data as SaveAssessmentInput & { questions: Question[] }),
  );

export const publishAssessmentFn = createServerFn({ method: "POST" })
  .middleware([requireContentManager])
  .inputValidator((data: unknown) => AssessmentIdSchema.parse(data))
  .handler(async ({ data }) => {
    await publishAssessmentInDb(data.assessmentId);
    return { ok: true as const };
  });

const SetAssessmentStatusSchema = z.object({
  assessmentId: z.string().uuid(),
  status: AssessmentStatusSchema,
});

export const setAssessmentStatusFn = createServerFn({ method: "POST" })
  .middleware([requireContentManager])
  .inputValidator((data: unknown) => SetAssessmentStatusSchema.parse(data))
  .handler(async ({ data }) => {
    await setAssessmentStatusInDb(data.assessmentId, data.status as AssessmentStatus);
    return { ok: true as const };
  });

export const deleteAssessmentFn = createServerFn({ method: "POST" })
  .middleware([requireContentManager])
  .inputValidator((data: unknown) => AssessmentIdSchema.parse(data))
  .handler(async ({ data }) => {
    await deleteAssessmentFromDb(data.assessmentId);
    return { ok: true as const };
  });

export const duplicateAssessmentFn = createServerFn({ method: "POST" })
  .middleware([requireContentManager])
  .inputValidator((data: unknown) => AssessmentIdSchema.parse(data))
  .handler(async ({ data }): Promise<string> => duplicateAssessmentInDb(data.assessmentId));

export const listAllAssessmentsWithStatsFn = createServerFn({ method: "GET" })
  .middleware([requireDbAuth])
  .handler(async (): Promise<AssessmentSummaryRow[]> => listAllAssessmentsWithStatsFromDb());

export const getAssessmentAttemptSummaryFn = createServerFn({ method: "POST" })
  .middleware([requireDbAuth])
  .inputValidator((data: unknown) => AssessmentIdSchema.parse(data))
  .handler(async ({ data }): Promise<AttemptSummary> =>
    getAssessmentAttemptSummaryFromDb(data.assessmentId),
  );
