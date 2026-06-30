# AWS SES Setup for Alyson Training

Sender: **`training.group@cintara.ai`** (Cintara Training)

All LMS email — assignments, daily reminders, escalations, invites, failure/retake notices, and test-completed alerts — is sent **from and replied-to** at this address via AWS SES. No other sender mailbox is used.

## 1. Verify domain in SES

1. Open [Amazon SES](https://console.aws.amazon.com/ses/) in **US West (Oregon) `us-west-2`** (or your chosen region — `AWS_REGION` / `SES_REGION` must match).
2. **Verified identities** → **Create identity** → **Domain** → `cintara.ai`.
3. Enable **DKIM** and copy the 3 CNAME records into your DNS.

## 2. DNS records

| Type | Name | Value |
|------|------|-------|
| TXT | `@` or `cintara.ai` | `v=spf1 include:amazonses.com ~all` |
| TXT | `_dmarc.cintara.ai` | `v=DMARC1; p=none; rua=mailto:dmarcreports@cintara.ai` |
| CNAME | (3 DKIM tokens from SES) | (values from SES console) |

## 3. Configuration set

1. SES → **Configuration sets** → Create `alyson-training`.
2. Add **Event destination** → SNS topic `alyson-ses-events`.
3. Subscribe HTTPS endpoint: `https://<APP_BASE_URL>/api/webhooks/ses` (confirm subscription in app logs).

## 4. Production access

Request **production access** in SES account dashboard (required to email unverified recipients).

## 5. IAM policy

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["ses:SendEmail", "ses:SendRawEmail"],
      "Resource": "*"
    }
  ]
}
```

Copy credentials into `.env` (see `.env.example`).

## 6. Test

1. Start app: `npm run dev`
2. Queue a test email from **Email Testing** in admin, or POST to `/api/internal/email/process` with `Authorization: Bearer <CRON_SECRET>`.
3. Check `notification_log` and `email_send_log` tables.
