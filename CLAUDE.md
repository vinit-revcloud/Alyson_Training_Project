# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # Vite dev server at http://localhost:5173
npm run build        # Production build
npm run start        # Preview server at 0.0.0.0:4173
npm run lint         # ESLint
npm run format       # Prettier
```

### Database (apply in order on a fresh Neon project)

```bash
npm run db:apply                 # Core schema
npm run db:apply-interview       # Interview sessions
npm run db:apply-enterprise      # Enterprise/hiring schema
npm run db:apply-paper-only      # Paper-only mode column
npm run db:apply-rls             # RLS policies
npm run db:apply-email-seeds     # Seed email templates
npm run db:apply-email-queue-fix # Email queue functions
```

Schema is **not auto-migrated** — track applied scripts manually. No rollback scripts exist.

### Operational scripts

```bash
npm run auth:grant-admin         # Grant admin role by email
npm run email:process            # Manually drain email queue
npm run email:cron               # Hit cron tick endpoint
npm run validate:deploy          # Pre-deploy env check
node scripts/audit-schema.mjs    # Check schema completeness
```

## Architecture

**TanStack Start** (React 19 + Nitro SSR) with file-based routing. Dev port **5173**, production port **4173**.

### The dual-access DB pattern

Every server operation chooses between two Postgres paths:

| Access | Client | Use for |
|--------|--------|---------|
| Neon Data API (`db`) | `integrations/neon/client.ts` | User-scoped reads/writes, RLS enforced |
| Direct `pg` pool | `lib/pg.server.ts` | Admin SQL, cron, bootstrap, interviews — bypasses RLS |

Never mix these up. Server functions that operate on behalf of a specific user use `db` from context. Anything running as a system actor (cron, webhooks, bootstrapping) uses the `pg` pool.

### Server function conventions (`src/lib/`)

| File suffix | Runs where | Purpose |
|-------------|------------|---------|
| `*.functions.ts` | Server (callable from client via `createServerFn`) | Public API surface |
| `*.server.ts` | Server only — never import in components | DB, SES, AI, file I/O |
| `*.shared.ts` | Client + server | Types, Zod schemas |
| `*-api.ts` | Client | Query hooks, React Query keys |
| `*.validation.ts` | Shared | Zod input schemas |

Standard server function shape:
```typescript
export const myFn = createServerFn({ method: "POST" })
  .middleware([requireDbAuth])
  .inputValidator(MySchema)
  .handler(async ({ data, context }) => {
    return doWorkInDb(context.userId, data); // delegates to *.server.ts
  });
```

Client call: `const fn = useServerFn(myFn); await fn({ data: { ... } });`

### Routing

Routes live in `src/routes/` — TanStack Router auto-generates `src/routeTree.gen.ts` on build/dev. **Never edit `routeTree.gen.ts` by hand.**

Two layout trees:
- **Admin console** (`AdminLayout.tsx`): all routes except `/auth` and `/interview/$token`. Role-filtered sidebar nav defined in `src/lib/admin-data.ts` → `NAV_ITEMS`.
- **Learn layout** (`learn.tsx`): `/learn/*` — trainee-only, has creator/student mode toggle (persisted to `localStorage` key `alyson-view-mode`).

### Authentication & Role system

- Provider: **Neon Auth** (Google SSO + email/password). Domain-locked to `@cintara.ai` in `auth-constants.ts`.
- JWT verified server-side in `auth-token.server.ts` via Neon JWKS.
- `attachDbAuth` middleware adds `Authorization: Bearer <jwt>` to all server function requests.
- `requireDbAuth` middleware injects `userId`, `user`, `db` into server function context.
- **Access enforcement is client-side only** in `AdminLayout.tsx` via `canAccessAdminRoute()` from `role-access.ts`. No TanStack Router `beforeLoad` guards.

Bootstrap flow (first authenticated load):
1. `bootstrapAuthUser()` server function
2. Upserts `profiles` row
3. Tries invite token from `localStorage` key `alyson_invite_token`
4. Falls back to `BOOTSTRAP_ADMIN_EMAILS` env var for initial admins
5. No roles → `NoAccessPanel` (invite required)

Role → home path mapping is in `postAuthHomePath()` in `auth-constants.ts`. Trainees go to `/learn`; everyone else goes to `/`.

Role-to-access matrix:

| Role | Can access |
|------|-----------|
| `admin` | Everything |
| `trainer` | Everything except `/invites`, `/users`, `/email-testing`, `/settings`, `/notifications` |
| `trainee` | `/learn` only |
| `hiring_manager` | `/interviews`, `/hiring`, `/analytics` (unless also trainer) |
| `ceo` | `/`, `/analytics`, `/hiring` (read-only) |

Content manager check (`assertContentManager` in `content-manager.server.ts`) gates course/class creation and AI features — requires `admin`, `trainer`, or `hiring_manager`.

### AI integration

Provider chain in `lib/ai/llm.ts`: **DeepSeek first** → **OpenRouter fallback** on 401/402/403/404/429/5xx. All AI calls go through `llmChat()` — never call providers directly.

### Asset storage

Backends (see `asset-storage.server.ts`): **S3** in production when `S3_ASSETS_BUCKET` is set, else **local disk** at `{cwd}/storage/{bucket}/{path}` (dev), or **Vercel Blob** if `BLOB_READ_WRITE_TOKEN` is set without S3. Keys: `{optional prefix}/{bucket}/{classId}/{sectionId}/...`. Learners get **S3 presigned URLs** in S3 mode; local/Blob use HMAC-signed `/api/assets/...` proxy. PDF text for AI is cached once in `section_assets.extracted_text` (single binary for study + assessments). Setup: `scripts/configure-s3-assets.md`; migrate: `npm run assets:migrate-s3`.

### Email system

Postgres-backed queue (`email_queue` table) + AWS SES. **Never call SES directly from server functions** — always enqueue via `enqueue_email` RPC. Cron drains the queue. Unified cron entry: `POST /api/internal/cron/tick` — the legacy `/api/public/hooks/*` routes still exist but are deprecated. Set `EMAIL_AUTO_PROCESS=1` in dev to drain immediately after enqueue.

### Hardcoded values to know

- `@cintara.ai` domain gate is not env-configurable (in `auth-constants.ts`)
- SES From address `training.group@cintara.ai` is not env-configurable (in `email/constants.ts`)
- `admin-data.ts` exports `COURSES`, `USERS`, `ASSESSMENTS` etc. — these are **dead demo data**, not imported by any live route. Only `NAV_ITEMS` is live.
- `routeTree.gen.ts` is auto-generated and may appear modified in git after route changes — this is expected.

## Adding new features checklist

- **New route** → add file in `src/routes/`. Router auto-regenerates the tree.
- **New server function** → `*.functions.ts` with `requireDbAuth` middleware; DB work in a separate `*.server.ts`.
- **New DB table/column** → add SQL to `db/`, add an npm script in `package.json`, update `src/integrations/neon/types.ts`.
- **New env var** → add to `.env.example`, `src/lib/config.server.ts`, `assertProductionConfig()`, and `scripts/validate-deploy.mjs`.
- **Email** → enqueue via `enqueue_email` RPC, never direct SES.
- **AI** → use `llmChat()` from `ai/llm.ts`.
- **Role access change** → update `role-access.ts` (`ADMIN_ONLY_PREFIXES`, `canAccessAdminRoute`, `navItemsForRoles`).
