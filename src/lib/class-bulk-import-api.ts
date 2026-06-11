import { bulkImportClassesFn } from "@/lib/class-bulk-import.functions";
import type { BulkImportPayload } from "@/lib/class-bulk-import.shared";

export async function bulkImportClasses(payload: BulkImportPayload) {
  return bulkImportClassesFn({ data: payload });
}
