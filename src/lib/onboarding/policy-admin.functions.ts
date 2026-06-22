import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireContentManager, requireDbAuth } from "@/integrations/neon/auth-middleware";
import {
  listAdminPoliciesFromDb,
  publishPolicyInDb,
  uploadPolicyPdfInDb,
  upsertPolicyInDb,
  type AdminPolicyRow,
} from "@/lib/onboarding/policy-admin.server";

const UpsertSchema = z.object({
  id: z.string().uuid().optional(),
  slug: z.string().min(1).max(120),
  title: z.string().min(1).max(200),
  summary: z.string().max(2000).default(""),
  content: z.string().max(100_000).default(""),
  requiresAcknowledgement: z.boolean().default(true),
  status: z.enum(["draft", "published", "archived"]).default("draft"),
  sortOrder: z.number().int().min(0).default(0),
});

const PolicyIdSchema = z.object({ policyId: z.string().uuid() });

const UploadSchema = z.object({
  policyId: z.string().uuid(),
  fileName: z.string().min(1),
  base64: z.string().min(1),
});

export const listAdminPoliciesFn = createServerFn({ method: "GET" })
  .middleware([requireDbAuth, requireContentManager])
  .handler(async (): Promise<AdminPolicyRow[]> => listAdminPoliciesFromDb());

export const upsertPolicyFn = createServerFn({ method: "POST" })
  .middleware([requireDbAuth, requireContentManager])
  .inputValidator((data: unknown) => UpsertSchema.parse(data))
  .handler(async ({ data }): Promise<{ id: string }> => {
    const id = await upsertPolicyInDb(data);
    return { id };
  });

export const uploadPolicyPdfFn = createServerFn({ method: "POST" })
  .middleware([requireDbAuth, requireContentManager])
  .inputValidator((data: unknown) => UploadSchema.parse(data))
  .handler(async ({ data }) => {
    const buf = Buffer.from(data.base64, "base64");
    return uploadPolicyPdfInDb({
      policyId: data.policyId,
      fileName: data.fileName,
      data: buf,
    });
  });

export const publishPolicyFn = createServerFn({ method: "POST" })
  .middleware([requireDbAuth, requireContentManager])
  .inputValidator((data: unknown) => PolicyIdSchema.parse(data))
  .handler(async ({ data }) => {
    await publishPolicyInDb(data.policyId);
    return { ok: true };
  });
