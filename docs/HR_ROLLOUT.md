# HR & Hiring Manager Rollout Guide

Use this guide when sharing Alyson with recruiters, HR, and hiring managers for live candidate screening.

## Who uses what

| Role | Access | Landing page |
|------|--------|--------------|
| **Hiring Manager** | Interview tests, schedule candidates, proctor sessions, bulk upload | `/interviews` |
| **CEO** | Hiring reports and outcomes | `/hiring/reports` |
| **Admin / Trainer** | Full platform + invites | `/` (dashboard) |
| **Trainee** | Employee learning only | `/learn` |

Interview workflows are **separate** from employee training (`/assignments`). Interview tests never get assigned to staff automatically.

---

## Step 1 — Admin invites HR users

1. Sign in as an **admin** (`@cintara.ai` Google or email/password).
2. Go to **Invites** (`/invites`).
3. Create invite:
   - **Email:** `name@cintara.ai`
   - **Role:** `Hiring Manager`
4. The invitee receives a sign-up link (or copy the link from the table).
5. They sign up with the **same email** — they land on `/interviews`.

> Only `@cintara.ai` accounts are accepted. For CEO access, use role `CEO`.

---

## Step 2 — Create interview tests (one-time per role)

1. Open **Interview tests** from the Interviews page (`/interviews/assessments`).
2. Click **Create interview test**.
3. Generate questions with AI, review in the builder, **Validate**, then **Save**.
4. Test must be **validated** or **published** before scheduling.

---

## Step 3 — Schedule candidates

### Single candidate

1. On `/interviews`, click **Schedule interview**.
2. Enter candidate name, email, **job title** (e.g. "Data Analyst").
3. Pick the interview test and mode:
   - **Online** — magic link + email invite
   - **Paper only** — in-person paper test, upload photos later
   - **Hybrid** — online with paper component
4. Copy the magic link or confirm the invite email was queued.

### Many candidates (bulk)

1. Click **Bulk upload** on `/interviews`.
2. **Download template** — lists available tests on the `Available tests` sheet.
3. Fill the `Candidates` sheet (one row per person).
4. Set default test and schedule dates in the dialog if rows leave those blank.
5. Upload and **Import** — review the success/failure summary per row.

Required columns: `candidate_name`, `candidate_email`, `job_title`.

---

## Step 4 — Interview day (proctoring)

1. Send the candidate their magic link (email or copy from **Manage**).
2. Candidate opens the link in **incognito / another browser** and waits in the waiting room.
3. When you are on the video call and ready, click **Open test** on their session row.
4. Candidate can then press **Start test**.
5. Use **Manage** for status, proctor notes, resend link, or paper uploads.

**Status quick reference:** `scheduled` → invite sent · `waiting` → in waiting room · `opened` → you unlocked the test · `in progress` → taking test · `evaluated` → AI review ready

---

## Step 5 — Review results

- **Manage** (per session) — scores, hire recommendation, proctor notes
- **Hiring Reports** (`/hiring/reports`) — all candidates and outcomes (CEO / leadership)

---

## Production URL checklist (for your team)

Before sharing the live URL:

- [ ] Production URL uses **HTTPS** (e.g. `https://training.cintara.ai`)
- [ ] Neon Auth **trusted domains** includes that URL
- [ ] Google OAuth **authorized origins** includes that URL
- [ ] Email cron runs every 5 minutes (invite emails deliver reliably)
- [ ] At least one **validated** interview test exists per role you hire for
- [ ] HR users have **Hiring Manager** invites accepted

---

## Support contacts

| Issue | Action |
|-------|--------|
| "No Access" after sign-in | Admin must send invite or grant role |
| Invite email not received | Check spam; admin can copy invite link from `/invites` |
| Candidate email not received | Admin checks **Notifications** queue; verify cron is running |
| Test won't schedule | Ensure test is validated/published and has questions |

For infrastructure issues, see [DEPLOYMENT.md](./DEPLOYMENT.md).
