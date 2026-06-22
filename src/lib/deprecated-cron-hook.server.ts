import { authorizeCronRequest } from "@/lib/cron-auth.server";

const DEPRECATION_HEADERS = {
  Deprecation: "true",
  Sunset: "2026-12-31",
  Link: '</api/internal/cron/tick>; rel="successor-version"',
} as const;

/** Legacy `/api/public/hooks/*` — still runs when authorized; prefer `/api/internal/cron/tick`. */
export async function handleDeprecatedCronHook(
  request: Request,
  run: () => Promise<Record<string, unknown>>,
): Promise<Response> {
  if (!authorizeCronRequest(request)) {
    return new Response("Unauthorized", { status: 401 });
  }
  const result = await run();
  return Response.json(
    {
      ok: true,
      ...result,
      deprecated: true,
      message: "This hook is deprecated — use POST /api/internal/cron/tick",
      replacement: "/api/internal/cron/tick",
    },
    { headers: DEPRECATION_HEADERS },
  );
}
