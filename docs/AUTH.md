# Authentication

Neon Auth handles sign-in (Google SSO + email/password). After sign-in, the app bootstraps `profiles` and `user_roles` in Postgres via **direct SQL** (`DATABASE_URL`), not the Data API.

## Flow

1. User signs in at `/auth` (Google or email/password).
2. `useSession()` reads the Neon Auth session.
3. `bootstrapAuthUser` server function:
   - Validates JWT from `Authorization: Bearer`
   - Upserts `profiles`
   - Assigns roles from invite, or grants **admin+trainer** to the first user if no admin exists
4. User enters the app with roles loaded from Postgres.

## Key files

| File | Purpose |
|------|---------|
| `src/routes/auth.tsx` | Sign-in UI |
| `src/lib/auth.ts` | Session hook + bootstrap trigger |
| `src/lib/auth.functions.ts` | `bootstrapAuthUser`, `fetchMyRoles` |
| `src/lib/auth-bootstrap.server.ts` | Postgres profile/role logic |
| `src/lib/auth-token.server.ts` | JWT decode from Bearer token |
| `src/integrations/neon/client.ts` | Neon Auth + Data API client |

## Neon Console

See [NEON_SETUP.md](./NEON_SETUP.md). Required: Auth enabled, trusted domain `http://localhost:5173`, Google OAuth, email/password.

```bash
npm run auth:verify-env
```
