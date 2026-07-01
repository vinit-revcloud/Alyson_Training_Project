import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireDbAuth } from "@/integrations/neon/auth-middleware";
import {
  expireAssignmentInDb,
  getActiveAttemptFromDb,
  getAttemptQuestionsFromDb,
  getLearnerAssessmentMetadataFromDb,
  getLearnerAssignmentFromDb,
  gradeAndSubmitAttemptInDb,
  saveDraftAnswersInDb,
  startAttemptInDb,
} from "@/lib/attempt.server";

export type { LearnerQuestion } from "@/lib/attempt.shared";

const AssignmentIdInput = z.object({ assignmentId: z.string().uuid() });

export const getAttemptQuestions = createServerFn({ method: "POST" })
  .middleware([requireDbAuth])
  .inputValidator((d: unknown) => AssignmentIdInput.parse(d))
  .handler(async ({ data, context }) => {
    return getAttemptQuestionsFromDb(data.assignmentId, context.userId);
  });

const GradeInput = z.object({
  assignmentId: z.string().uuid(),
  attemptId: z.string().uuid(),
  answers: z.record(z.string().uuid(), z.string().max(20000)),
});

const DraftInput = z.object({
  assignmentId: z.string().uuid(),
  attemptId: z.string().uuid(),
  answers: z.record(z.string().uuid(), z.string().max(20000)),
});

export const saveDraftAnswersFn = createServerFn({ method: "POST" })
  .middleware([requireDbAuth])
  .inputValidator((d: unknown) => DraftInput.parse(d))
  .handler(async ({ data, context }) => {
    await saveDraftAnswersInDb({
      assignmentId: data.assignmentId,
      attemptId: data.attemptId,
      userId: context.userId,
      answers: data.answers,
    });
    return { ok: true as const };
  });

export const gradeAndSubmitAttempt = createServerFn({ method: "POST" })
  .middleware([requireDbAuth])
  .inputValidator((d: unknown) => GradeInput.parse(d))
  .handler(async ({ data, context }) => {
    const result = await gradeAndSubmitAttemptInDb({
      assignmentId: data.assignmentId,
      attemptId: data.attemptId,
      userId: context.userId,
      answers: data.answers,
    });

    try {
      const { onTestCompleted, onFailureRetake } = await import(
        "@/lib/email/triggers.functions"
      );
      await onTestCompleted({ data: { assignmentId: data.assignmentId } });
      if (!result.passed) {
        await onFailureRetake({ data: { assignmentId: data.assignmentId } });
      }
    } catch (e) {
      console.warn("post-submit email dispatch failed", e);
    }

    return result;
  });

export const startAttempt = createServerFn({ method: "POST" })
  .middleware([requireDbAuth])
  .inputValidator((d: unknown) => AssignmentIdInput.parse(d))
  .handler(async ({ data, context }) => {
    return startAttemptInDb(data.assignmentId, context.userId);
  });

export const expireAssignment = createServerFn({ method: "POST" })
  .middleware([requireDbAuth])
  .inputValidator((d: unknown) => AssignmentIdInput.parse(d))
  .handler(async ({ data, context }) => {
    return expireAssignmentInDb(data.assignmentId, context.userId);
  });

export const getLearnerAssignmentFn = createServerFn({ method: "POST" })
  .middleware([requireDbAuth])
  .inputValidator((d: unknown) => AssignmentIdInput.parse(d))
  .handler(async ({ data, context }) => {
    return getLearnerAssignmentFromDb(data.assignmentId, context.userId);
  });

export const getLearnerAssessmentMetadataFn = createServerFn({ method: "POST" })
  .middleware([requireDbAuth])
  .inputValidator((d: unknown) => AssignmentIdInput.parse(d))
  .handler(async ({ data, context }) => {
    return getLearnerAssessmentMetadataFromDb(data.assignmentId, context.userId);
  });

export const getActiveAttemptFn = createServerFn({ method: "POST" })
  .middleware([requireDbAuth])
  .inputValidator((d: unknown) => AssignmentIdInput.parse(d))
  .handler(async ({ data, context }) => {
    return getActiveAttemptFromDb(data.assignmentId, context.userId);
  });
