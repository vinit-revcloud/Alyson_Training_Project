import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireDbAuth } from "@/integrations/neon/auth-middleware";
import { getPgPool } from "@/lib/pg.server";
import { assertLearnerCourseAccess } from "@/lib/learn-access.server";
import { userHasContentManagerRole } from "@/lib/content-manager.server";
import {
  acknowledgePolicyInDb,
  countPendingPoliciesForUser,
  listPoliciesForUserFromDb,
} from "./policy.server";
import { signAssetUrl } from "@/lib/asset-signing.server";
import type { AssetBucket } from "@/lib/asset-storage.shared";
import {
  buildOnboardingNavForUser,
  fetchLearnerDashboardStats,
  getSectionContentFromDb,
  type SectionContent,
} from "./onboarding-nav.server";

async function signSectionContentAssets(section: SectionContent): Promise<SectionContent> {
  const assets = await Promise.all(
    section.assets.map(async (asset) => {
      if (!asset.storageBucket || !asset.storagePath) return asset;
      try {
        const url = await signAssetUrl(
          asset.storageBucket as AssetBucket,
          asset.storagePath,
        );
        return { ...asset, url, unavailable: false };
      } catch {
        return { ...asset, url: null, unavailable: true };
      }
    }),
  );
  return { ...section, assets };
}

export const getOnboardingNavFn = createServerFn({ method: "POST" })
  .middleware([requireDbAuth])
  .handler(async ({ context }) => buildOnboardingNavForUser(context.userId));

export const getLearnerDashboardFn = createServerFn({ method: "POST" })
  .middleware([requireDbAuth])
  .handler(async ({ context }) => fetchLearnerDashboardStats(context.userId));

export const getSectionContentFn = createServerFn({ method: "POST" })
  .middleware([requireDbAuth])
  .inputValidator((d: unknown) =>
    z.object({ courseId: z.string().uuid(), sectionId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertLearnerCourseAccess(context.userId, data.courseId);
    if (!(await userHasContentManagerRole(context.userId))) {
      const pool = getPgPool();
      const { rowCount } = await pool.query(
        `SELECT 1 FROM sections s
         JOIN classes c ON c.id = s.class_id
         WHERE s.id = $1 AND c.course_id = $2 AND c.status = 'published'
         LIMIT 1`,
        [data.sectionId, data.courseId],
      );
      if (!rowCount) throw new Error("You do not have access to this course");
    }
    const section = await getSectionContentFromDb(data.courseId, data.sectionId);
    if (!section) return null;
    return signSectionContentAssets(section);
  });

export const markSectionVisitedFn = createServerFn({ method: "POST" })
  .middleware([requireDbAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        courseId: z.string().uuid(),
        classId: z.string().uuid(),
        sectionId: z.string().uuid(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertLearnerCourseAccess(context.userId, data.courseId);
    const pool = getPgPool();
    await pool.query(
      `INSERT INTO study_activity (user_id, course_id, class_id, section_id, card_key, seconds_spent)
       VALUES ($1, $2, $3, $4, $5, 30)`,
      [
        context.userId,
        data.courseId,
        data.classId,
        data.sectionId,
        `section-${data.sectionId}`,
      ],
    );

    await pool.query(
      `INSERT INTO section_progress (user_id, section_id, course_id, class_id, completed_at)
       VALUES ($1, $2, $3, $4, now())
       ON CONFLICT (user_id, section_id) DO UPDATE SET completed_at = now()`,
      [context.userId, data.sectionId, data.courseId, data.classId],
    );

    await pool.query(
      `UPDATE profiles SET last_learn_course_id = $2, last_learn_section_id = $3 WHERE user_id = $1`,
      [context.userId, data.courseId, data.sectionId],
    );

    const pathRes = await pool.query<{ id: string }>(
      `SELECT id FROM learner_path_assignments
       WHERE user_id = $1 AND course_id = $2 LIMIT 1`,
      [context.userId, data.courseId],
    );

    await pool.query(
      `INSERT INTO learner_item_progress (
         user_id, section_id, course_id, class_id, path_assignment_id,
         status, started_at, last_visited_at, completed_at
       ) VALUES ($1, $2, $3, $4, $5, 'completed', now(), now(), now())
       ON CONFLICT (user_id, section_id) DO UPDATE SET
         status = 'completed',
         last_visited_at = now(),
         completed_at = COALESCE(learner_item_progress.completed_at, now()),
         updated_at = now()`,
      [
        context.userId,
        data.sectionId,
        data.courseId,
        data.classId,
        pathRes.rows[0]?.id ?? null,
      ],
    );

    await pool.query(
      `UPDATE learner_path_assignments
       SET status = CASE
         WHEN (
           SELECT COUNT(*) FROM sections s
           JOIN classes c ON c.id = s.class_id
           WHERE c.course_id = learner_path_assignments.course_id
             AND c.status = 'published'
         ) <= (
           SELECT COUNT(*) FROM learner_item_progress lip
           WHERE lip.user_id = learner_path_assignments.user_id
             AND lip.course_id = learner_path_assignments.course_id
             AND lip.status = 'completed'
         ) THEN 'completed'
         ELSE 'in_progress'
       END,
       completed_at = CASE
         WHEN (
           SELECT COUNT(*) FROM sections s
           JOIN classes c ON c.id = s.class_id
           WHERE c.course_id = learner_path_assignments.course_id
             AND c.status = 'published'
         ) <= (
           SELECT COUNT(*) FROM learner_item_progress lip
           WHERE lip.user_id = learner_path_assignments.user_id
             AND lip.course_id = learner_path_assignments.course_id
             AND lip.status = 'completed'
         ) THEN COALESCE(learner_path_assignments.completed_at, now())
         ELSE NULL
       END,
       updated_at = now()
       WHERE user_id = $1 AND course_id = $2`,
      [context.userId, data.courseId],
    );

    return { ok: true as const };
  });

export const listPoliciesFn = createServerFn({ method: "POST" })
  .middleware([requireDbAuth])
  .handler(async ({ context }) => listPoliciesForUserFromDb(context.userId));

export const acknowledgePolicyFn = createServerFn({ method: "POST" })
  .middleware([requireDbAuth])
  .inputValidator((d: unknown) => z.object({ policyId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await acknowledgePolicyInDb({ userId: context.userId, policyId: data.policyId });
    return { ok: true as const };
  });

export const getPendingPolicyCountFn = createServerFn({ method: "POST" })
  .middleware([requireDbAuth])
  .handler(async ({ context }) => ({
    pending: await countPendingPoliciesForUser(context.userId),
  }));
