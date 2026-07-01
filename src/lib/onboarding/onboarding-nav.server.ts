import { getPgPool } from "@/lib/pg.server";
import { assetPublicUrl, type AssetBucket } from "@/lib/asset-storage.shared";
import { getLearnerVisibleCoursesForUser } from "@/lib/learn-access.server";

export interface OnboardingNavSection {
  id: string;
  title: string;
  courseId: string;
  classId: string;
  completed: boolean;
}

export interface OnboardingNavCourse {
  id: string;
  title: string;
  isCore: boolean;
  progressPct: number;
  sections: OnboardingNavSection[];
}

export interface OnboardingNavTree {
  coreCourses: OnboardingNavCourse[];
  roleCourses: OnboardingNavCourse[];
}

export interface LearnerDashboardStats {
  totalModules: number;
  completed: number;
  inProgress: number;
  overdueAssessments: number;
  resumeCourseId: string | null;
  resumeSectionId: string | null;
  items: Array<{
    id: string;
    title: string;
    subtitle: string;
    status: "not_started" | "in_progress" | "completed" | "overdue" | "pending_assessment";
    href: string;
  }>;
}

export async function buildOnboardingNavForUser(userId: string): Promise<OnboardingNavTree> {
  const pool = getPgPool();
  const coursesRes = { rows: await getLearnerVisibleCoursesForUser(userId) };

  const progressRes = await pool.query<{ section_id: string }>(
    `SELECT section_id FROM learner_item_progress
     WHERE user_id = $1 AND status = 'completed'`,
    [userId],
  );
  const completedSections = new Set(progressRes.rows.map((r) => r.section_id));

  const activityRes = await pool.query<{ section_id: string | null }>(
    `SELECT section_id FROM study_activity WHERE user_id = $1`,
    [userId],
  );
  const visitedSections = new Set([
    ...completedSections,
    ...activityRes.rows.map((r) => r.section_id).filter(Boolean) as string[],
  ]);

  const buildCourse = async (course: {
    id: string;
    title: string;
    is_core_onboarding: boolean;
  }): Promise<OnboardingNavCourse> => {
    const sectionsRes = await pool.query<{
      id: string;
      title: string;
      class_id: string;
    }>(
      `SELECT s.id, s.title, s.class_id
       FROM sections s
       JOIN classes c ON c.id = s.class_id
       WHERE c.course_id = $1 AND c.status = 'published'
       ORDER BY c.position ASC, s.position ASC`,
      [course.id],
    );
    const sections = sectionsRes.rows.map((s) => ({
      id: s.id,
      title: s.title,
      courseId: course.id,
      classId: s.class_id,
      completed: visitedSections.has(s.id),
    }));
    const done = sections.filter((s) => s.completed).length;
    const progressPct = sections.length
      ? Math.round((done / sections.length) * 100)
      : 0;
    return {
      id: course.id,
      title: course.title,
      isCore: course.is_core_onboarding,
      progressPct,
      sections,
    };
  };

  const all = (await Promise.all(coursesRes.rows.map(buildCourse))).filter(
    (c) => c.sections.length > 0,
  );
  return {
    coreCourses: all.filter((c) => c.isCore),
    roleCourses: all.filter((c) => !c.isCore),
  };
}

