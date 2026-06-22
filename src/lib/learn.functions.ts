import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireDbAuth } from "@/integrations/neon/auth-middleware";
import { getPgPool } from "@/lib/pg.server";
import type { LearnerAssignment, LearnerCourse, StudyCard } from "@/lib/learn-api";

export const listMyAssignmentsFn = createServerFn({ method: "POST" })
  .middleware([requireDbAuth])
  .inputValidator((data: unknown) => z.object({ userId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }): Promise<LearnerAssignment[]> => {
    if (data.userId !== context.userId) throw new Error("Forbidden");
    const pool = getPgPool();
    const { rows } = await pool.query<{
      id: string;
      status: string;
      mode: string;
      due_at: string;
      assigned_at: string;
      attempts_used: number;
      max_attempts: number;
      assessment_id: string;
      course_id: string | null;
    }>(
      `SELECT id, status, mode, due_at, assigned_at, attempts_used, max_attempts, assessment_id, course_id
       FROM assessment_assignments
       WHERE learner_user_id = $1
       ORDER BY due_at ASC`,
      [data.userId],
    );
    if (!rows.length) return [];

    const assessmentIds = [...new Set(rows.map((r) => r.assessment_id))];
    const courseIds = [...new Set(rows.map((r) => r.course_id).filter(Boolean))] as string[];

    const [assessmentsRes, coursesRes] = await Promise.all([
      pool.query<{ id: string; title: string; pass_mark: number }>(
        `SELECT id, title, pass_mark FROM assessments WHERE id = ANY($1::uuid[])`,
        [assessmentIds],
      ),
      courseIds.length
        ? pool.query<{ id: string; title: string }>(
            `SELECT id, title FROM courses WHERE id = ANY($1::uuid[])`,
            [courseIds],
          )
        : Promise.resolve({ rows: [] as { id: string; title: string }[] }),
    ]);

    const aMap = new Map(assessmentsRes.rows.map((a) => [a.id, a]));
    const cMap = new Map(coursesRes.rows.map((c) => [c.id, c]));

    return rows.map((r) => {
      const a = aMap.get(r.assessment_id);
      const c = r.course_id ? cMap.get(r.course_id) : null;
      return {
        id: r.id,
        status: r.status,
        mode: r.mode,
        due_at: r.due_at,
        assigned_at: r.assigned_at,
        attempts_used: r.attempts_used,
        max_attempts: r.max_attempts,
        assessment_title: a?.title ?? "Assessment",
        course_title: c?.title ?? null,
        pass_mark: a?.pass_mark ?? 75,
      };
    });
  });

export const listMyCoursesFn = createServerFn({ method: "POST" })
  .middleware([requireDbAuth])
  .inputValidator((data: unknown) => z.object({ userId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }): Promise<LearnerCourse[]> => {
    if (data.userId !== context.userId) throw new Error("Forbidden");
    const pool = getPgPool();
    const profileRes = await pool.query<{ department: string | null }>(
      `SELECT department FROM profiles WHERE user_id = $1`,
      [data.userId],
    );
    const dept = profileRes.rows[0]?.department;

    const coreRes = await pool.query<{ id: string }>(
      `SELECT id FROM courses WHERE is_core_onboarding = true AND status = 'published'`,
    );
    const deptRes = dept
      ? await pool.query<{ course_id: string }>(
          `SELECT course_id FROM course_departments WHERE department = $1`,
          [dept],
        )
      : { rows: [] as { course_id: string }[] };
    const courseIds = [
      ...new Set([
        ...deptRes.rows.map((r) => r.course_id),
        ...coreRes.rows.map((r) => r.id),
      ]),
    ];
    if (!courseIds.length) return [];

    const [coursesRes, classesRes, activityRes] = await Promise.all([
      pool.query<{ id: string; title: string; description: string | null; role: string | null }>(
        `SELECT id, title, description, role FROM courses WHERE id = ANY($1::uuid[])`,
        [courseIds],
      ),
      pool.query<{ id: string; course_id: string }>(
        `SELECT id, course_id FROM classes WHERE course_id = ANY($1::uuid[]) AND status = 'published'`,
        [courseIds],
      ),
      pool.query<{ course_id: string }>(
        `SELECT course_id FROM study_activity WHERE user_id = $1 AND course_id = ANY($2::uuid[])`,
        [data.userId, courseIds],
      ),
    ]);

    const classCount = new Map<string, number>();
    for (const c of classesRes.rows) {
      classCount.set(c.course_id, (classCount.get(c.course_id) ?? 0) + 1);
    }
    const activityCount = new Map<string, number>();
    for (const a of activityRes.rows) {
      activityCount.set(a.course_id, (activityCount.get(a.course_id) ?? 0) + 1);
    }

    return coursesRes.rows.map((c) => {
      const total = classCount.get(c.id) ?? 1;
      const done = activityCount.get(c.id) ?? 0;
      return {
        id: c.id,
        title: c.title,
        description: c.description,
        role: c.role,
        class_count: total,
        progress_pct: Math.min(100, Math.round((done / Math.max(total * 3, 1)) * 100)),
      };
    });
  });

