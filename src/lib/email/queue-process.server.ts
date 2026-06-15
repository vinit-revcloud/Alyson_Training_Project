import { processEmailQueue } from "@/lib/email/process-queue";

/**
 * Dev-only auto-drain after enqueue. Production uses AWS Step Functions — never call
 * from assignment/retake/cron paths. Gated by EMAIL_AUTO_PROCESS=1.
 */
export async function maybeProcessEmailQueue(): Promise<void> {
  if (process.env.EMAIL_AUTO_PROCESS !== "1") return;
  try {
    await processEmailQueue();
  } catch (err) {
    console.warn("[email] auto-process failed", err);
  }
}

/** Manual queue drain — Settings / Notifications admin buttons and dev API only. */
export async function processEmailQueueNow(): Promise<{ processed: number; stopped?: string }> {
  return processEmailQueue();
}
