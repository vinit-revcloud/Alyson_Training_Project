import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireContentManager, requireDbAuth, requireHiringRead } from "@/integrations/neon/auth-middleware";
import {
  convertPipelineToTraineeInDb,
  createPipelineInDb,
  createTrialProjectInDb,
  getPipelineDetailFromDb,
  listPipelinesFromDb,
  passPipelineStageInDb,
  recordCeoReviewInDb,
  rejectPipelineInDb,
  schedulePipelineInterviewInDb,
  sendCandidateInviteForPipelineInDb,
  getTrialProjectForUserInDb,
  submitTrialProjectInDb,
} from "./hiring-pipeline.server";
import { sendInterviewInviteEmail } from "@/lib/interview/interview-email.server";
import { getInterviewSessionByIdFromDb } from "@/lib/interview/interview.server";
import { INTERVIEW_ROUND_TYPES } from "./hiring-pipeline.shared";

export const listPipelinesFn = createServerFn({ method: "POST" })
  .middleware([requireHiringRead])
  .handler(async () => listPipelinesFromDb());

export const getPipelineDetailFn = createServerFn({ method: "POST" })
  .middleware([requireHiringRead])
  .inputValidator((d: unknown) => z.object({ pipelineId: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const detail = await getPipelineDetailFromDb(data.pipelineId);
    if (!detail) throw new Error("Pipeline not found");
    return detail;
  });

const CreatePipelineInput = z.object({
  candidateName: z.string().min(2).max(200),
  candidateEmail: z.string().email(),
  targetRole: z.string().min(1).max(120),
  targetDepartment: z.string().min(1).max(120),
});

export const createPipelineFn = createServerFn({ method: "POST" })
  .middleware([requireContentManager])
  .inputValidator((d: unknown) => CreatePipelineInput.parse(d))
  .handler(async ({ data, context }) =>
    createPipelineInDb({ ...data, createdBy: context.userId }),
  );

const ScheduleRoundInput = z
  .object({
    pipelineId: z.string().uuid(),
    assessmentId: z.string().uuid(),
    roundType: z.enum(INTERVIEW_ROUND_TYPES),
    scheduledAt: z.string().datetime(),
    expiresAt: z.string().datetime(),
    assessmentMode: z.enum(["online", "paper_only", "hybrid"]).optional(),
  })
  .refine((d) => new Date(d.expiresAt) > new Date(d.scheduledAt), {
    message: "Expiry must be after scheduled time.",
    path: ["expiresAt"],
  });

export const schedulePipelineRoundFn = createServerFn({ method: "POST" })
  .middleware([requireContentManager])
  .inputValidator((d: unknown) => ScheduleRoundInput.parse(d))
  .handler(async ({ data, context }) => {
    const { sessionId, rawToken } = await schedulePipelineInterviewInDb({
      ...data,
      createdBy: context.userId,
    });
    const detail = await getInterviewSessionByIdFromDb(sessionId);
    const { getServerConfig } = await import("@/lib/config.server");
    const appBase = getServerConfig().appBaseUrl.replace(/\/$/, "");
    const magicLink = `${appBase}/interview/${rawToken}`;

    if (data.assessmentMode !== "paper_only" && detail) {
      await sendInterviewInviteEmail({
        sessionId,
        rawToken,
        candidateEmail: detail.candidate_email,
        candidateName: detail.candidate_name,
        assessmentTitle: detail.assessment_title ?? "Interview assessment",
        scheduledAt: detail.scheduled_at,
        expiresAt: detail.expires_at,
      });
    }

    return { sessionId, magicLink };
  });

export const passPipelineStageFn = createServerFn({ method: "POST" })
  .middleware([requireContentManager])
  .inputValidator((d: unknown) =>
    z
      .object({
        pipelineId: z.string().uuid(),
        stage: z.enum([
          "tech_round_1",
          "tech_round_2",
          "trial_project",
          "bill_review",
          "ceo_interview",
          "onboarding",
          "completed",
        ]),
        notes: z.string().max(2000).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) =>
    passPipelineStageInDb({
      pipelineId: data.pipelineId,
      stage: data.stage,
      reviewerUserId: context.userId,
      notes: data.notes,
    }),
  );

export const createTrialProjectFn = createServerFn({ method: "POST" })
  .middleware([requireContentManager])
  .inputValidator((d: unknown) =>
    z
      .object({
        pipelineId: z.string().uuid(),
        title: z.string().min(2).max(200),
        brief: z.string().max(5000).optional(),
        teamContext: z.string().max(2000).optional(),
        estimatedHours: z.number().int().min(1).max(80).optional(),
        platformAccess: z.array(z.string()).optional(),
        dueAt: z.string().datetime().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => createTrialProjectInDb(data));

export const sendCandidateInviteFn = createServerFn({ method: "POST" })
  .middleware([requireContentManager])
  .inputValidator((d: unknown) => z.object({ pipelineId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) =>
    sendCandidateInviteForPipelineInDb({
      pipelineId: data.pipelineId,
      invitedBy: context.userId,
    }),
  );

export const recordCeoReviewFn = createServerFn({ method: "POST" })
  .middleware([requireContentManager])
  .inputValidator((d: unknown) =>
    z
      .object({
        pipelineId: z.string().uuid(),
        status: z.enum(["scheduled", "passed", "failed"]),
        notes: z.string().max(2000).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await recordCeoReviewInDb({
      ...data,
      reviewerUserId: context.userId,
    });
    return { ok: true as const };
  });

/** @deprecated Use recordCeoReviewFn */
export const recordBillReviewFn = recordCeoReviewFn;

export const convertToTraineeFn = createServerFn({ method: "POST" })
  .middleware([requireContentManager])
  .inputValidator((d: unknown) => z.object({ pipelineId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await convertPipelineToTraineeInDb({
      pipelineId: data.pipelineId,
      reviewerUserId: context.userId,
    });
    return { ok: true as const };
  });

export const rejectPipelineFn = createServerFn({ method: "POST" })
  .middleware([requireContentManager])
  .inputValidator((d: unknown) =>
    z
      .object({
        pipelineId: z.string().uuid(),
        notes: z.string().max(2000).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await rejectPipelineInDb({
      pipelineId: data.pipelineId,
      reviewerUserId: context.userId,
      notes: data.notes,
    });
    return { ok: true as const };
  });

export const getMyTrialProjectFn = createServerFn({ method: "POST" })
  .middleware([requireDbAuth])
  .handler(async ({ context }) => getTrialProjectForUserInDb(context.userId));

export const submitTrialProjectFn = createServerFn({ method: "POST" })
  .middleware([requireDbAuth])
  .inputValidator((d: unknown) =>
    z.object({ submissionNotes: z.string().min(10).max(5000) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await submitTrialProjectInDb({
      userId: context.userId,
      submissionNotes: data.submissionNotes,
    });
    return { ok: true as const };
  });
