# AWS EventBridge — Email cron tick

The app exposes a single endpoint that runs due notification schedules and drains the email queue via SES:

```
POST https://<APP_BASE_URL>/api/internal/cron/tick
Authorization: Bearer <CRON_SECRET>
```

Configure **one** EventBridge rule to call this every **5 minutes**. Daily reminders (`0 9 * * *`) and escalations are evaluated inside the app from `notification_schedules` (UTC).

## Prerequisites

- App deployed with env vars: `APP_BASE_URL`, `CRON_SECRET`, `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`
- SES identity verified for `training.group@cintara.ai` (or domain `cintara.ai`)
- `npm run db:apply-email-queue-fix` applied on Neon

## Option A — EventBridge Scheduler (recommended)

1. Open **Amazon EventBridge** → **Schedules** → **Create schedule**
2. **Name:** `alyson-email-cron-tick`
3. **Schedule pattern:** Recurring → **Rate-based** → `5 minutes`
4. **Target:** **Universal target** → **API destination** (or Lambda proxy — see Option B)
5. For **API Gateway / HTTP** target (if your host supports direct HTTP):
   - Method: `POST`
   - URL: `https://<APP_BASE_URL>/api/internal/cron/tick`
   - Header: `Authorization` = `Bearer <CRON_SECRET>`

## Option B — EventBridge rule + Lambda (HTTP POST)

If your host is not a native EventBridge API destination, use a small Lambda:

```javascript
export const handler = async () => {
  const res = await fetch(process.env.CRON_TICK_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` },
  });
  const body = await res.text();
  if (!res.ok) throw new Error(`${res.status} ${body}`);
  return { statusCode: 200, body };
};
```

Lambda environment:

- `CRON_TICK_URL` = `https://<APP_BASE_URL>/api/internal/cron/tick`
- `CRON_SECRET` = same as app env

EventBridge rule: `rate(5 minutes)` → Lambda target.

## Option C — Manual / CI fallback

From your machine or CI (with app running or deployed):

```bash
npm run email:cron
```

Uses `APP_BASE_URL` and `CRON_SECRET` from `.env`.

## Verify

1. `npm run email:verify-aws`
2. `npm run email:cron` → expect `200` and JSON with `jobs` and `queue`
3. Admin → **Notifications** → queue depth should drop after tick
4. CloudWatch / EventBridge **Invocation metrics** show successes

## Optional — SES bounce webhook

1. Create SNS topic for SES events (bounce, complaint, delivery)
2. Subscribe HTTPS endpoint: `https://<APP_BASE_URL>/api/webhooks/ses`
3. Confirm subscription (app auto-confirms via `SubscribeURL` fetch)

## Schedule timezone

Cron expressions in **Notifications → Schedules** are interpreted in **UTC**. Example: `0 9 * * *` = 09:00 UTC daily.
