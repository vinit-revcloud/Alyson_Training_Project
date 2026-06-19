# Deploy on Vercel

Step-by-step guide to deploy Alyson Training on Vercel for HR and hiring managers.

## Prerequisites

- [Vercel account](https://vercel.com) (Hobby works — use free external cron for emails; Pro can use native Vercel Cron)
- [Neon](https://neon.tech) project with Auth + Data API enabled
- AWS credentials for SES (invite emails)
- DeepSeek and/or OpenRouter API key (AI evaluation)
- Git repo (GitHub / GitLab / Bitbucket)

---

## 1. Prepare the database (one time)

From your machine with `DATABASE_URL` pointing at Neon:

```bash
npm install
npm run db:apply-all
node scripts/audit-schema.mjs
```

---

## 2. Import project on Vercel

1. Push this repo to GitHub (or GitLab / Bitbucket).
2. Go to [vercel.com/new](https://vercel.com/new) → **Import** your repository.
3. Vercel should detect **TanStack Start** automatically (`vercel.json` sets `"framework": "tanstack-start"`).
4. **Do not deploy yet** — add environment variables first.

### Build settings (usually auto-detected)

| Setting | Value |
|---------|-------|
| Framework | TanStack Start |
| Build Command | `npm run build` |
| Output Directory | *(leave empty — Nitro writes to `.vercel/output`)* |
| Install Command | `npm install` |
| Node.js Version | 20.x |

---

## 3. Environment variables

In **Project Settings → Environment Variables**, add these for **Production** (and Preview if you want preview deploys to work):

### Required

| Variable | Notes |
|----------|-------|
| `VITE_NEON_AUTH_URL` | From Neon Console → Auth. **Build-time** — redeploy after change. |
| `VITE_NEON_DATA_API_URL` | From Neon Console → Data API. **Build-time**. |
| `NEON_AUTH_URL` | Same value as `VITE_NEON_AUTH_URL` — **runtime** fallback for server JWT checks. |
| `NEON_DATA_API_URL` | Same value as `VITE_NEON_DATA_API_URL` — **runtime** fallback. |
| `DATABASE_URL` | Neon Postgres connection string (server only). |
| `CRON_SECRET` | Long random string — secures cron + asset URLs. Vercel Cron sends `Authorization: Bearer <CRON_SECRET>` automatically when this is set. |
| `APP_BASE_URL` | Your production URL, e.g. `https://alyson-training.vercel.app` or custom domain **without trailing slash**. Required for correct email/magic links on a custom domain. |
| `AWS_ACCESS_KEY_ID` | SES IAM user |
| `AWS_SECRET_ACCESS_KEY` | SES IAM secret |
| `AWS_REGION` | `us-east-1` (SES) |
| `DEEPSEEK_API_KEY` and/or `OPENROUTER_API_KEY` | At least one required |
| `NODE_ENV` | `production` |

### Recommended

| Variable | Notes |
|----------|-------|
| `SES_FROM_NAME` | `Cintara Training` |
| `SES_CONFIGURATION_SET` | `alyson-training` |
| `OPENROUTER_MODEL` | `deepseek/deepseek-chat` |
| `OPENROUTER_VISION_MODEL` | `google/gemini-2.0-flash-001` |
| `EMAIL_WORKFLOW_LAMBDA_ARN` | Optional — assignment email Step Functions |
| `BOOTSTRAP_ADMIN_EMAILS` | First admin emails; **clear after bootstrap** |

### Do NOT set on Vercel

| Variable | Why |
|----------|-----|
| `EMAIL_AUTO_PROCESS=1` | Dev only — use Vercel Cron instead |

### Pull env locally (optional)

```bash
npm i -g vercel
vercel link
vercel env pull .env.local
```

---

## 4. Neon Auth for your Vercel URL

In **Neon Console → Branch → Auth**:

1. **Trusted domains** — add:
   - `https://your-app.vercel.app`
   - Your custom domain if you use one
   - `http://localhost:5173` (for local dev)
2. **Google OAuth** — add the same URLs to **Authorized JavaScript origins**.
3. Enable email/password sign-in.

See [NEON_SETUP.md](./NEON_SETUP.md) for details.

---

## 5. Deploy

Click **Deploy** in Vercel, or from CLI:

```bash
npm i -g vercel
vercel link
vercel --prod
```

Vercel sets `VERCEL=1` during build → Nitro uses the **vercel** preset and outputs to `.vercel/output`.

Verify:

```bash
curl https://your-app.vercel.app/api/health
# → {"ok":true,"service":"alyson-training",...}
```

---

## 6. Email cron (required for invite emails)

The app drains the email queue via:

```
GET or POST https://<APP_BASE_URL>/api/internal/cron/tick
Authorization: Bearer <CRON_SECRET>
```

`CRON_SECRET` must be set in Vercel env vars.

### Hobby plan (default) — use external cron

Vercel **Hobby** only allows **once-per-day** native cron jobs, so [`vercel.json`](../vercel.json) does **not** include a cron schedule (avoids deploy errors).

Use a free external scheduler instead — e.g. [cron-job.org](https://cron-job.org):

1. Create account → **Create cronjob**
2. **URL:** `https://YOUR-APP.vercel.app/api/internal/cron/tick`
3. **Schedule:** every 5 minutes
4. **Request method:** GET (or POST)
5. **Headers:** `Authorization` = `Bearer YOUR_CRON_SECRET` (same value as Vercel env)
6. Save and enable

Test manually:

```bash
curl -X POST "https://YOUR-APP.vercel.app/api/internal/cron/tick" \
  -H "Authorization: Bearer YOUR_CRON_SECRET"
```

Or locally: `npm run email:cron`

After the first run, check **Notifications** in the app — queued emails should drain.

### Pro plan — optional native Vercel Cron

Merge [`vercel.cron.pro.example.json`](../vercel.cron.pro.example.json) into `vercel.json` to run every 5 minutes on Vercel (Pro unlocks sub-daily schedules). Vercel sends the `Authorization: Bearer <CRON_SECRET>` header automatically when `CRON_SECRET` is set.

---

## 7. Custom domain (recommended for HR)

1. Vercel → **Project → Settings → Domains** → add e.g. `training.cintara.ai`.
2. Set `APP_BASE_URL=https://training.cintara.ai` in env vars.
3. Add that domain to Neon Auth trusted domains + Google OAuth.
4. **Redeploy** so `VITE_*` client bundle and server config pick up changes.

---

## 8. Onboard HR

1. Admin signs in → `/invites` → send **Hiring Manager** invites.
2. Share [HR_ROLLOUT.md](./HR_ROLLOUT.md) with the team.

---

## Vercel-specific limitations

### File uploads (important)

Vercel serverless functions use an **ephemeral filesystem**. Files saved to `storage/` (class videos, interview paper photos) **do not persist** across requests or redeploys.

For production file uploads on Vercel, plan one of:

- [Vercel Blob](https://vercel.com/docs/storage/vercel-blob) (recommended next step)
- AWS S3 + presigned URLs

Until then, **online interview tests** and **bulk candidate scheduling** work fully; **paper photo upload** and **large video uploads** may not persist on Vercel.

### Function duration

`vite.config.ts` sets `maxDuration: 60` seconds for Vercel functions (requires Pro for >10s on some plans). Long AI grading may hit limits on very large assessments.

### Multi-region AWS

SES is `us-east-1`; Lambda workflow (optional) is `us-west-2`. Ensure IAM allows both.

---

## Troubleshooting

### Auth not working after deploy

1. **Neon trusted domains** — In Neon Console → Auth, add **every** URL you sign in from:
   - `https://your-project.vercel.app`
   - Your custom domain (if used)
   - Preview URLs if you test preview deploys
   - Google OAuth **Authorized JavaScript origins** must list the same URLs.

2. **Env vars** — All four must be set in Vercel (Production):
   - `VITE_NEON_AUTH_URL` and `VITE_NEON_DATA_API_URL` (required at **build** — redeploy after adding)
   - `NEON_AUTH_URL` and `NEON_DATA_API_URL` (same values, for **runtime** server auth)
   - `DATABASE_URL` (bootstrap after sign-in)

3. **`APP_BASE_URL`** — Must match the URL in your browser (e.g. `https://your-project.vercel.app`, no trailing slash). If you use a custom domain, update this and redeploy.

4. **Redeploy** — Changing `VITE_*` vars requires a **new deployment** (they are baked into the client bundle).

5. **Check Vercel function logs** — Failed bootstrap often shows `Unauthorized`, `invalid token`, or CSRF errors.

6. **"Could not save class" / Unauthorized on `/classes/new`** — Usually server-function auth, not missing trainer role (admins can create classes too):
   - Redeploy with latest code (CSRF must not pin `APP_BASE_URL` when you browse a `*-xxx.vercel.app` deployment URL).
   - Confirm `NEON_AUTH_URL` / `NEON_DATA_API_URL` at **runtime** match the `VITE_*` values from build.
   - Hard-refresh after deploy so the client picks up a fresh session token.

| Issue | Fix |
|-------|-----|
| Sign-in does nothing / redirects back to `/auth` | Add Vercel URL to Neon **Trusted domains** |
| "Could not save class" → Unauthorized | See item 6 above; check Vercel **Functions** logs for `no bearer token` vs CSRF |
| "Sign-in succeeded but no session" | Neon trusted domains + Google OAuth origins |
| Stuck on "Setting up your workspace…" | Set `DATABASE_URL`, `NEON_AUTH_URL`; check function logs |
| "No Access" after sign-in | Admin must send invite from `/invites` or set `BOOTSTRAP_ADMIN_EMAILS` |
| Wrong links in emails | Set `APP_BASE_URL` to production domain and redeploy |
| Cron 401 | Ensure `CRON_SECRET` is set in Vercel env |
| Cron not running | Set up [cron-job.org](#6-email-cron-required-for-invite-emails) on Hobby |
| 500 on first load | Check Vercel **Functions** logs; verify all required env vars |

---

## Production scale (1k users)

### Database
- Set `DATABASE_URL` to the Neon **connection pooler** URL (`-pooler` in hostname).
- Optional `PG_POOL_MAX=2` per serverless instance (default on Vercel).
- Run `npm run db:apply-scale-indexes` after deploy for performance indexes + `ai_usage_log`.

### File storage
- Set `BLOB_READ_WRITE_TOKEN` from Vercel Blob store. Without it, uploads use local disk (ephemeral on Vercel).
- Max upload sizes: 50MB video, 10MB documents/transcripts.

### Email
- **Transactional** (invites, interview): cron at `/api/internal/cron/tick` drains `auth_emails` + `transactional_emails` via SES.
- **Assignments**: use `EMAIL_WORKFLOW_LAMBDA_ARN` Step Functions when configured.
- Keep `EMAIL_AUTO_PROCESS` unset in production.

### CEO demo (10 minutes)
1. Sign in as admin → `/executive` (training + hiring + AI cost).
2. `/invites` → invite hiring manager → they sign in and see hiring routes.
3. `/classes/new` → publish class → `/courses/$id` → assign from `/assignments`.
4. `/api/health` returns `ok: true` with database + JWKS checks.

### Monitoring
- `GET /api/health` — DB, Neon Auth JWKS, storage backend, SES/AI config.
- Optional `SENTRY_DSN` for structured error capture.
- `npm run test` — security unit tests (answer-key stripping).

---

## CLI quick reference

```bash
vercel              # preview deploy
vercel --prod         # production deploy
vercel env pull       # download env to .env.local
vercel logs           # stream function logs
```

---

## Related docs

- [DEPLOYMENT.md](./DEPLOYMENT.md) — general deployment checklist
- [NEON_SETUP.md](./NEON_SETUP.md) — auth configuration
- [AWS_SES_SETUP.md](./AWS_SES_SETUP.md) — email setup
- [HR_ROLLOUT.md](./HR_ROLLOUT.md) — share with hiring team
