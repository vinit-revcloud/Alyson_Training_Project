# alyson-training-email-send-lambda

Single Lambda for the Alyson Training assignment email workflow. Routes on `event.action`:

| Action | Invoked by | Purpose |
|--------|------------|---------|
| `startWorkflow` | App (async after enqueue) | Start Step Functions execution, archive queue row |
| `sendEmail` | Step Functions | Send SES templated email, POST send-result callback |
| `checkAssignment` | Step Functions | Query assignment completion before reminders |

## AWS resources

| Resource | Name |
|----------|------|
| Lambda | `alyson-training-email-send-lambda` |
| State machine | `alyson-training-email-send-state-machine` |
| Lambda region | `us-west-2` |
| SES region | `us-east-1` |

## Deploy

```bash
cd lambda/alyson-training-email-send-lambda
chmod +x zip-and-deploy.sh
./zip-and-deploy.sh
```

Set `LAMBDA_DEPLOY_BUCKET` to override the default S3 bucket. The script runs `npm install --omit=dev`, zips the handler (excludes `state-machine/`, docs), uploads to S3, and runs `aws lambda update-function-code`.

Configure the Lambda handler in AWS as **`index.handler`**.

## Lambda environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `STATE_MACHINE_ARN` | Yes | ARN of `alyson-training-email-send-state-machine` |
| `DATABASE_URL` | Yes | Neon Postgres connection string |
| `SES_REGION` | Yes | `us-east-1` (where SES identity is verified) |
| `SES_FROM_EMAIL` | Yes | `training.group@cintara.ai` |
| `SES_FROM_NAME` | No | `Cintara Training` |
| `SES_CONFIGURATION_SET` | No | `alyson-training` |
| `APP_BASE_URL` | Yes | Production app URL for send-result callback |
| `CRON_SECRET` | Yes | Same secret as app (`Bearer` auth) |
| `QUEUE_NAME` | No | Default `transactional_emails` |
| `AWS_REGION` | No | `us-west-2` for Step Functions client |
| `ADMIN_ESCALATION_ROLES` | No | Comma-separated roles for Day 30; default `admin,ceo,hiring_manager` |

## IAM

**Lambda execution role:**

- `ses:SendEmail`, `ses:SendTemplatedEmail` (SES in `us-east-1`)
- `states:StartExecution` on the state machine ARN
- `logs:CreateLogGroup`, `logs:CreateLogStream`, `logs:PutLogEvents`

**State machine role:**

- `lambda:InvokeFunction` on `alyson-training-email-send-lambda`

**App server role / credentials:**

- `lambda:InvokeFunction` on `alyson-training-email-send-lambda` (async `startWorkflow`)

## State machine

Import or update the ASL from [`state-machine/definition.asl.json`](state-machine/definition.asl.json).

Per-state input/output reference: [`state-machine/STATE_INPUTS.md`](state-machine/STATE_INPUTS.md).

## Manual test events

### startWorkflow

```json
{
  "action": "startWorkflow",
  "queue_id": 1,
  "payload": {
    "user_id": "YOUR_USER_UUID",
    "assignment_id": "YOUR_ASSIGNMENT_UUID",
    "email_type": "initial",
    "template_name": "assignment_email",
    "template_key": "assignment_new",
    "recipient_email": "learner@cintara.ai",
    "placeholders": {
      "learner_name": "Test Learner",
      "course_name": "Test Course",
      "assignment_name": "Test Assignment",
      "due_date": "6/20/2026",
      "current_score": "—",
      "retake_link": "https://app.example.com/attempt/YOUR_ASSIGNMENT_UUID"
    },
    "notification_log_id": "YOUR_NOTIFICATION_LOG_UUID",
    "queued_at": "2026-06-12T10:00:00.000Z"
  }
}
```

### sendEmail

```json
{
  "action": "sendEmail",
  "email_type": "reminder_day7",
  "template_name": "reminder_day7",
  "template_key": "escalation_day7",
  "assignment_id": "YOUR_ASSIGNMENT_UUID",
  "user_id": "YOUR_USER_UUID",
  "recipient_email": "learner@cintara.ai",
  "placeholders": {
    "learner_name": "Test Learner",
    "course_name": "Test Course",
    "assignment_name": "Test Assignment",
    "due_date": "6/20/2026",
    "current_score": "54%",
    "retake_link": "https://app.example.com/attempt/YOUR_ASSIGNMENT_UUID"
  },
  "audience": "learner"
}
```

### checkAssignment

```json
{
  "action": "checkAssignment",
  "assignment_id": "YOUR_ASSIGNMENT_UUID",
  "user_id": "YOUR_USER_UUID"
}
```

## App integration

After enqueue, the app invokes this Lambda asynchronously. Set in app `.env`:

```
EMAIL_WORKFLOW_LAMBDA_ARN=arn:aws:lambda:us-west-2:ACCOUNT_ID:function:alyson-training-email-send-lambda
```

See [`.env.example`](../../.env.example) in the repo root.
