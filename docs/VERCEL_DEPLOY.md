# Deploy on Vercel

Step-by-step guide to deploy Alyson Training on Vercel for HR and hiring managers.

## Prerequisites

- [Vercel account](https://vercel.com) (Pro recommended for cron every 5 minutes)
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

## 6. Email cron (Vercel Cron)

[`vercel.json`](../vercel.json) schedules:

```
GET /api/internal/cron/tick  every 5 minutes
```

Requirements:

- `CRON_SECRET` must be set in Vercel env (Vercel adds the Bearer header automatically).
- **Pro plan** needed for cron more often than once per day. On **Hobby**, use an external cron service (e.g. [cron-job.org](https://cron-job.org)) to `POST` the same URL with header `Authorization: Bearer <CRON_SECRET>` every 5 minutes.

After deploy, check **Notifications** in the app — queued emails should drain after cron runs.

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

| Issue | Fix |
|-------|-----|
| Build fails on Vercel | Run `npm run build` locally; fix errors first |
| Sign-in does nothing | Add Vercel URL to Neon **Trusted domains** |
| Wrong links in emails | Set `APP_BASE_URL` to production domain and redeploy |
| Cron 401 | Ensure `CRON_SECRET` is set in Vercel env |
| Cron not running | Pro plan for 5-min schedule; check Vercel → Cron tab |
| 500 on first load | Check Vercel **Functions** logs; verify all required env vars |

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
