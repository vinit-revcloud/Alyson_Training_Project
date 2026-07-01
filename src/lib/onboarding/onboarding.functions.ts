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
  markSectionVisitedInDb,
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
    await markSectionVisitedInDb({
      userId: context.userId,
      courseId: data.courseId,
      classId: data.classId,
      sectionId: data.sectionId,
    });
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
