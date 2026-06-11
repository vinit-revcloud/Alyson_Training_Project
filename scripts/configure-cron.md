# Scheduled jobs (external cron)

Neon does not provide Supabase-style `pg_cron`. Run these HTTP jobs from your deployment platform.

Replace `YOUR_APP_BASE_URL` and `YOUR_CRON_SECRET` before use.

## Email queue processor (every 2 minutes)

```bash
curl -X POST "YOUR_APP_BASE_URL/api/internal/email/process" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_CRON_SECRET" \
  -d "{}"
```

## Daily reminders (09:00 UTC)

```bash
curl -X POST "YOUR_APP_BASE_URL/api/public/hooks/daily-reminders" \
  -H "Content-Type: application/json" \
  -H "apikey: YOUR_CRON_SECRET" \
  -d "{}"
```

## Escalations (10:00 UTC)

```bash
curl -X POST "YOUR_APP_BASE_URL/api/public/hooks/escalations" \
  -H "Content-Type: application/json" \
  -H "apikey: YOUR_CRON_SECRET" \
  -d "{}"
```

## Retry failed (every 15 minutes)

```bash
curl -X POST "YOUR_APP_BASE_URL/api/public/hooks/retry-failed" \
  -H "Content-Type: application/json" \
  -H "apikey: YOUR_CRON_SECRET" \
  -d "{}"
```

On AWS, map these to EventBridge rules or a small Lambda scheduler.
