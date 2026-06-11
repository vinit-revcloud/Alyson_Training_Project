import { processEmailQueue } from "@/lib/email/process-queue";

/** When EMAIL_AUTO_PROCESS=1, drain the queue after enqueue (handy in local dev). */
export async function maybeProcessEmailQueue(): Promise<void> {
  if (process.env.EMAIL_AUTO_PROCESS !== "1") return;
  try {
    await processEmailQueue();
  } catch (err) {
    console.warn("[email] auto-process failed", err);
  }
}

export async function processEmailQueueNow(): Promise<{ processed: number; stopped?: string }> {
  return processEmailQueue();
}