const StudyActivityInput = z.object({
  userId: z.string().uuid(),
  courseId: z.string().uuid(),
  classId: z.string().uuid().optional(),
  sectionId: z.string().uuid().optional(),
  cardKey: z.string().min(1),
  secondsSpent: z.number().int().min(0).optional(),
});

export const recordStudyActivityFn = createServerFn({ method: "POST" })
  .middleware([requireDbAuth])
  .inputValidator((data: unknown) => StudyActivityInput.parse(data))
  .handler(async ({ data, context }) => {
    if (data.userId !== context.userId) throw new Error("Forbidden");
    const pool = getPgPool();
    await pool.query(
      `INSERT INTO study_activity (user_id, course_id, class_id, section_id, card_key, seconds_spent)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        data.userId,
        data.courseId,
        data.classId ?? null,
        data.sectionId ?? null,
        data.cardKey,
        data.secondsSpent ?? 30,
      ],
    );
    return { ok: true as const };
  });

export const getCourseStudyCardsFn = createServerFn({ method: "POST" })
  .middleware([requireDbAuth])
  .inputValidator((data: unknown) => z.object({ courseId: z.string().uuid() }).parse(data))
  .handler(async ({ data }): Promise<StudyCard[]> => {
    const pool = getPgPool();
    const classesRes = await pool.query<{ id: string; name: string; summary: string }>(
      `SELECT id, name, summary FROM classes
       WHERE course_id = $1 AND status = 'published'
       ORDER BY position ASC`,
      [data.courseId],
    );

    const cards: StudyCard[] = [];
    let cardIndex = 0;

    for (const cls of classesRes.rows) {
      const sectionsRes = await pool.query<{
        id: string;
        title: string;
        description: string;
        objectives: string;
      }>(
        `SELECT id, title, description, objectives FROM sections
         WHERE class_id = $1 ORDER BY position ASC`,
        [cls.id],
      );

      for (const sec of sectionsRes.rows) {
        cards.push({
          id: `content-${sec.id}`,
          type: "content",
          title: sec.title,
          body: [sec.description, sec.objectives].filter(Boolean).join("\n\n"),
          sectionId: sec.id,
          classId: cls.id,
        });
        cardIndex++;
        if (cardIndex % 7 === 0) {
          const qRes = await pool.query<{
            id: string;
            prompt: string;
            options: unknown;
            type: string;
          }>(
            `SELECT id, prompt, options, type FROM section_questions_safe
             WHERE section_id = $1 LIMIT 3`,
            [sec.id],
          );
          if (qRes.rows.length) {
            cards.push({
              id: `quiz-${sec.id}`,
              type: "quiz",
              title: `Quick check: ${sec.title}`,
              body: "Answer the questions below to reinforce this section.",
              sectionId: sec.id,
              classId: cls.id,
              questions: qRes.rows.map((q) => ({
                id: q.id,
                prompt: q.prompt,
                options: Array.isArray(q.options) ? (q.options as string[]) : null,
                type: q.type,
              })),
            });
          }
        }
      }
    }
    return cards;
  });
