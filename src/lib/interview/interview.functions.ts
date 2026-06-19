import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireContentManager } from "@/integrations/neon/auth-middleware";
import {
  assertSessionStatus,
  loadSessionByToken,
} from "./interview-token.server";
import {
  appendInterviewEvent,
  addPaperUploadInDb,
  cancelInterviewSessionInDb,
  deleteInterviewSessionInDb,
  confirmInterviewIdentityInDb,
  createInterviewSessionInDb,
  getGradingQuestionsForSession,
  getInterviewQuestionsFromDb,
  getInterviewSessionByIdFromDb,
  getInterviewSubmissionRecordFromDb,
  getPublicInterviewState,
  listInterviewAssessmentsFromDb,
  listInterviewSessionsFromDb,
  alignSavedAnswersForSession,
  buildInterviewAnswerKeyAliases,
  loadInterviewDraftAnswersFromDb,
  normalizeInterviewAnswerKeys,
  openInterviewSessionInDb,
  regenerateInterviewTokenInDb,
  removePaperUploadInDb,
  refreshSessionAssessmentVersionInDb,
  saveHrOverrideInDb,
  saveInterviewDraftAnswersInDb,
  startInterviewAttemptInDb,
  updateInPersonFlowInDb,
  updateProctorNotesInDb,
  validateInterviewAssessmentForSchedule,
} from "./interview.server";
import { evaluateInterviewSession } from "./ai-evaluate.server";
import { ensureInterviewProfileReport } from "./profile-evaluate.server";
import { gradePaperAssessment } from "./paper-grade.server";
import {
  notifyInterviewEvaluated,
  notifyInterviewSubmitted,
  sendInterviewInviteEmail,
} from "./interview-email.server";
import { getPgPool } from "@/lib/pg.server";

const TokenInput = z.object({ token: z.string().min(16).max(128) });
const SessionIdInput = z.object({ sessionId: z.string().uuid() });

const CreateInput = z
  .object({
    assessmentId: z.string().uuid(),
    candidateName: z.string().min(2).max(200),
    candidateEmail: z.string().email(),
    role: z.string().min(1).max(120),
    level: z.string().min(1).max(80),
    scheduledAt: z.string().datetime(),
    expiresAt: z.string().datetime(),
    assessmentMode: z.enum(["online", "paper_only", "hybrid"]).optional().default("online"),
  })
  .refine((d) => new Date(d.expiresAt) > new Date(d.scheduledAt), {
    message: "Expiry must be after the scheduled time.",
    path: ["expiresAt"],
  })
  .refine((d) => new Date(d.expiresAt) > new Date(), {
    message: "Expiry must be in the future.",
    path: ["expiresAt"],
  });

const ConfirmInput = z.object({
  token: z.string().min(16).max(128),
  name: z.string().min(2).max(200),
  email: z.string().email(),
});

const SubmitInput = z.object({
  token: z.string().min(16).max(128),
  answers: z.record(z.string().uuid(), z.string().max(20000)),
});

const EventInput = z.object({
  token: z.string().min(16).max(128),
  type: z.string().max(80),
  detail: z.string().max(500).optional(),
});

export const createInterviewSessionFn = createServerFn({ method: "POST" })
  .middleware([requireContentManager])
  .inputValidator((d: unknown) => CreateInput.parse(d))
  .handler(async ({ data, context }) => {
    await validateInterviewAssessmentForSchedule(data.assessmentId);

    const { session, rawToken } = await createInterviewSessionInDb({
      assessmentId: data.assessmentId,
      candidateName: data.candidateName,
      candidateEmail: data.candidateEmail,
      role: data.role,
      level: data.level,
      scheduledAt: data.scheduledAt,
      expiresAt: data.expiresAt,
      createdBy: context.userId,
      assessmentMode: data.assessmentMode,
    });

    const detail = await getInterviewSessionByIdFromDb(session.id);
    const appBase = (await import("@/lib/config.server")).getServerConfig().appBaseUrl.replace(
      /\/$/,
      "",
    );
    const magicLink = `${appBase}/interview/${rawToken}`;

    let emailSent = false;
    let emailError: string | undefined;
    if (data.assessmentMode !== "paper_only") {
      const emailResult = await sendInterviewInviteEmail({
        sessionId: session.id,
        rawToken,
        candidateEmail: session.candidate_email,
        candidateName: session.candidate_name,
        assessmentTitle: detail?.assessment_title ?? "Interview assessment",
        role: session.role,
        scheduledAt:
          session.scheduled_at instanceof Date
            ? session.scheduled_at.toISOString()
            : String(session.scheduled_at),
      });
      emailSent = emailResult.ok;
      emailError = emailResult.error;
    }

    return {
      sessionId: session.id,
      magicLink: data.assessmentMode === "paper_only" ? null : magicLink,
      emailSent,
      emailError,
      assessmentMode: data.assessmentMode,
    };
  });

