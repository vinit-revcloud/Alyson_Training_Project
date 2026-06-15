# Alyson LMS — Email Service Implementation Context

> **Use this file** (`@docs/EMAIL_SERVICE_CONTEXT.md`) alongside `@context.md` when implementing the new email service.
>
> **Architecture decision:** AWS Step Functions + Lambda + SES templates handle send, wait states (Day 0/7/14/30), and logging. **This app only enqueues** to `email_queue` and writes `notification_log`. The legacy in-app SES drain (`process-queue.ts`) is broken and must not be used in production.

---

## 1. Business / Data Flow

### Entities & relationships

| Entity | Key fields (actual DB) | Notes |
|--------|------------------------|-------|
| **Users** | `profiles.user_id`, `display_name`, `email`, `status`, `manager_id`, `hr_id` | Roles in `user_roles` |
| **Assignments** | `assessment_assignments`: `learner_user_id`, `assessment_id`, `course_id`, `due_at`, `status`, `attempts_used`, `max_attempts` | No `class_id` column |
| **Attempts** | `assessment_attempts`: `assignment` via candidate→user link, `attempt_number`, `score`, `status`, `passed` | `last_attempt_id` on assignment |
| **Email Queue** | `email_queue`: `queue_name`, `payload` jsonb, `archived_at` | **No status column** — pending = `archived_at IS NULL` |
| **Notification Log** | `notification_log`: tracks workflow for dashboard | `idempotency_key` UNIQUE |
| **Email Send Log** | `email_send_log`: written by AWS Lambda after SES send | `status`: pending/sent/failed/suppressed/bounced/complained/dlq |

### Candidate types (assignment workflow)

| Type | Condition | Email action |
|------|-----------|--------------|
| **First-time** | `attempts_used = 0`, status `assigned` | Enqueue `initial` → triggers Step Functions Day 0/7/14/30 |
| **Failed (retake)** | Latest attempt failed, `attempts_used < max_attempts`, status `assigned` | Enqueue `retake` → same reminder/escalation ladder |

### Email workflow (event-driven)

```
Assignment created / retake needed
  → App: enqueueAssignmentEmailInDb()
  → INSERT notification_log (status: queued)
  → INSERT email_queue (queue_name: transactional_emails, payload jsonb)
  → AWS Step Functions picks up queue row
  → Day 0: SES template send (assignment_email / retake_reminder)
  → Wait 7d → reminder_day7 (skip if assignment completed)
  → Wait 14d → reminder_day14 (skip if completed)
  → Wait 30d → escalation_day30 to HR/CEO (skip if retook and passed)
  → Lambda updates notification_log + email_send_log
  → Dashboard reads logs
```

**No polling cron required** for the new path. Legacy cron (`/api/internal/cron/tick`, `triggers.server.ts`) exists but is superseded.

### Conditional checks (Step Functions / Lambda responsibility)

- Skip reminder if assignment `status = 'passed'` before send date
- Skip Day 30 escalation if candidate retook and passed
- Skip if email in `suppressed_emails`

---

## 2. AWS SES + Step Functions (external — DONE)

### SES configuration

| Setting | Value |
|---------|-------|
| Verified sender | `training.group@cintara.ai` |
| Display name | `Cintara Training` (`SES_FROM_NAME`) |
| Configuration set | `alyson-training` |
| Region | `us-east-1` (default) |
| Bounce webhook | `POST /api/webhooks/ses` (SNS verify) |

### SES templates (Lambda uses these — not DB `email_templates`)

| SES template name | App `email_type` | DB template_key (notification_log) |
|-------------------|------------------|-------------------------------------|
| `assignment_email` | `initial` | `assignment_new` |
| `reminder_day7` | `reminder_day7` | `escalation_day7` |
| `reminder_day14` | `reminder_day14` | `escalation_day14` |
| `retake_reminder` | `retake` | `failure_retake` |
| `escalation_day30` | `escalation_day30` | `escalation_day30` |

### Placeholders (passed in queue payload — SES renders)

```
{learner_name}, {course_name}, {assignment_name}, {due_date}, {current_score}, {retake_link}
```

Defined in `src/lib/email/render.ts` → `PlaceholderKey`.

`retake_link` = `${APP_BASE_URL}/attempt/${assignment_id}`

### Step Functions wait states

