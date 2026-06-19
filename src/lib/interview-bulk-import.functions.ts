import { createServerFn } from "@tanstack/react-start";
import { requireContentManager } from "@/integrations/neon/auth-middleware";
import { BulkInterviewImportPayloadSchema } from "@/lib/interview-bulk-import.shared";
import { bulkImportInterviewSessionsInDb } from "@/lib/interview-bulk-import.server";

export const bulkImportInterviewSessionsFn = createServerFn({ method: "POST" })
  .middleware([requireContentManager])
  .inputValidator((data: unknown) => BulkInterviewImportPayloadSchema.parse(data))
  .handler(async ({ data, context }) =>
    bulkImportInterviewSessionsInDb(data, context.userId),
  );
