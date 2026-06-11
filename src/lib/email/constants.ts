/**
 * All LMS transactional email is sent from this mailbox via AWS SES.
 * Assignment notices, reminders, escalations, invites, and test results
 * all use training.group@cintara.ai as From and Reply-To.
 */
export const TRAINING_SENDER_EMAIL = "training.group@cintara.ai";
export const TRAINING_SENDER_NAME = "Cintara Training";
