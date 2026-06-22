import { createFileRoute } from "@tanstack/react-router";
import { previewInviteToken } from "@/lib/invites.server";

export const Route = createFileRoute("/api/invites/preview")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const token = url.searchParams.get("token")?.trim();
        const email = url.searchParams.get("email")?.trim().toLowerCase();
        if (!token) {
          return Response.json({ valid: false, reason: "not_found" }, { status: 400 });
        }
        const preview = await previewInviteToken(token, email || undefined);
        return Response.json(preview, {
          headers: { "Cache-Control": "private, max-age=60" },
        });
      },
    },
  },
});
