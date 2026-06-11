# Notification Scheduling + Template Editor Enhancements

## What exists today
- `/notifications/templates` already has a working editor: subject + body editing, variable placeholders (`{learner_name}`, `{assignment_name}`, `{due_date}`, etc.), live preview, version history, "Test to me" send.
- 6 seeded templates: `assignment_new`, `reminder_daily`, `escalation_day7/14/30`, `failure_retake`.
- Cron jobs hit `/api/public/hooks/daily-reminders`, `/escalations`, `/retry-failed`. Schedules and overdue day thresholds (7/14/30) are **hardcoded** in `src/lib/email/triggers.functions.ts`. There is no UI to change timing.

## Part 1 — Notification Scheduling Panel (new)

New table `notification_schedules` (one row per job):

```
job_key          text PK   -- 'assignment_new' | 'reminder_daily' | 'escalation' | 'failure_retake'
enabled          boolean
cron_expression  text      -- e.g. '0 9 * * *'
send_hour_utc    int       -- convenience for UI when cron is a daily preset
config           jsonb     -- job-specific: { reminder_days_before:[3,1], escalation_days:[7,14,30], failure_delay_hours:24 }
updated_at, updated_by
```

RLS: admins read/write, trainers read.

New route `/notifications/schedules` (admin-only, linked from `/notifications` header):
- Card per job (Assignment notice, Daily reminder, Failure retake, Escalation) with:
  - Enabled toggle
  - Preset schedule picker (Every hour / Daily 9am / Daily 6pm / Custom cron) → writes `cron_expression`
  - Job-specific timing fields:
    - **Daily reminder**: "Send X days before due" multi-select chips (e.g. 3,1)
    - **Escalation**: editable day thresholds list (default 7/14/30) with audience per tier (learner / +HR / +CEO+admin)
    - **Failure retake**: hours after failed attempt
    - **Assignment new**: immediate (read-only, just enable toggle)
  - "Run now" button (calls existing hook route) + last-run timestamp/queued count
- Save persists to `notification_schedules`; backend reads from this table instead of hardcoded constants.

Server changes:
- `src/lib/email/schedules.functions.ts` — `listSchedules`, `saveSchedule`, `runJobNow`.
- Update `runDailyReminders` / `runEscalations` / new `runFailureRetake` to read config from `notification_schedules` (fallback to current defaults).
- Update existing pg_cron jobs to a single 5-min dispatcher that checks each schedule's `cron_expression` against now — or keep current cron rows and just consult `enabled` + `config`. We'll do the latter (simpler): cron stays as-is, hook routes early-return if `enabled=false` and read day-arrays from `config`.

## Part 2 — Template Editor enhancements (extend existing)

Build on `src/components/admin/EmailTemplateEditor.tsx`:
- Replace freeform `insertPlaceholder` with a structured **Variables panel**: clickable chips grouped (Learner, Test, Dates, Links) — clicking inserts at cursor (not appended at end).
- Add an explicit **"Preview with sample data"** modal (Dialog) that shows the rendered email (current `EmailPreview` already renders inline; this adds a full-size, with-sample-vars view + recipient/subject header).
- Keep current Save, Test-to-me, History.
- Variables sourced from `PLACEHOLDERS` in `src/lib/email/render.ts` (add any missing: learner_name, test_title alias of assignment_name, due_date, score, retake_link).

## Technical notes
- Migration creates `notification_schedules` with GRANTs (authenticated SELECT/UPDATE, service_role ALL) and RLS via `has_role`. Seed 4 rows with current defaults.
- Cursor-aware insert: use `useRef<HTMLTextAreaElement>` + `selectionStart` to splice the variable token.
- "Run now" button calls the existing `/api/public/hooks/*` URL with the project anon key — same pattern pg_cron uses.
- No changes to Gmail send pipeline.

## Files touched
- New: migration, `src/lib/email/schedules.functions.ts`, `src/routes/notifications.schedules.tsx`, `src/components/admin/ScheduleCard.tsx`, `src/components/admin/VariablesPanel.tsx`, `src/components/admin/TemplatePreviewDialog.tsx`.
- Edit: `triggers.functions.ts` (read config), 3 hook routes (enabled check), `EmailTemplateEditor.tsx`, `notifications.tsx` (add link to Schedules).
