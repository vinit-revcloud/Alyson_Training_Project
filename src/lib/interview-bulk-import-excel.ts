import * as XLSX from "xlsx";
import type {
  BulkInterviewParseIssue,
  BulkInterviewParseResult,
  BulkInterviewRowInput,
} from "@/lib/interview-bulk-import.shared";
import {
  MAX_BULK_INTERVIEW_ROWS,
  normalizeBulkInterviewRow,
  resolveAssessmentMode,
  validateBulkInterviewFile,
} from "@/lib/interview-bulk-import.shared";

function normKey(key: string): string {
  return key.trim().toLowerCase().replace(/\s+/g, "_");
}

function rowCell(row: Record<string, unknown>, ...aliases: string[]): string {
  const map = new Map<string, unknown>();
  for (const [k, v] of Object.entries(row)) {
    map.set(normKey(k), v);
  }
  for (const alias of aliases) {
    const v = map.get(normKey(alias));
    if (v != null && String(v).trim() !== "") return String(v).trim();
  }
  return "";
}

function rawCell(row: Record<string, unknown>, ...aliases: string[]): unknown {
  const map = new Map<string, unknown>();
  for (const [k, v] of Object.entries(row)) {
    map.set(normKey(k), v);
  }
  for (const alias of aliases) {
    const v = map.get(normKey(alias));
    if (v != null && String(v).trim() !== "") return v;
  }
  return undefined;
}

function parseDateCell(
  raw: unknown,
  excelRow: number,
  sheet: string,
  column: string,
  issues: BulkInterviewParseIssue[],
): string | undefined {
  if (raw == null || String(raw).trim() === "") return undefined;

  if (typeof raw === "number" && Number.isFinite(raw)) {
    const parsed = XLSX.SSF.parse_date_code(raw);
    if (parsed) {
      const d = new Date(parsed.y, parsed.m - 1, parsed.d, parsed.H, parsed.M, Math.floor(parsed.S));
      if (!Number.isNaN(d.getTime())) return d.toISOString();
    }
  }

  const s = String(raw).trim();
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) {
    issues.push({
      row: excelRow,
      sheet,
      message: `Invalid ${column}: "${s}"`,
    });
    return undefined;
  }
  return d.toISOString();
}

function findSheet(wb: XLSX.WorkBook, ...names: string[]): string | null {
  const norm = (s: string) => s.trim().toLowerCase();
  for (const name of names) {
    const hit = wb.SheetNames.find((n) => norm(n) === norm(name));
    if (hit) return hit;
  }
  return null;
}

function sheetRows(wb: XLSX.WorkBook, sheetName: string): Record<string, unknown>[] {
  const sheet = wb.Sheets[sheetName];
  if (!sheet) return [];
  return XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
}

function parseCandidatesSheet(
  rows: Record<string, unknown>[],
  sheetName: string,
): BulkInterviewParseResult {
  const issues: BulkInterviewParseIssue[] = [];
  const parsed: BulkInterviewRowInput[] = [];

  rows.forEach((row, idx) => {
    const excelRow = idx + 2;
    const candidateName = rowCell(row, "candidate_name", "name", "candidate");
    const candidateEmail = rowCell(row, "candidate_email", "email");
    const role = rowCell(row, "job_title", "role", "title", "position");
    const level = rowCell(row, "level", "seniority") || "Mid-Level";
    const assessmentTitle = rowCell(row, "assessment_title", "test", "test_title", "assessment");
    const modeRaw = rowCell(row, "assessment_mode", "mode", "delivery_mode");

    if (!candidateName && !candidateEmail && !role) return;

    if (!candidateName) {
      issues.push({ row: excelRow, sheet: sheetName, message: "candidate_name is required" });
    }
    if (!candidateEmail) {
      issues.push({ row: excelRow, sheet: sheetName, message: "candidate_email is required" });
    }
    if (!role) {
      issues.push({ row: excelRow, sheet: sheetName, message: "job_title is required" });
    }

    let assessmentMode: BulkInterviewRowInput["assessmentMode"] = "online";
    if (modeRaw) {
      const mode = resolveAssessmentMode(modeRaw);
      if (!mode) {
        issues.push({
          row: excelRow,
          sheet: sheetName,
          message: `Invalid assessment_mode "${modeRaw}" — use online, paper_only, or hybrid`,
        });
      } else {
        assessmentMode = mode;
      }
    }

    const scheduledAt = parseDateCell(
      rawCell(row, "scheduled_at", "schedule", "scheduled"),
      excelRow,
      sheetName,
      "scheduled_at",
      issues,
    );
    const expiresAt = parseDateCell(
      rawCell(row, "expires_at", "expires", "expiry"),
      excelRow,
      sheetName,
      "expires_at",
      issues,
    );

    if (scheduledAt && expiresAt && new Date(expiresAt) <= new Date(scheduledAt)) {
      issues.push({
        row: excelRow,
        sheet: sheetName,
        message: "expires_at must be after scheduled_at",
      });
    }

    if (candidateName && candidateEmail && role) {
      parsed.push(
        normalizeBulkInterviewRow({
          excelRow,
          candidateName,
          candidateEmail,
          role,
          level,
          assessmentTitle: assessmentTitle || undefined,
          scheduledAt,
          expiresAt,
          assessmentMode,
        }),
      );
    }
  });

  if (parsed.length > MAX_BULK_INTERVIEW_ROWS) {
    issues.push({
      row: 0,
      sheet: sheetName,
      message: `Too many rows (${parsed.length}). Maximum is ${MAX_BULK_INTERVIEW_ROWS}.`,
    });
  }

  issues.push(...validateBulkInterviewFile(parsed));
  return { rows: parsed.slice(0, MAX_BULK_INTERVIEW_ROWS), issues };
}

export function parseBulkInterviewExcel(buffer: ArrayBuffer): BulkInterviewParseResult {
  const wb = XLSX.read(buffer, { type: "array", cellDates: true });
  const sheetName =
    findSheet(wb, "Candidates", "Candidate", "Interviews", "Import", "Sheet1") ??
    wb.SheetNames[0] ??
    null;

  if (!sheetName) {
    return { rows: [], issues: [{ row: 0, sheet: "Workbook", message: "Workbook is empty" }] };
  }

  return parseCandidatesSheet(sheetRows(wb, sheetName), sheetName);
}

export interface InterviewAssessmentRef {
  id: string;
  title: string;
  status: string;
}

export function downloadBulkInterviewTemplate(assessments: InterviewAssessmentRef[]): void {
  const candidates = [
    {
      candidate_name: "Jane Doe",
      candidate_email: "jane.doe@example.com",
      job_title: "Software Engineer",
      level: "Mid-Level",
      assessment_title: assessments[0]?.title ?? "",
      scheduled_at: "",
      expires_at: "",
      assessment_mode: "online",
    },
  ];

  const tests = assessments.map((a) => ({
    assessment_title: a.title,
    assessment_id: a.id,
    status: a.status,
  }));

  const readme = [
    {
      tip: "One row per candidate on the Candidates sheet.",
    },
    {
      tip: "Required: candidate_name, candidate_email, job_title. Optional: level, assessment_title, scheduled_at, expires_at, assessment_mode.",
    },
    {
      tip: "assessment_title must match a test listed on Available tests (or leave blank and pick a default in the upload dialog).",
    },
    {
      tip: "assessment_mode: online | paper_only | hybrid. Dates accept ISO text or Excel date cells.",
    },
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(candidates), "Candidates");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(tests), "Available tests");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(readme), "Instructions");
  XLSX.writeFile(wb, "interview-bulk-import-template.xlsx");
}
