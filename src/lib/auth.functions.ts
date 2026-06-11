import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { bootstrapUserAccount, getUserRoles } from "@/lib/auth-bootstrap.server";
import { userFromRequest } from "@/lib/auth-token.server";

const BootstrapInput = z.object({
  inviteToken: z.string().min(8).max(128).optional(),
  displayName: z.string().max(200).optional(),
});

/** Create/update profile and assign roles after Neon Auth sign-in. */
export const bootstrapAuthUser = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => BootstrapInput.parse(data ?? {}))
  .handler(async ({ data }) => {
    const authUser = await userFromRequest();
    const displayName =
      data.displayName?.trim() ||
      authUser.email.split("@")[0] ||
      "User";

    const roles = await bootstrapUserAccount({
      userId: authUser.id,
      email: authUser.email,
      displayName,
      inviteToken: data.inviteToken,
    });

    return { userId: authUser.id, email: authUser.email, roles };
  });

/** Read roles for the signed-in user (via Postgres, not Data API). */
export const fetchMyRoles = createServerFn({ method: "GET" }).handler(async () => {
  const authUser = await userFromRequest();
  const roles = await getUserRoles(authUser.id);
  return { roles };
});
