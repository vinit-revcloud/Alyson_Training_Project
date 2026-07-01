-- Scale & reliability: attempt integrity + expiry cleanup (idempotent).

-- One in-progress attempt per candidate + assessment.
CREATE UNIQUE INDEX IF NOT EXISTS idx_attempts_one_in_progress
  ON public.assessment_attempts (candidate_id, assessment_id)
  WHERE status = 'in_progress';

CREATE OR REPLACE FUNCTION public.expire_assignment(_assignment_id uuid)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  v_assessment uuid;
  v_user uuid;
BEGIN
  SELECT assessment_id, learner_user_id
  INTO v_assessment, v_user
  FROM public.assessment_assignments
  WHERE id = _assignment_id;

  UPDATE public.assessment_assignments
  SET status = 'expired', updated_at = now()
  WHERE id = _assignment_id
    AND status IN ('assigned', 'in_progress')
    AND due_at <= now();

  IF v_assessment IS NOT NULL AND v_user IS NOT NULL THEN
    UPDATE public.assessment_attempts att
    SET status = 'expired', updated_at = now()
    FROM public.candidates c
    WHERE att.candidate_id = c.id
      AND c.user_id = v_user
      AND att.assessment_id = v_assessment
      AND att.status = 'in_progress';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.record_attempt_result(_attempt_id uuid, _score numeric, _passed boolean)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  v_assessment uuid;
  v_user uuid;
  v_assignment public.assessment_assignments%ROWTYPE;
  v_attempt_status text;
BEGIN
  SELECT a.assessment_id, c.user_id, a.status
  INTO v_assessment, v_user, v_attempt_status
  FROM public.assessment_attempts a
  JOIN public.candidates c ON c.id = a.candidate_id
  WHERE a.id = _attempt_id;

  IF v_attempt_status IS NULL THEN RETURN; END IF;

  -- Idempotent: already graded — do not increment attempts_used again.
  IF v_attempt_status IN ('graded', 'submitted') THEN
    UPDATE public.assessment_attempts
    SET score = COALESCE(score, _score),
        passed = COALESCE(passed, _passed),
        status = 'graded',
        graded_at = COALESCE(graded_at, now()),
        submitted_at = COALESCE(submitted_at, now())
    WHERE id = _attempt_id;
    RETURN;
  END IF;

  UPDATE public.assessment_attempts
  SET score = _score, passed = _passed, status = 'graded',
      graded_at = now(), submitted_at = COALESCE(submitted_at, now())
  WHERE id = _attempt_id;

  IF v_user IS NULL OR v_assessment IS NULL THEN RETURN; END IF;

  SELECT * INTO v_assignment FROM public.assessment_assignments
  WHERE learner_user_id = v_user AND assessment_id = v_assessment FOR UPDATE;

  IF NOT FOUND THEN RETURN; END IF;

  UPDATE public.assessment_assignments
  SET attempts_used = v_assignment.attempts_used + 1,
      last_attempt_id = _attempt_id,
      status = CASE
        WHEN _passed THEN 'passed'
        WHEN v_assignment.attempts_used + 1 >= v_assignment.max_attempts THEN 'failed_capped'
        ELSE 'assigned'
      END,
      updated_at = now()
  WHERE id = v_assignment.id;
END;
$$;

-- DB storage usage helper for admin dashboard (Neon free tier = 512 MB).
CREATE OR REPLACE FUNCTION public.database_storage_stats()
RETURNS TABLE (
  used_bytes bigint,
  used_mb numeric,
  limit_mb numeric,
  used_pct numeric
) LANGUAGE sql STABLE AS $$
  SELECT
    pg_database_size(current_database())::bigint AS used_bytes,
    round(pg_database_size(current_database()) / 1024.0 / 1024.0, 2) AS used_mb,
    512.0::numeric AS limit_mb,
    round(
      (pg_database_size(current_database())::numeric / (512.0 * 1024.0 * 1024.0)) * 100.0,
      1
    ) AS used_pct;
$$;
