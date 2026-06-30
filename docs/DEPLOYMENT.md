# Alyson Training — Deployment Guide

## Versioning

This app uses [Semantic Versioning](https://semver.org/) in `package.json` (`version` field).

| Change type | Version bump | Example |
|-------------|--------------|---------|
| Bug fix, no schema change | PATCH (`1.0.0` → `1.0.1`) | Email template fix |
| New feature, backward compatible | MINOR (`1.0.0` → `1.1.0`) | New admin report |
| Breaking API / schema change | MAJOR (`1.0.0` → `2.0.0`) | Auth or DB redesign |

**Release workflow**

1. Apply any new SQL from `db/` (see schema order below).
2. Bump `package.json` version and tag: `git tag v1.0.0`.
3. Set production env vars on the host (see below).
4. Build with `VITE_*` vars present: `npm run build`.
5. Run `NODE_ENV=production npm run validate:deploy -- --production`.
6. Deploy and smoke-test auth, email cron, and one interview flow.

Database schema is **not** auto-versioned — track applied scripts in your runbook (Neon branch name + date + script names).

---

## Environment variables

Copy `.env.example` to `.env` for local dev. **Never commit `.env`** (it is gitignored).

| Variable | Required | Description |
|----------|----------|-------------|
| `VITE_NEON_AUTH_URL` | Yes | Neon Auth URL — **baked in at build time** |
| `VITE_NEON_DATA_API_URL` | Yes | Neon Data API REST URL — **baked in at build time** |
| `NEON_AUTH_URL` | Optional | Server fallback for Neon Auth |
| `NEON_DATA_API_URL` | Optional | Server fallback for Data API |
| `DATABASE_URL` | Yes | Direct Postgres (schema apply, admin SQL) |
| `CRON_SECRET` | Yes | Auth for cron hooks + asset URL signing |
| `ASSET_SIGNING_SECRET` | Optional | Separate HMAC secret for asset URLs (defaults to `CRON_SECRET`) |
| `APP_BASE_URL` | Yes | Public HTTPS origin (email links, cron) |
| `BOOTSTRAP_ADMIN_EMAILS` | Optional | Comma-separated initial admins; **empty in production** after bootstrap |
| `AWS_REGION` | Yes | SES region (`us-west-2` — must match verified identity) |
| `SES_REGION` | Optional | Overrides `AWS_REGION` for SES only (use if split regions) |
| `AWS_ACCESS_KEY_ID` | Yes | IAM user for SES |
| `AWS_SECRET_ACCESS_KEY` | Yes | IAM secret |
| `SES_FROM_NAME` | Yes | Display name (`Cintara Training`) — From address is hardcoded |
| `SES_CONFIGURATION_SET` | Recommended | `alyson-training` |
| `DEEPSEEK_API_KEY` | Yes* | AI class + question generation |
| `OPENROUTER_API_KEY` | Yes* | Fallback AI + paper test vision grading |
| `OPENROUTER_MODEL` | Optional | Default `deepseek/deepseek-chat` |
| `OPENROUTER_VISION_MODEL` | Optional | Default `google/gemini-2.0-flash-001` |
| `EMAIL_AUTO_PROCESS` | Dev only | Set `1` locally; **unset or `0` in production** |
| `NODE_ENV` | Production | Set `production` on the host |

\*At least one of `DEEPSEEK_API_KEY` or `OPENROUTER_API_KEY` is required.

**Production checks:** the server calls `assertProductionConfig()` on startup when `NODE_ENV=production`.

---

## Pre-deploy checklist

```bash
npm install

# Apply DB schema (once per Neon project, in order)
npm run db:apply-all

# Or step-by-step:
# npm run db:apply
# npm run db:apply-interview
# ...

# Verify integrations
npm run auth:verify-env
npm run email:verify-aws
node scripts/audit-schema.mjs

# Validate env (strict)
NODE_ENV=production npm run validate:deploy -- --production

# Production build (VITE_* must be set)
npm run build
```

---

## Build & run

```bash
npm run build          # Nitro production bundle → .output/
PORT=4173 HOST=0.0.0.0 npm run start   # node .output/server/index.mjs
```

Health check: `GET /api/health` → `{ "ok": true, ... }`

Deploy to AWS App Runner, ECS, Railway, or any Node 20+ host. Mount persistent storage for `storage/` if you use uploaded class videos or interview paper photos (local disk is ephemeral on stateless hosts — plan S3 migration for scale).

**Note:** `npm run start:preview` runs Vite preview (dev dependency) — use only for local smoke tests. Production Docker and `npm run start` use the Nitro node-server bundle.

See [NEON_SETUP.md](./NEON_SETUP.md) for Neon project + Google OAuth. Auth: [AUTH.md](./AUTH.md). SES: [AWS_SES_SETUP.md](./AWS_SES_SETUP.md).

---

## Cron jobs

Schedule **one** tick every 5 minutes (recommended):

```
POST https://<APP_BASE_URL>/api/internal/cron/tick
Authorization: Bearer <CRON_SECRET>
```

See [infra/eventbridge-email-cron.md](../infra/eventbridge-email-cron.md).

Individual hooks (legacy) also accept `Authorization: Bearer <CRON_SECRET>` or `apikey: <CRON_SECRET>`:

| Job | Schedule | Endpoint |
|-----|----------|----------|
| Email queue | `*/2 * * * *` | `POST /api/internal/email/process` |
| Daily reminders | `0 9 * * *` | `POST /api/public/hooks/daily-reminders` |
| Escalations | `0 10 * * *` | `POST /api/public/hooks/escalations` |
| Retry failed | `*/15 * * * *` | `POST /api/public/hooks/retry-failed` |

---

## SES webhook

1. Create SNS topic for SES events (bounce, complaint, delivery).
2. Subscribe HTTPS: `https://<APP_BASE_URL>/api/webhooks/ses`
3. The app verifies SNS signatures and auto-confirms subscriptions.

---

## Docker (optional)

For self-hosted Node/Docker deployment (not Vercel), see below. **For Vercel, use [VERCEL_DEPLOY.md](./VERCEL_DEPLOY.md) instead.**

```bash
docker build \
  --build-arg VITE_NEON_AUTH_URL=... \
  --build-arg VITE_NEON_DATA_API_URL=... \
  -t alyson-training:1.0.0 .

docker run -p 4173:4173 --env-file .env.production \
  -v alyson-storage:/app/storage \
  alyson-training:1.0.0
```

Or: `docker compose up --build` (requires `.env.production` with build args exported for compose).

The image runs `node .output/server/index.mjs` — no devDependencies at runtime. Health check hits `/api/health`.

---

## HR rollout

After deploy, onboard hiring managers via `/invites` (role: **Hiring Manager**). Share [HR_ROLLOUT.md](./HR_ROLLOUT.md) with your HR team.

---

## Security notes

- Asset URLs require HMAC signatures in production (`CRON_SECRET` or `ASSET_SIGNING_SECRET`).
- Rotate secrets if `.env` was ever committed or shared.
- Remove `BOOTSTRAP_ADMIN_EMAILS` after first admin sign-in in production.
