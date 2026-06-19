import { checkAssignment, sendEmail, startWorkflow } from "./lib/actions.mjs";

/**
 * Single Lambda handler for assignment email workflow.
 * Routes on event.action: startWorkflow | sendEmail | checkAssignment
 */
export async function handler(event) {
  const action = event?.action;
  console.info("[email-lambda] action=", action);

  switch (action) {
    case "startWorkflow":
      return startWorkflow(event);
    case "sendEmail":
      return sendEmail(event);
    case "checkAssignment":
      return checkAssignment(event);
    default:
      throw new Error(`Unknown action: ${action ?? "(missing)"}`);
  }
}
