-- Fix ambiguous queue_name in archive_email (breaks delete_email / queue drain).
DROP FUNCTION IF EXISTS public.delete_email(text, bigint);
DROP FUNCTION IF EXISTS public.move_to_dlq(text, text, bigint, jsonb);
DROP FUNCTION IF EXISTS public.archive_email(text, bigint);

CREATE OR REPLACE FUNCTION public.archive_email(queue_name text, message_id bigint)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  UPDATE public.email_queue eq
  SET archived_at = now()
  WHERE eq.id = archive_email.message_id AND eq.queue_name = archive_email.queue_name;
END;
$$;

CREATE OR REPLACE FUNCTION public.move_to_dlq(source_queue text, dlq_name text, message_id bigint, payload jsonb)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM public.enqueue_email(dlq_name, payload);
  PERFORM public.archive_email(source_queue, message_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_email(queue_name text, message_id bigint)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM public.archive_email(queue_name, message_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.archive_email(text, bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.move_to_dlq(text, text, bigint, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_email(text, bigint) TO authenticated;
