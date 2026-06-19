# Alyson Training

Internal training and **hiring assessment** platform for Cintara. HR and hiring managers schedule candidate interviews, proctor tests, and review AI evaluations. Trainers manage courses, assignments, and employee assessments.

## Quick links

| Audience | Start here |
|----------|------------|
| **Deploy / DevOps** | [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) · **[Vercel → docs/VERCEL_DEPLOY.md](docs/VERCEL_DEPLOY.md)** |
| **HR & Hiring Managers** | [docs/HR_ROLLOUT.md](docs/HR_ROLLOUT.md) |
| **Neon + Auth setup** | [docs/NEON_SETUP.md](docs/NEON_SETUP.md) |
| **Email (SES)** | [docs/AWS_SES_SETUP.md](docs/AWS_SES_SETUP.md) |

## Local development

```bash
cp .env.example .env          # fill in Neon, AWS, AI keys
npm install
npm run db:apply-all          # first-time DB setup
npm run dev                   # http://localhost:5173
```

## Production deploy (summary)

### Vercel (recommended)

See **[docs/VERCEL_DEPLOY.md](docs/VERCEL_DEPLOY.md)** for the full guide. Quick steps:

1. `npm run db:apply-all` on Neon
2. Import repo on Vercel → add env vars from `.env.example`
3. Set `APP_BASE_URL` to your Vercel or custom domain
4. Add domain to Neon Auth trusted domains
5. Deploy → verify `GET /api/health`
6. Invite HR from `/invites`

### Docker / self-hosted

```bash
docker build \
  --build-arg VITE_NEON_AUTH_URL="$VITE_NEON_AUTH_URL" \
  --build-arg VITE_NEON_DATA_API_URL="$VITE_NEON_DATA_API_URL" \
  -t alyson-training:latest .

docker run -p 4173:4173 --env-file .env.production \
  -v alyson-storage:/app/storage \
  alyson-training:latest
```

Or with Compose: `docker compose up --build` (uses `.env.production`).

Health check: `GET /api/health`

## Key routes

| Route | Who |
|-------|-----|
| `/interviews` | Hiring managers — schedule & proctor candidates |
| `/interviews/assessments` | Interview test library |
| `/hiring/reports` | CEO / leadership — hiring outcomes |
| `/assignments` | Trainers — employee training assignments |
| `/invites` | Admins — onboard HR and trainers |

## Stack

TanStack Start (React 19 SSR) · Neon Postgres + Auth · AWS SES · DeepSeek / OpenRouter AI

## Version

See `package.json` — [Semantic Versioning](https://semver.org/) for releases.
