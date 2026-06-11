import { z } from "zod";
import { ClassStatusSchema, LevelSchema, normalizeTestConfig } from "@/lib/class-create.validation";

export const BulkSectionSchema = z.object({
  order: z.number().int().min(0),
  title: z.string().min(1),
  description: z.string().default(""),
  durationMin: z.number().int().min(1).default(10),
  objectives: z.string().default(""),
  videoLink: z.string().optional(),
  documentLinks: z.array(z.string().url()).default([]),
  transcriptionLink: z.string().url().optional(),
});

export const BulkClassSchema = z.object({
  order: z.number().int().min(1),
  name: z.string().min(1),
  summary: z.string().default(""),
  level: LevelSchema.default("Beginner"),
  audience: z.string().default(""),
  topics: z.array(z.string()).default([]),
  status: ClassStatusSchema.default("draft"),
  test: z
    .object({
      difficulty: LevelSchema,
      mcqCount: z.number().int().min(1).max(50),
      subjectiveCount: z.number().int().min(0).max(20),
      passMark: z.number().int().min(50).max(100),
      retest: z.boolean(),
    })
    .optional(),
  sections: z.array(BulkSectionSchema).min(1),
});

export const BulkImportPayloadSchema = z.object({
  courseId: z.string().uuid(),
  classes: z.array(BulkClassSchema).min(1),
});

export type BulkClassInput = z.infer<typeof BulkClassSchema>;
export type BulkImportPayload = z.infer<typeof BulkImportPayloadSchema>;

export interface BulkParseIssue {
  row: number;
  sheet: string;
  message: string;
}

export interface BulkParseResult {
  classes: BulkClassInput[];
  issues: BulkParseIssue[];
}

export function normalizeBulkClass(raw: BulkClassInput): BulkClassInput {
  return {
    ...raw,
    name: raw.name.trim(),
    summary: raw.summary.trim(),
    audience: raw.audience.trim(),
    topics: raw.topics.map((t) => t.trim()).filter(Boolean),
    test: normalizeTestConfig(raw.test ?? { difficulty: raw.level, retest: true }),
    sections: raw.sections
      .slice()
      .sort((a, b) => a.order - b.order)
      .map((s, idx) => ({
        ...s,
        order: idx,
        title: s.title.trim(),
        description: s.description.trim(),
        objectives: s.objectives.trim(),
        videoLink: s.videoLink?.trim() || undefined,
        documentLinks: [...new Set(s.documentLinks.map((u) => u.trim()).filter(Boolean))],
        transcriptionLink: s.transcriptionLink?.trim() || undefined,
      })),
  };
}

export function validateBulkImport(classes: BulkClassInput[]): BulkParseIssue[] {
  const issues: BulkParseIssue[] = [];
  const orders = new Set<number>();
  for (const cls of classes) {
    if (orders.has(cls.order)) {
      issues.push({
        row: cls.order,
        sheet: "Classes",
        message: `Duplicate class order ${cls.order}`,
      });
    }
    orders.add(cls.order);
    if (!cls.sections.length) {
      issues.push({
        row: cls.order,
        sheet: "Classes",
        message: `Class "${cls.name}" has no sections`,
      });
    }
  }
  return issues;
}
