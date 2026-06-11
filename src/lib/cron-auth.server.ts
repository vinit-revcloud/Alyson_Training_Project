/** Authorize cron / internal hook requests via CRON_SECRET. */
export function authorizeCronRequest(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const apikey = request.headers.get("apikey");
  const auth = request.headers.get("authorization");
  return apikey === secret || auth === `Bearer ${secret}`;
}

export function cronSecretConfigured(): boolean {
  return Boolean(process.env.CRON_SECRET?.trim());
}
