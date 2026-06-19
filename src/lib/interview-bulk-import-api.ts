import { bulkImportInterviewSessionsFn } from "@/lib/interview-bulk-import.functions";
import type { BulkInterviewImportPayload } from "@/lib/interview-bulk-import.shared";

export async function bulkImportInterviewSessions(payload: BulkInterviewImportPayload) {
  return bulkImportInterviewSessionsFn({ data: payload });
}
