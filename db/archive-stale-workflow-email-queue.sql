-- Archive stale workflow-shaped queue rows (no to/html) left before transactional rollout.
UPDATE public.email_queue
SET archived_at = now()
WHERE archived_at IS NULL
  AND payload->>'to' IS NULL
  AND payload->>'recipient_email' IS NOT NULL;
