import { createServerFn } from "@tanstack/react-start";
import { requireDbAuth } from "@/integrations/neon/auth-middleware";
import { getPgPool } from "@/lib/pg.server";

export const countProfilesFn = createServerFn({ method: "GET" })
  .middleware([requireDbAuth])
  .handler(async () => {
    const pool = getPgPool();
    const { rows } = await pool.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM profiles`,
    );
    return Number(rows[0]?.count ?? 0);
  });
