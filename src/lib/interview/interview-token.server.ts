import { createHash, randomBytes } from "node:crypto";
import type { InterviewSessionRow, InterviewSessionStatus } from "./interview.shared";
import { getPgPool } from "@/lib/pg.server";

export function generateInterviewToken(): string {
  return randomBytes(32).toString("hex");
}

export function hashInterviewToken(token: string): string {
  return createHash("sha256").update(token.trim()).digest("hex");
}

const TERMINAL_STATUSES = new Set<InterviewSessionStatus>([
  "submitted",
  "evaluating",
  "evaluated",
  "cancelled",
  "expired",
]);

export async function loadSessionByToken(token: string): Promise<InterviewSessionRow | null> {
  const hash = hashInterviewToken(token);
  const pool = getPgPool();
  const { rows } = await pool.query<InterviewSessionRow>(
    `SELECT * FROM interview_sessions WHERE access_token_hash = $1 LIMIT 1`,
    [hash],
  );
  const session = rows[0];
  if (!session) return null;

  if (
    !TERMINAL_STATUSES.has(session.status) &&
    new Date(session.expires_at).getTime() <= Date.now()
  ) {
    await pool.query(
      `UPDATE interview_sessions SET status = 'expired', updated_at = now() WHERE id = $1 AND status NOT IN ('submitted','evaluating','evaluated','cancelled')`,
      [session.id],
    );
    session.status = "expired";
  }
  return session;
}

export function assertSessionStatus(
  session: InterviewSessionRow,
  allowed: InterviewSessionStatus[],
): void {
  if (!allowed.includes(session.status)) {
    throw new Error(`Interview is not available (status: ${session.status}).`);
  }
}
