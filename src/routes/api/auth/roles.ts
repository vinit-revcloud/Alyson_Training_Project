import { createFileRoute } from "@tanstack/react-router";
import { getUserRoles } from "@/lib/auth-bootstrap.server";
import { userFromRequest } from "@/lib/auth-token.server";

export const Route = createFileRoute("/api/auth/roles")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const authUser = await userFromRequest(request);
          const roles = await getUserRoles(authUser.id);
          return Response.json({ roles, userId: authUser.id, email: authUser.email });
        } catch (err) {
          const message = err instanceof Error ? err.message : "Unauthorized";
          const status = message.includes("Unauthorized") ? 401 : 500;
          return Response.json({ error: message }, { status });
        }
      },
    },
  },
});
