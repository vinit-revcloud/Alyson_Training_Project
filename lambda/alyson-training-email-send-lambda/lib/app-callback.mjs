export async function recordSendResult(body) {
  const baseUrl = (process.env.APP_BASE_URL || "").replace(/\/$/, "");
  const secret = process.env.CRON_SECRET;
  if (!baseUrl || !secret) {
    console.warn("[email-lambda] APP_BASE_URL or CRON_SECRET missing — skipping send-result callback");
    return;
  }

  const res = await fetch(`${baseUrl}/api/internal/email/send-result`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${secret}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`send-result callback failed (${res.status}): ${text}`);
  }
}
