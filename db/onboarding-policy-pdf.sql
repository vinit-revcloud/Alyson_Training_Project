-- Policy PDF storage columns
-- Apply: npm run db:apply-policy-pdf

ALTER TABLE public.policy_documents
  ADD COLUMN IF NOT EXISTS storage_bucket text,
  ADD COLUMN IF NOT EXISTS storage_path text;
