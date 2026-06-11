# Neon setup (Alyson Training)

## 1. Neon project

1. [console.neon.tech](https://console.neon.tech) → create or open project
2. On your branch, enable **Neon Auth** and **Data API**
3. Copy values into `.env` (see `.env.example`)

```bash
npm run auth:verify-env
```

## 2. Database schema

```bash
npm run db:apply
```

## 3. Neon Auth configuration (required)

Open **Neon Console → Branch → Auth**.

### Trusted domains

Add every origin where the app runs:

| Environment | Origin |
|-------------|--------|
| Local dev | `http://localhost:5173` |
| Production | `https://your-domain.com` |

Enable **Allow localhost** for development.

OAuth redirects back to your app origin (e.g. `http://localhost:5173/`). That origin must be in trusted domains or sign-in appears to do nothing.

### Email & password

Enable **sign-in** and **sign-up**.

For reliable verification emails in production, configure custom SMTP in Auth settings.

### Google OAuth

1. Enable **Google** in Neon Auth (shared dev credentials work for quick tests).
2. For your own Google Cloud OAuth client, set **Authorized redirect URI**:

   ```
   https://<VITE_NEON_AUTH_HOST>/callback/google
   ```

   Example:

   ```
   https://ep-morning-wind-aqckldmt.auth.c-8.us-east-1.aws.neon.tech/callback/google
   ```

3. Add **Authorized JavaScript origins**: `http://localhost:5173` and your production domain.

## 4. How app auth works

| Method | Flow |
|--------|------|
| **Google SSO** | `/auth` → Google → Neon → `/` → auto bootstrap → dashboard |
| **Email/password** | `/auth` sign-in or sign-up → session → Postgres bootstrap |
| **Invite link** | `/auth?email=…&token=…&mode=signup` → token stored → role applied on first sign-in |

### Access rules

- Only **`@cintara.ai`** emails are accepted (enforced client-side and in server middleware).
- **Roles** are assigned server-side via `syncProfileAfterSignIn`:
  - Valid pending **invite** (by token + email, or email match) → invited role
  - Else if no admin exists yet → first user gets `admin` + `trainer`
  - Else → no roles → “No Access” screen until an admin invites you

### First admin (manual alternative)

```sql
INSERT INTO user_roles (user_id, role) VALUES ('<neon-auth-user-uuid>', 'admin');
```

## 5. Environment variables

| Variable | Purpose |
|----------|---------|
| `VITE_NEON_AUTH_URL` | Browser Neon Auth URL |
| `VITE_NEON_DATA_API_URL` | Browser Data API URL |
| `DATABASE_URL` | Schema apply, direct SQL |
| `APP_BASE_URL` | Email links (use `http://localhost:5173` in dev) |
| `CRON_SECRET` | Internal cron/hook auth |

## 6. Run locally

```bash
npm install
npm run dev
```

Open `http://localhost:5173/auth`.

## 7. Troubleshooting

| Symptom | Fix |
|---------|-----|
| Google button does nothing | Add `http://localhost:5173` to trusted domains + allow localhost |
| `redirect_uri_mismatch` | Google redirect URI must be `<auth-url>/callback/google` |
| “Authentication failed” on email | Enable email/password in Neon; confirm email if verification is on |
| “Access denied” after Google | Use a `@cintara.ai` Google Workspace account |
| “No Access” after sign-in | Ask admin for an invite, or be the first user (bootstrap admin) |