| Day | Action |
|-----|--------|
| 0 | Send initial or retake email |
| 7 | Reminder if incomplete |
| 14 | Reminder if incomplete |
| 30 | Escalate to HR/CEO if still failing |

### Lambda callback (to implement in app)

`POST /api/internal/email/send-result` — auth `Bearer CRON_SECRET`

Body: `{ notification_log_id, message_id?, status, error?, assignment_id, user_id, email_type, template_name }`

Updates `notification_log` + inserts `email_send_log`.

---

## 3. Database Schema (relevant tables)

### `email_queue`

```sql
id bigserial PK
queue_name text NOT NULL          -- always 'transactional_emails' for assignment emails
payload jsonb NOT NULL            -- all business fields live here
visible_after timestamptz DEFAULT now()
read_count int DEFAULT 0
archived_at timestamptz           -- NULL = pending
created_at timestamptz
```

**RPC:** `enqueue_email(queue_name, payload)` → returns bigint id

**Pending check:** `archived_at IS NULL AND payload->>'assignment_id' = $1 AND payload->>'email_type' = $2`

### `notification_log`

```sql
id uuid PK
user_id uuid
assignment_id uuid
template_key text NOT NULL
audience text DEFAULT 'learner'
recipient_email text NOT NULL
subject text NOT NULL
status text DEFAULT 'pending'     -- pending | queued | sent | failed
provider_message_id text
error text
attempt int DEFAULT 0
idempotency_key text UNIQUE
sent_at timestamptz
created_at timestamptz
```

**Recommended idempotency_key:** `${email_type}:${assignment_id}:${user_id}` (permanent, not daily)

### `email_send_log`

```sql
message_id text
template_name text NOT NULL
recipient_email text NOT NULL
status text CHECK (pending|sent|suppressed|failed|bounced|complained|dlq)
error_message text
metadata jsonb
created_at timestamptz
```

### `assessment_assignments`

```sql
learner_user_id uuid NOT NULL
assessment_id uuid NOT NULL
course_id uuid
due_at timestamptz DEFAULT now() + 14 days
max_attempts int DEFAULT 3        -- NOT max_retake
attempts_used int DEFAULT 0       -- NOT retake_count
last_attempt_id uuid
status: assigned | in_progress | passed | failed_capped | expired
UNIQUE (learner_user_id, assessment_id)
```

---

## 4. Current Code (what exists today)

### Working helpers — reuse these (`email-db.server.ts`)

| Function | Purpose |
|----------|---------|
| `getProfileEmail(userId)` | Resolve recipient |
| `getEmailTemplate(key)` | Load DB template for subject |
| `findNotificationLogByIdempotency(key)` | Dedup guard |
| `insertNotificationLog(...)` | Audit trail |
| `updateNotificationLog(id, patch)` | Status updates |
| `enqueueEmail(queueName, payload)` | **Direct pg** — preferred over `dbAdmin.rpc` |

### Broken / legacy paths — do NOT extend

| File | Problem |
|------|---------|
| `triggers.server.ts` → `dispatch()` | Uses `dbAdmin.rpc("enqueue_email")` via Data API; pre-renders HTML; daily idempotency |
| `assignment-notify.server.ts` | Calls broken `dispatch()` + `maybeProcessEmailQueue()` |
| `send-template.functions.ts` | Same `dispatch` pattern |
| `process-queue.ts` | In-app SES send — replaced by AWS Lambda |
| `cron-runner.server.ts` | Poll-based reminders — replaced by Step Functions |

### Assignment creation triggers (`assignments.functions.ts`)

These call `notifyNewAssignments()` after create:

- `createManualAssignmentFn` → `[row.id]`
- `autoAssignCourseToDepartmentFn` → `result.newAssignmentIds`
- `assignAssessmentFn` → bulk `ids`

### Placeholder resolution (copy from `triggers.server.ts` dispatch)

```typescript
// Load: assessment_assignments → assessments.title, courses.title, profiles.display_name
// Score from assessment_attempts via last_attempt_id
// retake_link: getAppBaseUrl() + '/attempt/' + assignment_id
```

### Queue payload shape (NEW — for Step Functions)

