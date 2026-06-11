import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireDbAuth } from "@/integrations/neon/auth-middleware";
import { ALLOWED_EMAIL_DOMAIN } from "@/lib/auth-constants";
import type { InviteRole } from "@/lib/invites.shared";
import { requireAdminUserId } from "@/lib/auth-token.server";
import { getServerConfig } from "@/lib/config.server";
import {
  buildInviteUrl,
  createInviteRecord,
  listInvites,
  previewInviteToken,
  refreshInvite,
  revokeInviteById,
  revokeInvitesByIds,
  updateInviteRoleById,
  updateInvitesRoleByIds,
} from "@/lib/invites.server";

function assertCintaraEmail(email: string): string {
  const normalized = email.trim().toLowerCase();
  if (!normalized.endsWith(`@${ALLOWED_EMAIL_DOMAIN}`)) {
    throw new Error(`Invites must use an @${ALLOWED_EMAIL_DOMAIN} email address`);
  }
  return normalized;
}

async function queueInviteEmail(invite: {
  id: string;
  email: string;
  role: string;
  token: string;
}): Promise<{ ok: boolean; error?: string; processed?: number }> {
  const { sendInviteEmail } = await import("@/lib/email/triggers.server");
  const result = await sendInviteEmail({
    inviteId: invite.id,
    email: invite.email,
    role: invite.role,
    token: invite.token,
  });
  if (!result.ok) {
    throw new Error(result.error ?? "Failed to queue invite email");
  }
  return result;
}

export const listInvitesFn = createServerFn({ method: "POST" })
  .middleware([requireDbAuth])
  .handler(async () => {
    await requireAdminUserId();
    return listInvites();
  });

const CreateInviteInput = z.object({
  email: z.string().email(),
  role: z.enum(["admin", "trainer", "trainee"]),
  department: z.string().nullable().optional(),
});

export const createInviteFn = createServerFn({ method: "POST" })
  .middleware([requireDbAuth])
  .inputValidator((data: unknown) => CreateInviteInput.parse(data))
  .handler(async ({ data }) => {
    const adminId = await requireAdminUserId();
    const email = assertCintaraEmail(data.email);
    const invite = await createInviteRecord({
      email,
      role: data.role,
      department: data.department ?? null,
      invitedBy: adminId,
    });
    const emailResult = await queueInviteEmail(invite);
    const { appBaseUrl } = getServerConfig();
    return {
      invite,
      link: buildInviteUrl(appBaseUrl, invite),
      emailSent: emailResult.processed ? true : emailResult.ok,
      emailProcessed: emailResult.processed ?? 0,
    };
  });

export const revokeInviteFn = createServerFn({ method: "POST" })
  .middleware([requireDbAuth])
  .inputValidator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data }) => {
    await requireAdminUserId();
    await revokeInviteById(data.id);
    return { ok: true };
  });

export const revokeInvitesFn = createServerFn({ method: "POST" })
  .middleware([requireDbAuth])
  .inputValidator((data: unknown) => z.object({ ids: z.array(z.string().uuid()) }).parse(data))
  .handler(async ({ data }) => {
    await requireAdminUserId();
    await revokeInvitesByIds(data.ids);
    return { ok: true };
  });

export const updateInviteRoleFn = createServerFn({ method: "POST" })
  .middleware([requireDbAuth])
  .inputValidator((data: unknown) =>
    z.object({ id: z.string().uuid(), role: z.enum(["admin", "trainer", "trainee"]) }).parse(data),
  )
  .handler(async ({ data }) => {
    await requireAdminUserId();
    await updateInviteRoleById(data.id, data.role);
    return { ok: true };
  });

export const updateInvitesRoleFn = createServerFn({ method: "POST" })
  .middleware([requireDbAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        ids: z.array(z.string().uuid()),
        role: z.enum(["admin", "trainer", "trainee"]),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    await requireAdminUserId();
    await updateInvitesRoleByIds(data.ids, data.role);
    return { ok: true };
  });

export const resendInviteFn = createServerFn({ method: "POST" })
  .middleware([requireDbAuth])
  .inputValidator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data }) => {
    await requireAdminUserId();
    const invite = await refreshInvite(data.id);
    const emailResult = await queueInviteEmail(invite);
    const { appBaseUrl } = getServerConfig();
    return {
      invite,
      link: buildInviteUrl(appBaseUrl, invite),
      emailSent: emailResult.processed ? true : emailResult.ok,
      emailProcessed: emailResult.processed ?? 0,
    };
  });

/** Public preview for the sign-in page (token acts as secret). */
export const previewInviteFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z
      .object({
        token: z.string().min(8),
        email: z.string().email().optional(),
      })
      .parse(data ?? {}),
  )
  .handler(async ({ data }) => previewInviteToken(data.token, data.email));

export type { InviteRole };