export const listInterviewSessionsFn = createServerFn({ method: "GET" })
  .middleware([requireContentManager])
  .handler(async () => listInterviewSessionsFromDb());

export const listInterviewAssessmentsFn = createServerFn({ method: "GET" })
  .middleware([requireContentManager])
  .handler(async () => listInterviewAssessmentsFromDb());

export const getInterviewSessionDetailFn = createServerFn({ method: "POST" })
  .middleware([requireContentManager])
  .inputValidator((d: unknown) => SessionIdInput.parse(d))
  .handler(async ({ data }) => {
    const session = await getInterviewSessionByIdFromDb(data.sessionId);
    if (!session) throw new Error("Session not found.");
    return session;
  });

/** Generate or backfill the structured 7-dimension candidate profile (LLM — do not call on page load). */
export const generateInterviewProfileFn = createServerFn({ method: "POST" })
  .middleware([requireContentManager])
  .inputValidator((d: unknown) => SessionIdInput.parse(d))
  .handler(async ({ data }) => {
    const evaluation = await ensureInterviewProfileReport(data.sessionId);
    if (!evaluation) {
      throw new Error(
        "Cannot generate profile — the session needs a completed AI evaluation first. Run evaluation, then try again.",
      );
    }
    return evaluation;
  });

export const getInterviewSubmissionRecordFn = createServerFn({ method: "POST" })
  .middleware([requireContentManager])
  .inputValidator((d: unknown) => SessionIdInput.parse(d))
  .handler(async ({ data }) => {
    const session = await getInterviewSessionByIdFromDb(data.sessionId);
    if (!session) throw new Error("Session not found.");
    const answers = await getInterviewSubmissionRecordFromDb(data.sessionId);
    return { session, answers };
  });

export const openInterviewSessionFn = createServerFn({ method: "POST" })
  .middleware([requireContentManager])
  .inputValidator((d: unknown) => SessionIdInput.parse(d))
  .handler(async ({ data, context }) => {
    return openInterviewSessionInDb(data.sessionId, context.userId);
  });

export const resendInterviewInviteFn = createServerFn({ method: "POST" })
  .middleware([requireContentManager])
  .inputValidator((d: unknown) => SessionIdInput.parse(d))
  .handler(async ({ data }) => {
    const session = await getInterviewSessionByIdFromDb(data.sessionId);
    if (!session) throw new Error("Session not found.");
    const rawToken = await regenerateInterviewTokenInDb(data.sessionId);
    const base = (await import("@/lib/config.server")).getServerConfig().appBaseUrl.replace(/\/$/, "");
    const emailResult = await sendInterviewInviteEmail({
      sessionId: session.id,
      rawToken,
      candidateEmail: session.candidate_email,
      candidateName: session.candidate_name,
      assessmentTitle: session.assessment_title,
      role: session.role,
      scheduledAt:
        session.scheduled_at instanceof Date
          ? session.scheduled_at.toISOString()
          : String(session.scheduled_at),
    });
    return {
      magicLink: `${base}/interview/${rawToken}`,
      emailSent: emailResult.ok,
      emailError: emailResult.error,
    };
  });

export const cancelInterviewSessionFn = createServerFn({ method: "POST" })
  .middleware([requireContentManager])
  .inputValidator((d: unknown) => SessionIdInput.parse(d))
  .handler(async ({ data }) => {
    await cancelInterviewSessionInDb(data.sessionId);
    return { cancelled: true };
  });

