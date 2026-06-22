-- Onboarding / trial email templates
-- Apply: npm run db:apply-onboarding-email-templates

INSERT INTO public.email_templates (key, audience, subject, body_md) VALUES
('trial_due_soon', 'admin',
 'Trial due soon: {assignment_name}',
 E'Hi {learner_name},\n\nReminder: trial project **{assignment_name}** is due {due_date}.\n\nReview in the hiring pipeline.\n\n— Alyson Training'),
('trial_submitted', 'admin',
 'Trial submitted: {assignment_name}',
 E'{learner_name} submitted their trial project.\n\nReview submission in the pipeline and schedule CEO review.\n\n— Alyson Training'),
('onboarding_stalled', 'learner',
 'Continue your onboarding',
 E'Hi {learner_name},\n\nWe noticed you have not visited onboarding guides recently. Continue here: {retake_link}\n\n— Alyson Training'),
('policy_ack_required', 'learner',
 'Action required: acknowledge company policies',
 E'Hi {learner_name},\n\nPlease review and acknowledge required policies: {retake_link}\n\n— Alyson Training')
ON CONFLICT (key) DO UPDATE SET
  subject = EXCLUDED.subject,
  body_md = EXCLUDED.body_md,
  audience = EXCLUDED.audience;
