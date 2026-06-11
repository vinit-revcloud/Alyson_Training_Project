import * as XLSX from "xlsx";
import type { BulkClassInput, BulkParseIssue, BulkParseResult } from "@/lib/class-bulk-import.shared";
import { normalizeBulkClass, validateBulkImport } from "@/lib/class-bulk-import.shared";
import { ClassStatusSchema, LevelSchema } from "@/lib/class-create.validation";

const LEVELS = new Set(LevelSchema.options);
const STATUSES = new Set(ClassStatusSchema.options);

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

function rowNum(row: Record<string, unknown>, ...aliases: string[]): number | null {
  const raw = rowCell(row, ...aliases);
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function parseBool(raw: string, fallback = true): boolean {
  const v = raw.trim().toLowerCase();
  if (!v) return fallback;
  if (["yes", "y", "true", "1"].includes(v)) return true;
  if (["no", "n", "false", "0"].includes(v)) return false;
  return fallback;
}

function parseTopics(raw: string): string[] {
  if (!raw) return [];
  return raw
    .split(/[,;|]/)
    .map((t) => t.trim())
    .filter(Boolean);
}

function isValidUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

/** Parse comma/semicolon-separated URLs; returns links and per-URL errors. */
function parseLinkList(
  raw: string,
  excelRow: number,
  sheet: string,
  column: string,
  issues: BulkParseIssue[],
): string[] {
  if (!raw.trim()) return [];
  const links: string[] = [];
  for (const part of raw.split(/[,;]/).map((s) => s.trim()).filter(Boolean)) {
    if (isValidUrl(part)) {
      links.push(part);
    } else {
      issues.push({
        row: excelRow,
        sheet,
        message: `Invalid ${column} URL: "${part}"`,
      });
    }
  }
  return links;
}

function parseOptionalUrl(
  raw: string,
  excelRow: number,
  sheet: string,
  column: string,
  issues: BulkParseIssue[],
): string | undefined {
  if (!raw.trim()) return undefined;
  if (isValidUrl(raw)) return raw;
  issues.push({ row: excelRow, sheet, message: `Invalid ${column} URL: "${raw}"` });
  return undefined;
}

function parseSectionAssetColumns(
  row: Record<string, unknown>,
  excelRow: number,
  sheet: string,
  issues: BulkParseIssue[],
): {
  videoLink?: string;
  documentLinks: string[];
  transcriptionLink?: string;
} {
  const documentLinks = parseLinkList(
    rowCell(row, "document_link", "document link", "document_url", "documents"),
    excelRow,
    sheet,
    "document_link",
    issues,
  );
  const transcriptionLink = parseOptionalUrl(
    rowCell(row, "transcription", "transcript", "transcript_link", "transcript url"),
    excelRow,
    sheet,
    "transcription",
    issues,
  );
  const videoRaw = rowCell(row, "video_link", "video url", "video");
  let videoLink: string | undefined;
  if (videoRaw) {
    if (isValidUrl(videoRaw)) {
      videoLink = videoRaw;
    } else {
      issues.push({ row: excelRow, sheet, message: `Invalid video_link URL: "${videoRaw}"` });
    }
  }
  return { videoLink, documentLinks, transcriptionLink };
}

function parseLevel(raw: string): BulkClassInput["level"] {
  const v = raw.trim();
  if (LEVELS.has(v as BulkClassInput["level"])) return v as BulkClassInput["level"];
  return "Beginner";
}

function parseStatus(raw: string): BulkClassInput["status"] {
  const v = raw.trim().toLowerCase().replace(/\s+/g, "-");
  if (STATUSES.has(v as BulkClassInput["status"])) return v as BulkClassInput["status"];
  return "draft";
}

function sheetRows(wb: XLSX.WorkBook, name: string): Record<string, unknown>[] {
  const sheet = wb.Sheets[name];
  if (!sheet) return [];
  return XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
}

function findSheet(wb: XLSX.WorkBook, ...names: string[]): string | null {
  for (const n of names) {
    if (wb.SheetNames.some((s) => normKey(s) === normKey(n))) {
      return wb.SheetNames.find((s) => normKey(s) === normKey(n))!;
    }
  }
  return null;
}

function parseTwoSheet(wb: XLSX.WorkBook): BulkParseResult {
  const issues: BulkParseIssue[] = [];
  const classesSheet = findSheet(wb, "Classes", "Class");
  const sectionsSheet = findSheet(wb, "Sections", "Section", "Sessions", "Topics");
  if (!classesSheet || !sectionsSheet) {
    return {
      classes: [],
      issues: [{ row: 0, sheet: "Workbook", message: 'Expected "Classes" and "Sections" (or "Sessions") sheets' }],
    };
  }

  const classRows = sheetRows(wb, classesSheet);
  const sectionRows = sheetRows(wb, sectionsSheet);

  const classMap = new Map<number, BulkClassInput>();

  classRows.forEach((row, idx) => {
    const excelRow = idx + 2;
    const order = rowNum(row, "order", "class_order", "#");
    const name = rowCell(row, "name", "class_name", "class");
    if (!order && !name) return;
    if (!order) {
      issues.push({ row: excelRow, sheet: classesSheet, message: "Missing class order" });
      return;
    }
    if (!name) {
      issues.push({ row: excelRow, sheet: classesSheet, message: "Missing class name" });
      return;
    }
    const level = parseLevel(rowCell(row, "level"));
    classMap.set(order, {
      order,
      name,
      summary: rowCell(row, "summary", "description"),
      level,
      audience: rowCell(row, "audience", "role", "department"),
      topics: parseTopics(rowCell(row, "topics", "tags")),
      status: parseStatus(rowCell(row, "status")),
      test: {
        difficulty: parseLevel(rowCell(row, "test_difficulty", "test difficulty") || level),
        mcqCount: rowNum(row, "test_mcq_count", "mcq_count") ?? 15,
        subjectiveCount: rowNum(row, "test_subjective_count", "subjective_count") ?? 5,
        passMark: rowNum(row, "test_pass_mark", "pass_mark") ?? 75,
        retest: parseBool(rowCell(row, "test_retest", "retest")),
      },
      sections: [],
    });
  });

  sectionRows.forEach((row, idx) => {
    const excelRow = idx + 2;
    const classOrder = rowNum(row, "class_order", "class order", "class #");
    const sectionOrder = rowNum(row, "order", "section_order", "section order", "#");
    const title = rowCell(row, "title", "section_title", "section", "topic");
    if (!classOrder && !title) return;
    if (!classOrder) {
      issues.push({ row: excelRow, sheet: sectionsSheet, message: "Missing class_order" });
      return;
    }
    if (!title) {
      issues.push({ row: excelRow, sheet: sectionsSheet, message: "Missing section title" });
      return;
    }
    const cls = classMap.get(classOrder);
    if (!cls) {
      issues.push({
        row: excelRow,
        sheet: sectionsSheet,
        message: `No class with order ${classOrder}`,
      });
      return;
    }
    const assets = parseSectionAssetColumns(row, excelRow, sectionsSheet, issues);
    cls.sections.push({
      order: sectionOrder ?? cls.sections.length,
      title,
      description: rowCell(row, "description", "section_description"),
      durationMin: Math.max(1, rowNum(row, "duration_min", "duration", "duration minutes") ?? 10),
      objectives: rowCell(row, "objectives", "learning_objectives"),
      videoLink: assets.videoLink,
      documentLinks: assets.documentLinks,
      transcriptionLink: assets.transcriptionLink,
    });
  });

  const classes = Array.from(classMap.values()).map(normalizeBulkClass);
  issues.push(...validateBulkImport(classes));
  return { classes, issues };
}

function parseFlatSheet(rows: Record<string, unknown>[], sheetName: string): BulkParseResult {
  const issues: BulkParseIssue[] = [];
  const classMap = new Map<number, BulkClassInput>();

  rows.forEach((row, idx) => {
    const excelRow = idx + 2;
    const classOrder = rowNum(row, "class_order", "order", "class #", "#");
    const name = rowCell(row, "class_name", "name", "class");
    const sectionTitle = rowCell(row, "section_title", "title", "section", "topic");
    if (!classOrder && !name && !sectionTitle) return;

    if (!classOrder) {
      issues.push({ row: excelRow, sheet: sheetName, message: "Missing class_order" });
      return;
    }

    if (!classMap.has(classOrder)) {
      if (!name) {
        issues.push({ row: excelRow, sheet: sheetName, message: "Missing class_name on first row of class" });
        return;
      }
      const level = parseLevel(rowCell(row, "level"));
      classMap.set(classOrder, {
        order: classOrder,
        name,
        summary: rowCell(row, "summary", "class_summary"),
        level,
        audience: rowCell(row, "audience", "role"),
        topics: parseTopics(rowCell(row, "topics", "tags")),
        status: parseStatus(rowCell(row, "status")),
        test: {
          difficulty: parseLevel(rowCell(row, "test_difficulty") || level),
          mcqCount: rowNum(row, "test_mcq_count", "mcq_count") ?? 15,
          subjectiveCount: rowNum(row, "test_subjective_count", "subjective_count") ?? 5,
          passMark: rowNum(row, "test_pass_mark", "pass_mark") ?? 75,
          retest: parseBool(rowCell(row, "test_retest", "retest")),
        },
        sections: [],
      });
    }

    if (!sectionTitle) return;
    const cls = classMap.get(classOrder)!;
    const sectionOrder = rowNum(row, "section_order", "section #") ?? cls.sections.length;
    const assets = parseSectionAssetColumns(row, excelRow, sheetName, issues);
    cls.sections.push({
      order: sectionOrder,
      title: sectionTitle,
      description: rowCell(row, "section_description", "description"),
      durationMin: Math.max(1, rowNum(row, "duration_min", "duration") ?? 10),
      objectives: rowCell(row, "objectives"),
      videoLink: assets.videoLink,
      documentLinks: assets.documentLinks,
      transcriptionLink: assets.transcriptionLink,
    });
  });

  const classes = Array.from(classMap.values()).map(normalizeBulkClass);
  issues.push(...validateBulkImport(classes));
  return { classes, issues };
}

export function parseBulkImportExcel(buffer: ArrayBuffer): BulkParseResult {
  const wb = XLSX.read(buffer, { type: "array" });
  const classesSheet = findSheet(wb, "Classes", "Class");
  const sectionsSheet = findSheet(wb, "Sections", "Section", "Sessions", "Topics");

  if (classesSheet && sectionsSheet) {
    return parseTwoSheet(wb);
  }

  const flatSheet =
    findSheet(wb, "BulkImport", "Import", "Sheet1") ?? wb.SheetNames[0] ?? null;
  if (!flatSheet) {
    return { classes: [], issues: [{ row: 0, sheet: "Workbook", message: "Workbook is empty" }] };
  }

  return parseFlatSheet(sheetRows(wb, flatSheet), flatSheet);
}

export function downloadBulkImportTemplate(): void {
  const classes = [
    {
      order: 1,
      name: "Introduction to Machine Learning",
      summary: "Foundations of ML for new hires",
      level: "Beginner",
      audience: "Data Scientist",
      topics: "supervised learning, regression",
      status: "draft",
      test_difficulty: "Beginner",
      test_mcq_count: 15,
      test_subjective_count: 5,
      test_pass_mark: 75,
      test_retest: "yes",
    },
    {
      order: 2,
      name: "Model Evaluation",
      summary: "Metrics and validation strategies",
      level: "Intermediate",
      audience: "Data Scientist",
      topics: "precision, recall, cross-validation",
      status: "draft",
      test_difficulty: "Intermediate",
      test_mcq_count: 15,
      test_subjective_count: 5,
      test_pass_mark: 75,
      test_retest: "yes",
    },
  ];

  const sections = [
    {
      class_order: 1,
      order: 1,
      title: "What is ML?",
      description: "Overview of machine learning",
      duration_min: 15,
      objectives: "Define ML and common use cases",
      video_link: "https://example.com/intro",
      document_link: "https://example.com/slides.pdf",
      transcription: "https://example.com/intro-transcript.txt",
    },
    {
      class_order: 1,
      order: 2,
      title: "Training vs inference",
      description: "Lifecycle of a model",
      duration_min: 20,
      objectives: "Explain train/test split",
      video_link: "",
      document_link: "",
      transcription: "",
    },
    {
      class_order: 2,
      order: 1,
      title: "Classification metrics",
      description: "Precision, recall, F1",
      duration_min: 25,
      objectives: "Choose metrics for imbalanced data",
      video_link: "",
      document_link: "https://example.com/metrics-guide.pdf, https://example.com/cheatsheet.pdf",
      transcription: "https://example.com/metrics-transcript.txt",
    },
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(classes), "Classes");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(sections), "Sections");

  const readme = [
    {
      tip: "Use the Classes + Sections sheets (Sections may also be named Sessions).",
    },
    { tip: "Classes are created in order of the order column, appended to the selected course." },
    { tip: "Each class needs at least one section row. Status: draft | in-review | published." },
    {
      tip: "Sections/Sessions optional columns: video_link, document_link (comma-separated URLs), transcription (transcript URL).",
    },
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(readme), "Instructions");

  XLSX.writeFile(wb, "class-bulk-import-template.xlsx");
}