export const deleteInterviewSessionFn = createServerFn({ method: "POST" })
  .middleware([requireContentManager])
  .inputValidator((d: unknown) => SessionIdInput.parse(d))
  .handler(async ({ data }) => {
    await deleteInterviewSessionInDb(data.sessionId);
    return { deleted: true };
  });

export const updateInterviewProctorNotesFn = createServerFn({ method: "POST" })
  .middleware([requireContentManager])
  .inputValidator((d: unknown) =>
    SessionIdInput.extend({ notes: z.string().max(10000) }).parse(d),
  )
  .handler(async ({ data }) => {
    await updateProctorNotesInDb(data.sessionId, data.notes);
    return { ok: true };
  });

export const appendInterviewHrNoteFn = createServerFn({ method: "POST" })
  .middleware([requireContentManager])
  .inputValidator((d: unknown) =>
    SessionIdInput.extend({ body: z.string().min(1).max(5000) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { appendHrNote } = await import("./interview-audit.server");
    const { rows } = await getPgPool().query<{ email: string | null }>(
      `SELECT email FROM profiles WHERE user_id = $1`,
      [context.userId],
    );
    return appendHrNote({
      sessionId: data.sessionId,
      authorId: context.userId,
      authorEmail: rows[0]?.email ?? "hr",
      body: data.body,
    });
  });

export const flagInterviewQuestionFn = createServerFn({ method: "POST" })
  .middleware([requireContentManager])
  .inputValidator((d: unknown) =>
    SessionIdInput.extend({
      questionId: z.string().uuid(),
      reason: z.string().min(3).max(2000),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { flagInterviewQuestion } = await import("./interview-audit.server");
    return flagInterviewQuestion({
      sessionId: data.sessionId,
      questionId: data.questionId,
      reason: data.reason,
      flaggedBy: context.userId,
    });
  });

export const addInterviewSupportingScoreFn = createServerFn({ method: "POST" })
  .middleware([requireContentManager])
  .inputValidator((d: unknown) =>
    SessionIdInput.extend({
      scoreType: z.enum(["paper_test", "in_person", "verbal_interview", "other"]),
      label: z.string().min(1).max(200),
      score: z.number().min(0).max(100).nullable(),
      weightPct: z.number().min(0).max(100).nullable().optional(),
      notes: z.string().max(2000).nullable().optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { addSupportingScore } = await import("./interview-audit.server");
    return addSupportingScore({
      sessionId: data.sessionId,
      scoreType: data.scoreType,
      label: data.label,
      score: data.score,
      weightPct: data.weightPct ?? null,
      notes: data.notes ?? null,
      createdBy: context.userId,
    });
  });

export const getInterviewAuditBundleFn = createServerFn({ method: "POST" })
  .middleware([requireContentManager])
  .inputValidator((d: unknown) => SessionIdInput.parse(d))
  .handler(async ({ data }) => {
    const { listEvaluationRuns } = await import("./evaluation-audit.server");
    const { listHrNotes, listQuestionFlags, listSupportingScores } = await import(
      "./interview-audit.server"
    );
    const [runs, notes, flags, supporting] = await Promise.all([
      listEvaluationRuns(data.sessionId),
      listHrNotes(data.sessionId),
      listQuestionFlags(data.sessionId),
      listSupportingScores(data.sessionId),
    ]);
    return { runs, notes, flags, supporting };
  });

export const refreshInterviewAssessmentVersionFn = createServerFn({ method: "POST" })
  .middleware([requireContentManager])
  .inputValidator((d: unknown) => SessionIdInput.parse(d))
  .handler(async ({ data, context }) => {
    await refreshSessionAssessmentVersionInDb(data.sessionId, context.userId);
    return { ok: true };
  });

export const rerunInterviewEvaluationFn = createServerFn({ method: "POST" })
  .middleware([requireContentManager])
  .inputValidator((d: unknown) => SessionIdInput.parse(d))
  .handler(async ({ data, context }) => {
    const evaluation = await evaluateInterviewSession(data.sessionId, {
      force: true,
      triggeredBy: context.userId,
    });
    await notifyInterviewEvaluated(data.sessionId);
    return evaluation;
  });

const InPersonStageInput = z.object({
  id: z.string(),
  label: z.string(),
  description: z.string(),
  status: z.enum(["pending", "in_progress", "completed", "skipped"]),
  notes: z.string().max(5000),
  score: z.number().min(0).max(5).nullable(),
  completed_at: z.string().nullable(),
});

export const updateInPersonFlowFn = createServerFn({ method: "POST" })
  .middleware([requireContentManager])
  .inputValidator((d: unknown) =>
    SessionIdInput.extend({
      stages: z.array(InPersonStageInput),
    }).parse(d),
  )
  .handler(async ({ data }) => {
    await updateInPersonFlowInDb(data.sessionId, { stages: data.stages });
    return { ok: true };
  });

export const registerPaperUploadFn = createServerFn({ method: "POST" })
  .middleware([requireContentManager])
  .inputValidator((d: unknown) =>
    SessionIdInput.extend({
      storagePath: z.string().min(3).max(500),
      filename: z.string().min(1).max(255),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const upload = {
      id: crypto.randomUUID(),
      storage_path: data.storagePath,
      filename: data.filename,
      uploaded_at: new Date().toISOString(),
      uploaded_by: context.userId,
    };
    const paper = await addPaperUploadInDb(data.sessionId, upload);
    return paper;
  });

export const removePaperUploadFn = createServerFn({ method: "POST" })
  .middleware([requireContentManager])
  .inputValidator((d: unknown) =>
    SessionIdInput.extend({ uploadId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data }) => {
    await removePaperUploadInDb(data.sessionId, data.uploadId);
    return { ok: true };
  });

export const gradePaperAssessmentFn = createServerFn({ method: "POST" })
  .middleware([requireContentManager])
  .inputValidator((d: unknown) => SessionIdInput.parse(d))
  .handler(async ({ data, context }) => {
    const paper = await gradePaperAssessment(data.sessionId);
    const detail = await getInterviewSessionByIdFromDb(data.sessionId);
    const mode = detail?.assessment_mode ?? "online";

    try {
      if (mode === "paper_only") {
        const { evaluatePaperOnlySession } = await import("./paper-only-evaluate.server");
        await evaluatePaperOnlySession(data.sessionId, {
          triggeredBy: context.userId,
          paperAssessment: paper,
        });
        await notifyInterviewEvaluated(data.sessionId);
      } else {
        await evaluateInterviewSession(data.sessionId, {
          force: true,
          triggeredBy: context.userId,
        });
        await notifyInterviewEvaluated(data.sessionId);
      }
    } catch (e) {
      console.warn("[interview] re-eval after paper grade failed", e);
      if (mode === "paper_only") throw e;
    }
    return paper;
  });

/** Public — poll waiting room / test state */
export const getInterviewSessionByTokenFn = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => TokenInput.parse(d))
  .handler(async ({ data }) => {
    const session = await loadSessionByToken(data.token);
    if (!session) throw new Error("Invalid or expired interview link.");
    return getPublicInterviewState(session);
  });

export const confirmInterviewIdentityFn = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => ConfirmInput.parse(d))
  .handler(async ({ data }) => {
    const session = await loadSessionByToken(data.token);
    if (!session) throw new Error("Invalid or expired interview link.");
    await confirmInterviewIdentityInDb(session.id, data.name, data.email);
    const updated = await loadSessionByToken(data.token);
    if (!updated) throw new Error("Session not found.");
    return getPublicInterviewState(updated);
  });

export const startInterviewAttemptFn = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => TokenInput.parse(d))
  .handler(async ({ data }) => {
    const session = await loadSessionByToken(data.token);
    if (!session) throw new Error("Invalid or expired interview link.");
    assertSessionStatus(session, ["opened", "in_progress"]);
    const attemptId = await startInterviewAttemptInDb(session);
    const updated = await loadSessionByToken(data.token);
    if (!updated) throw new Error("Session not found.");
    return { attemptId, state: await getPublicInterviewState(updated) };
  });

export const getInterviewQuestionsFn = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => TokenInput.parse(d))
  .handler(async ({ data }) => {
    const session = await loadSessionByToken(data.token);
    if (!session) throw new Error("Invalid or expired interview link.");
    assertSessionStatus(session, ["in_progress"]);
    const questions = await getInterviewQuestionsFromDb(session.id);
    const rawSaved = session.attempt_id
      ? await loadInterviewDraftAnswersFromDb(session.attempt_id)
      : {};
    const [savedAnswers, answerKeyAliases] = await Promise.all([
      alignSavedAnswersForSession(session.id, rawSaved),
      buildInterviewAnswerKeyAliases(session.id),
    ]);
    return { questions, savedAnswers, answerKeyAliases };
  });

