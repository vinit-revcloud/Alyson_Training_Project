import { createFileRoute } from "@tanstack/react-router";
import { bootstrapUserAccount } from "@/lib/auth-bootstrap.server";
import { userFromRequest } from "@/lib/auth-token.server";

export const Route = createFileRoute("/api/auth/bootstrap")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const authUser = await userFromRequest(request);
          const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
          const inviteToken =
            typeof body.inviteToken === "string" && body.inviteToken.trim()
              ? body.inviteToken.trim()
              : undefined;
          const displayName =
            typeof body.displayName === "string" && body.displayName.trim()
              ? body.displayName.trim()
              : undefined;

          const roles = await bootstrapUserAccount({
            userId: authUser.id,
            email: authUser.email,
            displayName: displayName || authUser.email.split("@")[0] || "User",
            inviteToken,
          });

          return Response.json({
            userId: authUser.id,
            email: authUser.email,
            roles,
          });
        } catch (err) {
          const message = err instanceof Error ? err.message : "Bootstrap failed";
          const status = message.includes("Unauthorized")
            ? 401
            : message.includes("Forbidden") || message.includes("suspended")
              ? 403
              : 500;
          return Response.json({ error: message }, { status });
        }
      },
    },
  },
});
