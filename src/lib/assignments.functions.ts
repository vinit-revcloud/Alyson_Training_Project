import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireContentManager } from "@/integrations/neon/auth-middleware";
import {
  assignAssessmentInDb,
  autoAssignCourseToDepartmentInDb,
  createManualAssignmentInDb,
  getAssignmentMetricsFromDb,
  getAllCourseDepartmentsFromDb,
  getCourseDepartmentsFromDb,
  getCourseTreeFromDb,
  listAssignmentDetailsFromDb,
  listCourseTitlesFromDb,
  listPickableAssessmentsFromDb,
  listUsersForAssignmentFromDb,
  moveSectionToClassInDb,
  reorderClassesInDb,
  reorderSectionsInDb,
  setCourseDepartmentsInDb,
  updateUserDepartmentInDb,
} from "@/lib/assignments.server";

const ManualAssignSchema = z.object({
  learnerUserId: z.string().uuid(),
  assessmentId: z.string().uuid(),
  courseId: z.string().uuid().nullable().optional(),
  dueAt: z.string().optional(),
  maxAttempts: z.number().int().min(1).max(10).optional(),
});

const AutoAssignSchema = z.object({
  courseId: z.string().uuid(),
  department: z.string().min(1),
});

const SetDepartmentsSchema = z.object({
  courseId: z.string().uuid(),
  departments: z.array(z.string()),
});

const UpdateUserDeptSchema = z.object({
  userId: z.string().uuid(),
  department: z.string().nullable(),
});

export const listAssignmentsFn = createServerFn({ method: "GET" })
  .middleware([requireContentManager])
  .handler(async () => listAssignmentDetailsFromDb());

export const getAssignmentMetricsFn = createServerFn({ method: "GET" })
  .middleware([requireContentManager])
  .handler(async () => getAssignmentMetricsFromDb());

export const createManualAssignmentFn = createServerFn({ method: "POST" })
  .middleware([requireContentManager])
  .inputValidator((data: unknown) => ManualAssignSchema.parse(data))
  .handler(async ({ data, context }) => {
    const row = await createManualAssignmentInDb({ ...data, assignedBy: context.userId });
    const { notifyNewAssignments } = await import("@/lib/email/assignment-notify.server");
    const emailsQueued = await notifyNewAssignments([row.id]);
    console.info(`[assignments] createManualAssignment: emailsQueued=${emailsQueued}`);
    return { ...row, emailsQueued };
  });

export const autoAssignCourseToDepartmentFn = createServerFn({ method: "POST" })
  .middleware([requireContentManager])
  .inputValidator((data: unknown) => AutoAssignSchema.parse(data))
  .handler(async ({ data }) => {
    const result = await autoAssignCourseToDepartmentInDb(data.courseId, data.department);
    const { notifyNewAssignments } = await import("@/lib/email/assignment-notify.server");
    const emailsQueued = await notifyNewAssignments(result.newAssignmentIds);
    console.info(
      `[assignments] autoAssignCourseToDepartment: emailsQueued=${emailsQueued} assignments=${result.newAssignmentIds.length}`,
    );
    return { ...result, emailsQueued };
  });

export const listUsersForAssignmentFn = createServerFn({ method: "GET" })
  .middleware([requireContentManager])
  .handler(async () => listUsersForAssignmentFromDb());

export const getAllCourseDepartmentsFn = createServerFn({ method: "GET" })
  .middleware([requireContentManager])
  .handler(async () => {
    const map = await getAllCourseDepartmentsFromDb();
    return Object.fromEntries(map.entries()) as Record<string, string[]>;
  });

export const getCourseDepartmentsFn = createServerFn({ method: "POST" })
  .middleware([requireContentManager])
  .inputValidator((data: unknown) => z.object({ courseId: z.string().uuid() }).parse(data))
  .handler(async ({ data }) => getCourseDepartmentsFromDb(data.courseId));

export const setCourseDepartmentsFn = createServerFn({ method: "POST" })
  .middleware([requireContentManager])
  .inputValidator((data: unknown) => SetDepartmentsSchema.parse(data))
  .handler(async ({ data }) => {
    await setCourseDepartmentsInDb(data.courseId, data.departments);
    return { ok: true as const };
  });

const BulkAssignSchema = z.object({
  assessmentId: z.string().uuid(),
  learnerUserIds: z.array(z.string().uuid()).min(1),
  dueAt: z.string(),
  mode: z.enum(["final", "practice"]).optional(),
  maxAttempts: z.number().int().min(1).max(10).optional(),
  courseId: z.string().uuid().nullable().optional(),
});

export const assignAssessmentFn = createServerFn({ method: "POST" })
  .middleware([requireContentManager])
  .inputValidator((data: unknown) => BulkAssignSchema.parse(data))
  .handler(async ({ data, context }) => {
    const ids = await assignAssessmentInDb({ ...data, assignedBy: context.userId });
    const { notifyNewAssignments } = await import("@/lib/email/assignment-notify.server");
    const emailsQueued = await notifyNewAssignments(ids);
    console.info(`[assignments] assignAssessment: emailsQueued=${emailsQueued} count=${ids.length}`);
    return { count: ids.length, assignmentIds: ids, emailsQueued };
  });

export const updateUserDepartmentFn = createServerFn({ method: "POST" })
  .middleware([requireContentManager])
  .inputValidator((data: unknown) => UpdateUserDeptSchema.parse(data))
  .handler(async ({ data }) => {
    await updateUserDepartmentInDb(data.userId, data.department);
    return { ok: true as const };
  });

export const reorderClassesFn = createServerFn({ method: "POST" })
  .middleware([requireContentManager])
  .inputValidator((data: unknown) =>
    z.object({ courseId: z.string().uuid(), classIds: z.array(z.string().uuid()) }).parse(data),
  )
  .handler(async ({ data }) => {
    await reorderClassesInDb(data.courseId, data.classIds);
    return { ok: true as const };
  });

export const reorderSectionsFn = createServerFn({ method: "POST" })
  .middleware([requireContentManager])
  .inputValidator((data: unknown) =>
    z.object({ classId: z.string().uuid(), sectionIds: z.array(z.string().uuid()) }).parse(data),
  )
  .handler(async ({ data }) => {
    await reorderSectionsInDb(data.classId, data.sectionIds);
    return { ok: true as const };
  });

export const moveSectionToClassFn = createServerFn({ method: "POST" })
  .middleware([requireContentManager])
  .inputValidator((data: unknown) =>
    z
      .object({
        sectionId: z.string().uuid(),
        targetClassId: z.string().uuid(),
        position: z.number().int().min(0),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    await moveSectionToClassInDb(data.sectionId, data.targetClassId, data.position);
    return { ok: true as const };
  });

export const getCourseTreeFn = createServerFn({ method: "POST" })
  .middleware([requireContentManager])
  .inputValidator((data: unknown) => z.object({ courseId: z.string().uuid() }).parse(data))
  .handler(async ({ data }) => getCourseTreeFromDb(data.courseId));

export const listPickableAssessmentsFn = createServerFn({ method: "GET" })
  .middleware([requireContentManager])
  .handler(async () => listPickableAssessmentsFromDb());

export const listCourseTitlesFn = createServerFn({ method: "GET" })
  .middleware([requireContentManager])
  .handler(async () => listCourseTitlesFromDb());
