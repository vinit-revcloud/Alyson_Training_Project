import {
  createInterviewSessionInDb,
  getInterviewSessionByIdFromDb,
  listInterviewAssessmentsFromDb,
  validateInterviewAssessmentForSchedule,
} from "@/lib/interview/interview.server";
import { sendInterviewInviteEmail } from "@/lib/interview/interview-email.server";
import type {
  BulkInterviewImportPayload,
  BulkInterviewImportResult,
  BulkInterviewRowInput,
} from "@/lib/interview-bulk-import.shared";

export type { BulkInterviewImportResult };

function buildAssessmentTitleMap(
  assessments: Array<{ id: string; title: string }>,
): { map: Map<string, string>; duplicateTitles: string[] } {
  const map = new Map<string, string>();
  const duplicateTitles: string[] = [];
  for (const a of assessments) {
    const key = a.title.trim().toLowerCase();
    if (map.has(key)) {
      const label = a.title.trim();
      if (!duplicateTitles.includes(label)) duplicateTitles.push(label);
    } else {
      map.set(key, a.id);
    }
  }
  return { map, duplicateTitles };
}

function resolveAssessmentId(
  row: BulkInterviewRowInput,
  titleMap: Map<string, string>,
  defaultAssessmentId: string | undefined,
): { assessmentId?: string; error?: string } {
  if (row.assessmentTitle) {
    const id = titleMap.get(row.assessmentTitle.trim().toLowerCase());
    if (!id) {
      return { error: `Unknown assessment_title "${row.assessmentTitle}"` };
    }
    return { assessmentId: id };
  }
  if (defaultAssessmentId) {
    return { assessmentId: defaultAssessmentId };
  }
  return { error: "assessment_title is required when no default test is selected" };
}

export async function bulkImportInterviewSessionsInDb(
  payload: BulkInterviewImportPayload,
  createdBy: string,
): Promise<BulkInterviewImportResult> {
  const assessments = await listInterviewAssessmentsFromDb();
  const { map: titleMap, duplicateTitles } = buildAssessmentTitleMap(assessments);
  if (duplicateTitles.length) {
    throw new Error(
      `Duplicate interview test titles: ${duplicateTitles.join(", ")}. Rename tests in Interview tests before bulk import, or use unique titles in the spreadsheet.`,
    );
  }

  const created: BulkInterviewCreatedRow[] = [];
  const failed: BulkInterviewFailedRow[] = [];

  for (const row of payload.rows) {
    try {
      const resolved = resolveAssessmentId(row, titleMap, payload.defaults.assessmentId);
      if (!resolved.assessmentId) {
        failed.push({ row: row.excelRow, message: resolved.error ?? "Assessment not resolved" });
        continue;
      }

      const scheduledAt = row.scheduledAt ?? payload.defaults.scheduledAt;
      const expiresAt = row.expiresAt ?? payload.defaults.expiresAt;

      if (new Date(expiresAt) <= new Date(scheduledAt)) {
        failed.push({ row: row.excelRow, message: "Expiry must be after scheduled time" });
        continue;
      }
      if (new Date(expiresAt) <= new Date()) {
        failed.push({ row: row.excelRow, message: "Expiry must be in the future" });
        continue;
      }

      await validateInterviewAssessmentForSchedule(resolved.assessmentId);

      const { session, rawToken } = await createInterviewSessionInDb({
        assessmentId: resolved.assessmentId,
        candidateName: row.candidateName,
        candidateEmail: row.candidateEmail,
        role: row.role,
        level: row.level,
        scheduledAt,
        expiresAt,
        createdBy,
        assessmentMode: row.assessmentMode,
      });

      let emailSent = false;
      let emailError: string | undefined;
      if (row.assessmentMode !== "paper_only") {
        const detail = await getInterviewSessionByIdFromDb(session.id);
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

      created.push({
        row: row.excelRow,
        sessionId: session.id,
        candidateEmail: session.candidate_email,
        emailSent,
        emailError,
      });
    } catch (e) {
      failed.push({
        row: row.excelRow,
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }

  return { created, failed };
}
