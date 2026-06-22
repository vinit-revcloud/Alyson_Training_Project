import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireContentManager, requireDbAuth } from "@/integrations/neon/auth-middleware";
import { getLearner360FromDb, type Learner360Data } from "@/lib/learner-360.server";

const UserIdSchema = z.object({ userId: z.string().uuid() });

export const getLearner360Fn = createServerFn({ method: "POST" })
  .middleware([requireDbAuth, requireContentManager])
  .inputValidator((data: unknown) => UserIdSchema.parse(data))
  .handler(async ({ data }): Promise<Learner360Data | null> =>
    getLearner360FromDb(data.userId),
  );
