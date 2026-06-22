import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireContentManager, requireDbAuth } from "@/integrations/neon/auth-middleware";
import { ClassStatusSchema, LevelSchema } from "@/lib/class-create.validation";
import {
  addSectionInDb,
  addSectionVideoLinkInDb,
  deleteSectionAssetInDb,
  deleteSectionInDb,
  deleteClassInDb,
  getClassAssessmentSeedFromDb,
  getClassFromDb,
  getCourseFromDb,
  setCourseCoreOnboardingInDb,
  getSectionAssetByIdFromDb,
  getSectionAssetsBySectionIdFromDb,
  insertSectionAssetInDb,
  listClassesForCountsFromDb,
  listClassesForCourseFromDb,
  listCoursesFromDb,
  listSectionQuestionsFromDb,
  listSectionsWithAssetsFromDb,
  updateClassMetaInDb,
  updateClassStatusInDb,
  updateSectionInDb,
} from "@/lib/classes.server";
import type {
  ClassAssessmentSeed,
  ClassRow,
  CourseRow,
  CourseWithStats,
  SectionQuestionRow,
  SectionRow,
} from "@/lib/classes-api";

export const listCoursesFn = createServerFn({ method: "GET" })
  .middleware([requireDbAuth])
  .handler(async (): Promise<CourseWithStats[]> => listCoursesFromDb());

export const listClassesForCountsFn = createServerFn({ method: "GET" })
  .middleware([requireDbAuth])
  .handler(async (): Promise<ClassRow[]> => listClassesForCountsFromDb());

const CourseIdSchema = z.object({ courseId: z.string().uuid() });
const ClassIdSchema = z.object({ classId: z.string().uuid() });
const SectionIdSchema = z.object({ sectionId: z.string().uuid() });
const AssetIdSchema = z.object({ assetId: z.string().uuid() });

export const getCourseFn = createServerFn({ method: "POST" })
  .middleware([requireDbAuth])
  .inputValidator((data: unknown) => CourseIdSchema.parse(data))
  .handler(async ({ data }): Promise<CourseRow | null> => getCourseFromDb(data.courseId));

const CoreOnboardingSchema = z.object({
  courseId: z.string().uuid(),
  isCore: z.boolean(),
});

export const setCourseCoreOnboardingFn = createServerFn({ method: "POST" })
  .middleware([requireDbAuth, requireContentManager])
  .inputValidator((data: unknown) => CoreOnboardingSchema.parse(data))
  .handler(async ({ data }) => {
    await setCourseCoreOnboardingInDb(data.courseId, data.isCore);
    return { ok: true };
  });

export const listClassesForCourseFn = createServerFn({ method: "POST" })
  .middleware([requireDbAuth])
  .inputValidator((data: unknown) => CourseIdSchema.parse(data))
  .handler(async ({ data }): Promise<ClassRow[]> => listClassesForCourseFromDb(data.courseId));

export const getClassFn = createServerFn({ method: "POST" })
  .middleware([requireDbAuth])
  .inputValidator((data: unknown) => ClassIdSchema.parse(data))
  .handler(async ({ data }): Promise<ClassRow | null> => getClassFromDb(data.classId));

export const listSectionsWithAssetsFn = createServerFn({ method: "POST" })
  .middleware([requireDbAuth])
  .inputValidator((data: unknown) => ClassIdSchema.parse(data))
  .handler(async ({ data }) => listSectionsWithAssetsFromDb(data.classId));

export const getClassAssessmentSeedFn = createServerFn({ method: "POST" })
  .middleware([requireContentManager])
  .inputValidator((data: unknown) => ClassIdSchema.parse(data))
  .handler(async ({ data }): Promise<ClassAssessmentSeed> =>
    getClassAssessmentSeedFromDb(data.classId),
  );

export const listSectionQuestionsFn = createServerFn({ method: "POST" })
  .middleware([requireContentManager])
  .inputValidator((data: unknown) => SectionIdSchema.parse(data))
  .handler(async ({ data }): Promise<SectionQuestionRow[]> =>
    listSectionQuestionsFromDb(data.sectionId),
  );

export const getSectionAssetsForSectionFn = createServerFn({ method: "POST" })
  .middleware([requireContentManager])
  .inputValidator((data: unknown) => SectionIdSchema.parse(data))
  .handler(async ({ data }) => getSectionAssetsBySectionIdFromDb(data.sectionId));

