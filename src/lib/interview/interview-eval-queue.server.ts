import { evaluateInterviewSession } from "./ai-evaluate.server";
import { notifyInterviewEvaluated } from "./interview-email.server";

/** Run AI evaluation after submit without blocking the HTTP response. */
export function queueInterviewEvaluation(sessionId: string): void {
  void (async () => {
    try {
      await evaluateInterviewSession(sessionId);
      await notifyInterviewEvaluated(sessionId);
    } catch (e) {
      console.error("[interview] background evaluation failed", sessionId, e);
    }
  })();
}
