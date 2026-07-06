-- Disable legacy cron reminders/escalations; Step Functions will handle 7/14/30-day ladder later.
UPDATE public.notification_schedules
SET enabled = false, updated_at = now()
WHERE job_key IN ('reminder_daily', 'escalation');
