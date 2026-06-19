import { InvokeCommand, LambdaClient } from "@aws-sdk/client-lambda";
import type { AssignmentEmailType } from "@/lib/email/enqueue-assignment-email.shared";

const WORKFLOW_TRIGGER_TYPES = new Set<AssignmentEmailType>(["initial", "retake"]);

let lambdaClient: LambdaClient | null = null;

function getWorkflowLambdaArn(): string | null {
  const arn = process.env.EMAIL_WORKFLOW_LAMBDA_ARN?.trim();
  return arn || null;
}

function parseRegionFromArn(arn: string): string {
  const region = arn.split(":")[3];
  return region || process.env.EMAIL_WORKFLOW_LAMBDA_REGION?.trim() || "us-west-2";
}

function getLambdaClient(arn: string): LambdaClient {
  if (!lambdaClient) {
    const region = parseRegionFromArn(arn);
    lambdaClient = new LambdaClient({
      region,
      ...(process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY
        ? {
            credentials: {
              accessKeyId: process.env.AWS_ACCESS_KEY_ID,
              secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
            },
          }
        : {}),
    });
  }
  return lambdaClient;
}

export interface TriggerEmailWorkflowInput {
  queueId: number;
  payload: Record<string, unknown>;
  emailType: AssignmentEmailType;
}

/** Fire-and-forget: invoke Lambda to start Step Functions workflow after enqueue. */
export async function triggerEmailWorkflow(input: TriggerEmailWorkflowInput): Promise<void> {
  if (!WORKFLOW_TRIGGER_TYPES.has(input.emailType)) return;

  const functionArn = getWorkflowLambdaArn();
  if (!functionArn) {
    console.warn("[email] EMAIL_WORKFLOW_LAMBDA_ARN not set — workflow not triggered");
    return;
  }

  const event = {
    action: "startWorkflow",
    queue_id: input.queueId,
    payload: input.payload,
  };

  try {
    await getLambdaClient(functionArn).send(
      new InvokeCommand({
        FunctionName: functionArn,
        InvocationType: "Event",
        Payload: Buffer.from(JSON.stringify(event)),
      }),
    );
    console.info(
      `[email] triggerEmailWorkflow: queued queue_id=${input.queueId} email_type=${input.emailType}`,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(
      `[email] triggerEmailWorkflow failed queue_id=${input.queueId}: ${message}`,
    );
  }
}
