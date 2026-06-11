import { createServerFn } from "@tanstack/react-start";
import { requireContentManager } from "@/integrations/neon/auth-middleware";
import { BulkImportPayloadSchema } from "@/lib/class-bulk-import.shared";
import { bulkCreateClassesInCourseInDb } from "@/lib/class-bulk-import.server";

export const bulkImportClassesFn = createServerFn({ method: "POST" })
  .middleware([requireContentManager])
  .inputValidator((data: unknown) => BulkImportPayloadSchema.parse(data))
  .handler(async ({ data }) => bulkCreateClassesInCourseInDb(data));