export async function fetchLearnerDashboardStats(userId: string): Promise<LearnerDashboardStats> {
  const pool = getPgPool();
  const nav = await buildOnboardingNavForUser(userId);

  const assignmentsRes = await pool.query<{
    id: string;
    status: string;
    due_at: string;
    assessment_title: string;
    course_title: string | null;
    course_id: string | null;
  }>(
    `SELECT aa.id, aa.status, aa.due_at, a.title AS assessment_title, c.title AS course_title, aa.course_id
     FROM assessment_assignments aa
     JOIN assessments a ON a.id = aa.assessment_id
     LEFT JOIN courses c ON c.id = aa.course_id
     WHERE aa.learner_user_id = $1
     ORDER BY aa.due_at ASC`,
    [userId],
  );

  const courseProgress = new Map<string, { total: number; done: number }>();
  for (const c of [...nav.coreCourses, ...nav.roleCourses]) {
    courseProgress.set(c.id, {
      total: c.sections.length,
      done: c.sections.filter((s) => s.completed).length,
    });
  }

  const assignmentsByCourse = new Map<string, typeof assignmentsRes.rows>();
  for (const a of assignmentsRes.rows) {
    if (!a.course_id) continue;
    const list = assignmentsByCourse.get(a.course_id) ?? [];
    list.push(a);
    assignmentsByCourse.set(a.course_id, list);
  }

  const allSections = [...nav.coreCourses, ...nav.roleCourses].flatMap((c) =>
    c.sections.map((s) => ({ ...s, courseTitle: c.title })),
  );
  const completed = allSections.filter((s) => s.completed).length;
  const inProgress = allSections.filter((s) => !s.completed).length;
  const now = Date.now();
  const overdue = assignmentsRes.rows.filter(
    (a) => a.status !== "passed" && new Date(a.due_at).getTime() < now,
  ).length;

  const moduleItems = allSections.map((s) => {
    const cp = courseProgress.get(s.courseId);
    const courseAssignments = assignmentsByCourse.get(s.courseId) ?? [];
    const hasPendingAssessment = courseAssignments.some((a) => a.status !== "passed");
    const allSectionsDone = cp ? cp.done >= cp.total && cp.total > 0 : s.completed;

    let status: LearnerDashboardStats["items"][0]["status"] = "not_started";
    if (s.completed && allSectionsDone && hasPendingAssessment) status = "pending_assessment";
    else if (s.completed) status = "completed";
    else if (cp && cp.done > 0) status = "in_progress";
    else status = "not_started";

    return {
      id: s.id,
      title: s.title,
      subtitle: s.courseTitle,
      status,
      href: `/learn/guide/${s.courseId}/${s.id}`,
    };
  });

  const assessItems = assignmentsRes.rows.map((a) => {
    const isOverdue = a.status !== "passed" && new Date(a.due_at).getTime() < now;
    let status: LearnerDashboardStats["items"][0]["status"] = "pending_assessment";
    if (a.status === "passed") status = "completed";
    else if (isOverdue) status = "overdue";
    else if (a.status === "in_progress") status = "in_progress";
    return {
      id: a.id,
      title: a.assessment_title,
      subtitle: a.course_title ?? "Assessment",
      status,
      href: `/attempt/${a.id}`,
    };
  });

  const resumeRes = await pool.query<{
    last_learn_course_id: string | null;
    last_learn_section_id: string | null;
  }>(`SELECT last_learn_course_id, last_learn_section_id FROM profiles WHERE user_id = $1`, [
    userId,
  ]);

  return {
    totalModules: allSections.length,
    completed,
    inProgress,
    overdueAssessments: overdue,
    resumeCourseId: resumeRes.rows[0]?.last_learn_course_id ?? null,
    resumeSectionId: resumeRes.rows[0]?.last_learn_section_id ?? null,
    items: [...moduleItems, ...assessItems],
  };
}

export interface SectionContent {
  id: string;
  title: string;
  description: string;
  objectives: string;
  courseId: string;
  courseTitle: string;
  classId: string;
  className: string;
  headings: Array<{ id: string; text: string; level: number }>;
  assets: Array<{
    id: string;
    kind: string;
    label: string;
    url: string | null;
    storageBucket: string | null;
    storagePath: string | null;
    extractedText: string | null;
    /** Set when storage-backed asset exists in DB but signing or storage lookup failed. */
    unavailable?: boolean;
  }>;
}

export async function getSectionContentFromDb(
  courseId: string,
  sectionId: string,
): Promise<SectionContent | null> {
  const pool = getPgPool();
  const { rows } = await pool.query<{
    id: string;
    title: string;
    description: string;
    objectives: string;
    class_name: string;
    class_id: string;
    course_title: string;
  }>(
    `SELECT s.id, s.title, s.description, s.objectives, c.name AS class_name, c.id AS class_id,
            co.title AS course_title
     FROM sections s
     JOIN classes c ON c.id = s.class_id
     JOIN courses co ON co.id = c.course_id
     WHERE s.id = $1 AND co.id = $2`,
    [sectionId, courseId],
  );
  const sec = rows[0];
  if (!sec) return null;

  const assetsRes = await pool.query<{
    id: string;
    kind: string;
    file_name: string;
    storage_bucket: string | null;
    storage_path: string | null;
    external_url: string | null;
    extracted_text: string | null;
  }>(
    `SELECT id, kind, file_name, storage_bucket, storage_path, external_url, extracted_text
     FROM section_assets WHERE section_id = $1 ORDER BY created_at ASC`,
    [sectionId],
  );

  const headings: SectionContent["headings"] = [];
  const lines = [sec.description, sec.objectives].join("\n").split("\n");
  for (const line of lines) {
    const m = line.match(/^(#{1,3})\s+(.+)$/);
    if (m) {
      headings.push({
        id: m[2].toLowerCase().replace(/\s+/g, "-"),
        text: m[2],
        level: m[1].length,
      });
    }
  }

  return {
    id: sec.id,
    title: sec.title,
    description: sec.description,
    objectives: sec.objectives,
    courseId,
    courseTitle: sec.course_title,
    classId: sec.class_id,
    className: sec.class_name,
    headings,
    assets: assetsRes.rows.map((a) => ({
      id: a.id,
      kind: a.kind,
      label: a.file_name,
      url:
        a.external_url ??
        (a.storage_bucket && a.storage_path
          ? assetPublicUrl(a.storage_bucket as AssetBucket, a.storage_path)
          : null),
      storageBucket: a.storage_bucket,
      storagePath: a.storage_path,
      extractedText: a.extracted_text,
    })),
  };
}
