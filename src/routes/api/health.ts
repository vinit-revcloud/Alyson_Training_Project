import { createFileRoute } from "@tanstack/react-router";
import { getPgPool } from "@/lib/pg.server";
import { assetStorageBackend } from "@/lib/asset-storage.server";
import { getNeonAuthUrl } from "@/integrations/neon/env";
import { getDeepSeekApiKey, getOpenRouterApiKey, getSesConfig } from "@/lib/config.server";

export const Route = createFileRoute("/api/health")({
  server: {
    handlers: {
      GET: async () => {
        const checks: Record<string, boolean | string> = {
          service: true,
          timestamp: new Date().toISOString(),
        };

        try {
          const pool = getPgPool();
          await pool.query("SELECT 1");
          checks.database = true;
        } catch {
          checks.database = false;
        }

        try {
          const jwksUrl = `${getNeonAuthUrl().replace(/\/$/, "")}/.well-known/jwks.json`;
          const res = await fetch(jwksUrl, { signal: AbortSignal.timeout(5000) });
          checks.neonAuthJwks = res.ok;
        } catch {
          checks.neonAuthJwks = false;
        }

        checks.storage = assetStorageBackend();
        checks.blobConfigured = Boolean(process.env.BLOB_READ_WRITE_TOKEN?.trim());
        checks.sesConfigured = Boolean(getSesConfig().region);
        checks.aiConfigured = Boolean(getDeepSeekApiKey() || getOpenRouterApiKey());
        checks.poolMax = process.env.PG_POOL_MAX ?? (process.env.VERCEL ? "2" : "5");

        const ok =
          checks.database === true &&
          checks.neonAuthJwks === true;

        return Response.json({ ok, checks }, { status: ok ? 200 : 503 });
      },
    },
  },
});