const DraftAnswersInput = z.object({
  token: z.string().min(16).max(128),
  answers: z.record(z.string().uuid(), z.string().max(20000)),
});

export const saveInterviewDraftAnswersFn = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => DraftAnswersInput.parse(d))
  .handler(async ({ data }) => {
    const session = await loadSessionByToken(data.token);
    if (!session) throw new Error("Invalid or expired interview link.");
    assertSessionStatus(session, ["in_progress"]);
    if (!session.attempt_id) throw new Error("No active attempt.");
    const answers = await normalizeInterviewAnswerKeys(session.id, data.answers);
    await saveInterviewDraftAnswersInDb(session.attempt_id, answers);
    return { ok: true };
  });

export const logInterviewEventFn = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => EventInput.parse(d))
  .handler(async ({ data }) => {
    const session = await loadSessionByToken(data.token);
    if (!session) return { ok: false };
    if (session.status !== "in_progress") return { ok: false };
    await appendInterviewEvent(session.id, {
      type: data.type,
      at: new Date().toISOString(),
      detail: data.detail,
    });
    return { ok: true };
  });

export const submitInterviewAttemptFn = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => SubmitInput.parse(d))
  .handler(async ({ data }) => {
    const session = await loadSessionByToken(data.token);
    if (!session) throw new Error("Invalid or expired interview link.");
    if (!session.attempt_id) throw new Error("No active attempt.");

    const pool = getPgPool();
    const client = await pool.connect();
    let sessionId = session.id;
    let attemptId = session.attempt_id;

    try {
      await client.query("BEGIN");
      const lock = await client.query<{ status: string }>(
        `SELECT status FROM interview_sessions WHERE id = $1 FOR UPDATE`,
        [session.id],
      );
      const status = lock.rows[0]?.status;
      if (status === "submitted" || status === "evaluating" || status === "evaluated") {
        await client.query("COMMIT");
        return { mcqScore: 0, submitted: true, alreadySubmitted: true };
      }
      if (status !== "in_progress") {
        throw new Error(`Cannot submit (status: ${status}).`);
      }

      const questions = await getGradingQuestionsForSession(session.id);
      const answers = await normalizeInterviewAnswerKeys(session.id, data.answers);

      let mcqCorrect = 0;
      let mcqTotal = 0;
      await client.query(`DELETE FROM attempt_answers WHERE attempt_id = $1`, [attemptId]);
      for (const q of questions) {
        const answer = answers[q.id] ?? "";
        let isCorrect: boolean | null = null;
        if (q.type === "mcq") {
          mcqTotal += 1;
          const given = answer.trim().toLowerCase();
          const expected = (q.correct_answer ?? "").trim().toLowerCase();
          isCorrect = given.length > 0 && given === expected;
          if (isCorrect) mcqCorrect += 1;
        }
        await client.query(
          `INSERT INTO attempt_answers (attempt_id, question_id, answer, is_correct)
           VALUES ($1, $2, $3, $4)`,
          [attemptId, q.id, answer, isCorrect],
        );
      }

      const mcqScore = mcqTotal ? Math.round((mcqCorrect / mcqTotal) * 100) : 0;
      await client.query(
        `UPDATE assessment_attempts SET status = 'submitted', submitted_at = now(), score = $2 WHERE id = $1`,
        [attemptId, mcqScore],
      );
      await client.query(
        `UPDATE interview_sessions SET status = 'submitted', updated_at = now() WHERE id = $1`,
        [sessionId],
      );
      await client.query("COMMIT");

      await notifyInterviewSubmitted(sessionId);

      let evalError: string | undefined;
      try {
        await evaluateInterviewSession(sessionId);
        await notifyInterviewEvaluated(sessionId);
      } catch (e) {
        evalError = e instanceof Error ? e.message : String(e);
        console.error("[interview] AI evaluation failed", e);
      }

      return { mcqScore, submitted: true, evalError };
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
  });