export const getSectionAssetFn = createServerFn({ method: "POST" })
  .middleware([requireContentManager])
  .inputValidator((data: unknown) => AssetIdSchema.parse(data))
  .handler(async ({ data }) => getSectionAssetByIdFromDb(data.assetId));

const UpdateClassStatusSchema = z.object({
  classId: z.string().uuid(),
  status: ClassStatusSchema,
});

export const updateClassStatusFn = createServerFn({ method: "POST" })
  .middleware([requireContentManager])
  .inputValidator((data: unknown) => UpdateClassStatusSchema.parse(data))
  .handler(async ({ data }) => {
    await updateClassStatusInDb(data.classId, data.status);
    return { ok: true as const };
  });

const UpdateClassMetaSchema = z.object({
  classId: z.string().uuid(),
  patch: z.object({
    name: z.string().optional(),
    summary: z.string().optional(),
    audience: z.string().optional(),
    level: LevelSchema.optional(),
    topics: z.array(z.string()).optional(),
  }),
});

export const updateClassMetaFn = createServerFn({ method: "POST" })
  .middleware([requireContentManager])
  .inputValidator((data: unknown) => UpdateClassMetaSchema.parse(data))
  .handler(async ({ data }) => {
    await updateClassMetaInDb(data.classId, data.patch);
    return { ok: true as const };
  });

const UpdateSectionSchema = z.object({
  sectionId: z.string().uuid(),
  patch: z.object({
    title: z.string().optional(),
    description: z.string().optional(),
    duration_min: z.number().int().optional(),
    objectives: z.string().optional(),
    position: z.number().int().optional(),
  }),
});

export const updateSectionFn = createServerFn({ method: "POST" })
  .middleware([requireContentManager])
  .inputValidator((data: unknown) => UpdateSectionSchema.parse(data))
  .handler(async ({ data }) => {
    await updateSectionInDb(data.sectionId, data.patch);
    return { ok: true as const };
  });

const AddSectionSchema = z.object({
  classId: z.string().uuid(),
  title: z.string().min(1),
  description: z.string().optional(),
  duration_min: z.number().int().optional(),
  objectives: z.string().optional(),
});

export const addSectionFn = createServerFn({ method: "POST" })
  .middleware([requireContentManager])
  .inputValidator((data: unknown) => AddSectionSchema.parse(data))
  .handler(async ({ data }): Promise<SectionRow> =>
    addSectionInDb(data.classId, {
      title: data.title,
      description: data.description,
      duration_min: data.duration_min,
      objectives: data.objectives,
    }),
  );

export const deleteSectionFn = createServerFn({ method: "POST" })
  .middleware([requireContentManager])
  .inputValidator((data: unknown) => SectionIdSchema.parse(data))
  .handler(async ({ data }) => {
    await deleteSectionInDb(data.sectionId);
    return { ok: true as const };
  });

export const deleteClassFn = createServerFn({ method: "POST" })
  .middleware([requireContentManager])
  .inputValidator((data: unknown) => ClassIdSchema.parse(data))
  .handler(async ({ data }) => {
    await deleteClassInDb(data.classId);
    return { ok: true as const };
  });

const InsertSectionAssetSchema = z.object({
  sectionId: z.string().uuid(),
  kind: z.string(),
  storageBucket: z.string().nullable().optional(),
  storagePath: z.string().nullable().optional(),
  externalUrl: z.string().nullable().optional(),
  fileName: z.string(),
  mimeType: z.string().nullable().optional(),
  sizeBytes: z.number().int().nullable().optional(),
});

export const insertSectionAssetFn = createServerFn({ method: "POST" })
  .middleware([requireContentManager])
  .inputValidator((data: unknown) => InsertSectionAssetSchema.parse(data))
  .handler(async ({ data }) => {
    const id = await insertSectionAssetInDb(data);
    return { id };
  });

const AddSectionVideoLinkSchema = z.object({
  sectionId: z.string().uuid(),
  url: z.string().min(1),
});

export const addSectionVideoLinkFn = createServerFn({ method: "POST" })
  .middleware([requireContentManager])
  .inputValidator((data: unknown) => AddSectionVideoLinkSchema.parse(data))
  .handler(async ({ data }) => {
    await addSectionVideoLinkInDb(data.sectionId, data.url);
    return { ok: true as const };
  });

export const deleteSectionAssetFn = createServerFn({ method: "POST" })
  .middleware([requireContentManager])
  .inputValidator((data: unknown) => AssetIdSchema.parse(data))
  .handler(async ({ data }) => {
    await deleteSectionAssetInDb(data.assetId);
    return { ok: true as const };
  });