```json
{
  "user_id": "uuid",
  "assignment_id": "uuid",
  "email_type": "initial | reminder_day7 | reminder_day14 | retake | escalation_day30",
  "template_name": "assignment_email",
  "recipient_email": "learner@cintara.ai",
  "placeholders": {
    "learner_name": "...",
    "course_name": "...",
    "assignment_name": "...",
    "due_date": "...",
    "current_score": "...",
    "retake_link": "https://..."
  },
  "notification_log_id": "uuid",
  "queued_at": "ISO-8601"
}
```

**Do NOT include** pre-rendered `html` or `subject` in payload (SES templates handle rendering).

---

## 5. Implementation Spec — Step 1

### New files to create

```
src/lib/email/enqueue-assignment-email.server.ts   # Core DB logic
src/lib/email/enqueue-assignment-email.functions.ts # createServerFn wrapper
```

### `enqueueAssignmentEmailInDb(input)` behavior

1. Validate `user_id`, `assignment_id`, `email_type`
2. Resolve `recipient_email` from `profiles` — fail if missing
3. Build placeholders (from input or auto-load from DB)
4. Map `email_type` → `template_key` + `template_name` (see table in §2)
5. **Duplicate guard:** query `email_queue` for pending row with same `assignment_id` + `email_type`
6. **Idempotency:** `idempotency_key = ${email_type}:${assignment_id}:${user_id}` — skip if exists in `notification_log`
7. Insert `notification_log` (status: `queued`)
8. Call `enqueueEmail('transactional_emails', payload)` via **getPgPool()**
9. Return `{ ok, queued, queueId?, notificationLogId?, reason? }`
10. **Do NOT** call `maybeProcessEmailQueue()`

### Server function

```typescript
export const enqueueAssignmentEmailFn = createServerFn({ method: "POST" })
  .middleware([requireDbAuth])
  .inputValidator(EnqueueAssignmentEmailSchema) // Zod
  .handler(...)
```

### Wire-up (Step 1 minimal)

Replace `assignment-notify.server.ts` body to call `enqueueAssignmentEmailInDb({ email_type: 'initial', ... })`.

---

## 6. Implementation Order

| Step | Task | Files | Status |
|------|------|-------|--------|
| **1** | Enqueue server function | `enqueue-assignment-email.*` | Done |
| **2** | Wire assignment creation | `assignment-notify.server.ts` | Done |
| **3** | Wire retake on failed attempt | `assignment-notify.server.ts` / `triggers.functions.ts` | Done |
| **4** | Lambda send-result callback API | `routes/api/internal/email/send-result.ts` | Done |
| **5** | Update `/email-testing` | `routes/email-testing.tsx` | Done |
| **6** | Disable in-app send | `process-queue.ts`, `cron-runner.server.ts`, `triggers.*` | Done |
| **7** | Dashboard metrics | `email-metrics.server.ts` | Done |

---

## 7. Testing

### SQL verification

```sql
SELECT id, payload, created_at FROM email_queue
WHERE archived_at IS NULL ORDER BY id DESC LIMIT 10;

SELECT id, template_key, status, idempotency_key, assignment_id
FROM notification_log ORDER BY created_at DESC LIMIT 10;
```

### Manual test

`/email-testing` → select assignment + email_type → call `enqueueAssignmentEmailFn`

### Env requirements

```
DATABASE_URL          # required for enqueue (direct pg)
APP_BASE_URL          # for retake_link
CRON_SECRET           # for Lambda callback auth
# AWS keys NOT needed in app for enqueue-only path
```

---

## 8. Key File References

| File | Role |
|------|------|
| `context.md` | Full platform context |
| `src/lib/email/email-db.server.ts` | Queue + log helpers |
| `src/lib/email/triggers.server.ts` | Legacy dispatch (replace) |
| `src/lib/email/assignment-notify.server.ts` | Assignment create hook |
| `src/lib/email/render.ts` | PlaceholderKey types |
| `src/lib/assignments.functions.ts` | Assignment create entry points |
| `db/neon-schema.sql` | Table definitions |
| `docs/AWS_SES_SETUP.md` | SES domain/IAM setup |
| `src/lib/email/constants.ts` | `TRAINING_SENDER_EMAIL` |
| `src/lib/pg.server.ts` | Direct Postgres pool |
| `src/lib/cron-auth.server.ts` | Bearer CRON_SECRET verify |

---

*Generated for email service rebuild. AWS Step Functions assumed operational externally.*
