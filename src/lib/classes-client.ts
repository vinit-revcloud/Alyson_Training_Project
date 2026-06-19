import { authenticatedFetch, readApiError } from "@/lib/authenticated-client";
import type { FinalizeClassInput, FinalizeClassResult } from "@/lib/class-finalize.functions";
import type { CreateClassDbInput, CreateClassDbResult } from "@/lib/class-create.server";

export async function apiCreateClassRecords(
  input: CreateClassDbInput,
): Promise<CreateClassDbResult> {
  const res = await authenticatedFetch("/api/classes/create", {
    method: "POST",
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(await readApiError(res));
  return res.json() as Promise<CreateClassDbResult>;
}

export async function apiFinalizeClass(input: FinalizeClassInput): Promise<FinalizeClassResult> {
  const res = await authenticatedFetch("/api/classes/finalize", {
    method: "POST",
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(await readApiError(res));
  return res.json() as Promise<FinalizeClassResult>;
}
