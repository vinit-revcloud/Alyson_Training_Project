import { z } from "zod";
import type { AssessmentMode } from "@/lib/interview/interview.shared";

export const MAX_BULK_INTERVIEW_ROWS = 200;

export const AssessmentModeSchema = z.enum(["online", "paper_only", "hybrid"]);

export const BulkInterviewRowSchema = z
  .object({
    excelRow: z.number().int().min(2),
    candidateName: z.string().min(2).max(200),
    candidateEmail: z.string().email(),
    role: z.string().min(1).max(120),
    level: z.string().min(1).max(80),
    assessmentTitle: z.string().optional(),
    scheduledAt: z.string().datetime().optional(),
    expiresAt: z.string().datetime().optional(),
    assessmentMode: AssessmentModeSchema.default("online"),
  })
  .superRefine((row, ctx) => {
    if (row.scheduledAt && row.expiresAt && new Date(row.expiresAt) <= new Date(row.scheduledAt)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "expires_at must be after scheduled_at",
        path: ["expiresAt"],
      });
    }
    if (row.expiresAt && new Date(row.expiresAt) <= new Date()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "expires_at must be in the future",
        path: ["expiresAt"],
      });
    }
  });

export const BulkInterviewImportPayloadSchema = z.object({
  rows: z.array(BulkInterviewRowSchema).min(1).max(MAX_BULK_INTERVIEW_ROWS),
  defaults: z
    .object({
      assessmentId: z.string().uuid().optional(),
      scheduledAt: z.string().datetime(),
      expiresAt: z.string().datetime(),
    })
    .refine((d) => new Date(d.expiresAt) > new Date(d.scheduledAt), {
      message: "Default expiry must be after default scheduled time.",
      path: ["expiresAt"],
    })
    .refine((d) => new Date(d.expiresAt) > new Date(), {
      message: "Default expiry must be in the future.",
      path: ["expiresAt"],
    }),
});

export type BulkInterviewRowInput = z.infer<typeof BulkInterviewRowSchema>;
export type BulkInterviewImportPayload = z.infer<typeof BulkInterviewImportPayloadSchema>;

export interface BulkInterviewParseIssue {
  row: number;
  sheet: string;
  message: string;
}

export interface BulkInterviewParseResult {
  rows: BulkInterviewRowInput[];
  issues: BulkInterviewParseIssue[];
}

export function normalizeBulkInterviewRow(raw: BulkInterviewRowInput): BulkInterviewRowInput {
  return {
    ...raw,
    candidateName: raw.candidateName.trim(),
    candidateEmail: raw.candidateEmail.trim().toLowerCase(),
    role: raw.role.trim(),
    level: raw.level.trim() || "Mid-Level",
    assessmentTitle: raw.assessmentTitle?.trim() || undefined,
    assessmentMode: raw.assessmentMode ?? "online",
  };
}

export function validateBulkInterviewFile(rows: BulkInterviewRowInput[]): BulkInterviewParseIssue[] {
  const issues: BulkInterviewParseIssue[] = [];
  const emails = new Map<string, number>();
  for (const row of rows) {
    const email = row.candidateEmail.toLowerCase();
    const first = emails.get(email);
    if (first != null) {
      issues.push({
        row: row.excelRow,
        sheet: "Candidates",
        message: `Duplicate candidate_email "${email}" (also on row ${first})`,
      });
    } else {
      emails.set(email, row.excelRow);
    }
  }
  return issues;
}

export function resolveAssessmentMode(raw: string): AssessmentMode | null {
  const v = raw.trim().toLowerCase().replace(/\s+/g, "_");
  if (!v) return null;
  if (["online", "on-line"].includes(v)) return "online";
  if (["paper_only", "paper", "paper-only", "in_person", "in-person"].includes(v)) return "paper_only";
  if (["hybrid"].includes(v)) return "hybrid";
  return null;
}

export interface BulkInterviewCreatedRow {
  row: number;
  sessionId: string;
  candidateEmail: string;
  emailSent: boolean;
  emailError?: string;
}

export interface BulkInterviewFailedRow {
  row: number;
  message: string;
}

export interface BulkInterviewImportResult {
  created: BulkInterviewCreatedRow[];
  failed: BulkInterviewFailedRow[];
}
