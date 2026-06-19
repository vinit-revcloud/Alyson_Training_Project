# Step Functions — State Input Reference

State machine: **alyson-training-email-send-state-machine**  
Lambda: **alyson-training-email-send-lambda**

## StartExecution input (from Lambda `startWorkflow`)

### First-time candidate (`workflowType: "initial"`)

```json
{
  "workflowType": "initial",
  "assignment_id": "550e8400-e29b-41d4-a716-446655440000",
  "user_id": "660e8400-e29b-41d4-a716-446655440001",
  "recipient_email": "learner@cintara.ai",
  "placeholders": {
    "learner_name": "Alex Chen",
    "course_name": "Onboarding",
    "assignment_name": "Safety Quiz",
    "due_date": "6/20/2026",
    "current_score": "—",
    "retake_link": "https://app.example.com/attempt/550e8400-e29b-41d4-a716-446655440000"
  },
  "first_email": {
    "email_type": "initial",
    "template_name": "assignment_email",
    "template_key": "assignment_new",
    "notification_log_id": "770e8400-e29b-41d4-a716-446655440002"
  },
  "source_queue_id": 42
}
```

### Retake candidate (`workflowType: "retake"`)

Same shape; `workflowType` is `"retake"` and `first_email` uses retake templates:

```json
{
  "workflowType": "retake",
  "first_email": {
    "email_type": "retake",
    "template_name": "retake_reminder",
    "template_key": "failure_retake",
    "notification_log_id": "770e8400-e29b-41d4-a716-446655440003"
  }
}
```

Retake skips a separate “initial email” state — `SendFirstEmail` sends the retake template immediately.

---

## Per-state reference

| State | Type | Input at state entry | Lambda action | Output added to state |
|-------|------|----------------------|---------------|------------------------|
| `SendFirstEmail` | Task | Full workflow input | `sendEmail` with `$.first_email.*` + context | `$.firstSend.sendResult` |
| `Wait7Days_1` | Wait | Unchanged | — | — |
| `CheckAfter7` | Task | `assignment_id`, `user_id` | `checkAssignment` | `$.checkAfter7.check` |
| `CompleteAfter7` | Choice | `$.checkAfter7.check.isComplete` | — | Routes to `WorkflowComplete` or `SendDay7` |
| `SendDay7` | Task | Context + fixed reminder_day7 | `sendEmail` | `$.day7.sendResult` |
| `Wait7Days_2` | Wait | Unchanged | — | — |
| `CheckAfter14` | Task | `assignment_id`, `user_id` | `checkAssignment` | `$.checkAfter14.check` |
| `CompleteAfter14` | Choice | `$.checkAfter14.check.isComplete` | — | Routes to `WorkflowComplete` or `SendDay14` |
| `SendDay14` | Task | Context + fixed reminder_day14 | `sendEmail` | `$.day14.sendResult` |
| `Wait16Days` | Wait | 16 days (1382400 sec) after Day 14 | — | — |
| `CheckAfter30` | Task | `assignment_id`, `user_id` | `checkAssignment` | `$.checkAfter30.check` |
| `EscalateAfter30` | Choice | `$.checkAfter30.check.shouldEscalate` | — | false → `WorkflowComplete`; true → `SendDay30` |
| `SendDay30` | Task | Context + escalation_day30, audience admin | `sendEmail` | `$.day30.sendResult` |
| `WorkflowComplete` | Succeed | — | — | — |

---

## Lambda task payloads

### `sendEmail` (Step Functions → Lambda)

```json
{
  "action": "sendEmail",
  "email_type": "reminder_day7",
  "template_name": "reminder_day7",
  "template_key": "escalation_day7",
  "assignment_id": "uuid",
  "user_id": "uuid",
  "recipient_email": "learner@cintara.ai",
  "placeholders": { "learner_name": "...", "course_name": "...", "assignment_name": "...", "due_date": "...", "current_score": "...", "retake_link": "..." },
  "notification_log_id": null,
  "audience": "learner"
}
```

**Lambda response** (stored in `$.day7.sendResult`, etc.):

```json
{
  "status": "sent",
  "message_id": "0100018a-xxxx-xxxx",
  "notification_log_id": "uuid",
  "recipients_sent": 1
}
```

For `escalation_day30`, `audience` is `"admin"`; Lambda resolves admin/CEO/HR emails from the database.

### `checkAssignment` (Step Functions → Lambda)

```json
{
  "action": "checkAssignment",
  "assignment_id": "uuid",
  "user_id": "uuid"
}
```

**Lambda response** (stored in `$.checkAfter7.check`, etc.):

```json
{
  "isComplete": false,
  "status": "in_progress",
  "attempts_used": 1,
  "max_attempts": 3,
  "shouldRemind": true,
  "shouldEscalate": true
}
```

**Completion rules:**

| `status` | `isComplete` | Effect |
|----------|--------------|--------|
| `passed` | true | Stop workflow — no further emails |
| `failed_capped` | true | Stop workflow |
| `expired` | true | Stop workflow |
| `assigned`, `in_progress` | false | Continue reminders / escalation |

---

## App webhook (`startWorkflow`)

Invoked asynchronously by the app after enqueue:

```json
{
  "action": "startWorkflow",
  "queue_id": 42,
  "payload": {
    "user_id": "uuid",
    "assignment_id": "uuid",
    "email_type": "initial",
    "template_name": "assignment_email",
    "template_key": "assignment_new",
    "recipient_email": "learner@cintara.ai",
    "placeholders": { "...": "..." },
    "notification_log_id": "uuid",
    "queued_at": "2026-06-12T10:00:00.000Z"
  }
}
```

**Lambda response:**

```json
{
  "executionArn": "arn:aws:states:us-west-2:ACCOUNT:execution:alyson-training-email-send-state-machine:assign-550e8400-initial-1718186400000",
  "workflowType": "initial",
  "startedAt": "2026-06-12T10:00:01.000Z"
}
```

---

## Wait schedule

| Transition | Wait duration | Cumulative day |
|------------|---------------|----------------|
| After Day 0 email | 7 days (604800 s) | Day 7 |
| After Day 7 reminder | 7 days (604800 s) | Day 14 |
| After Day 14 reminder | 16 days (1382400 s) | Day 30 |

Total: 7 + 7 + 16 = 30 days from first email to escalation check.
