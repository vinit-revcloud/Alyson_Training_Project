import {
  SESv2Client,
  SendEmailCommand,
  type SendEmailCommandInput,
} from "@aws-sdk/client-sesv2";
import { getSesConfig } from "@/lib/config.server";
import { TRAINING_SENDER_EMAIL, TRAINING_SENDER_NAME } from "./constants";
import { htmlToPlainText } from "./html-utils";

export { TRAINING_SENDER_EMAIL as SENDER_EMAIL, TRAINING_SENDER_NAME as SENDER_NAME };

export class SesSendError extends Error {
  status: number;
  retryAfterSeconds: number | null;
  constructor(message: string, status: number, retryAfterSeconds: number | null = null) {
    super(message);
    this.name = "SesSendError";
    this.status = status;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export interface SesSendInput {
  to: string;
  subject: string;
  html: string;
  text?: string;
  /** Optional CC/BCC recipients — From remains training.group@cintara.ai */
  cc?: string[];
}

let client: SESv2Client | null = null;

function getClient(): SESv2Client {
  if (client) return client;
  const cfg = getSesConfig();
  if (!cfg.accessKeyId || !cfg.secretAccessKey) {
    throw new SesSendError(
      "AWS credentials missing (AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY)",
      500,
    );
  }
  client = new SESv2Client({
    region: cfg.region,
    credentials: {
      accessKeyId: cfg.accessKeyId,
      secretAccessKey: cfg.secretAccessKey,
    },
  });
  return client;
}

export async function sesSend(input: SesSendInput): Promise<{ messageId: string }> {
  const cfg = getSesConfig();
  const fromEmail = TRAINING_SENDER_EMAIL;
  const fromName = cfg.fromName || TRAINING_SENDER_NAME;
  const textBody = input.text ?? htmlToPlainText(input.html);

  const params: SendEmailCommandInput = {
    FromEmailAddress: `${fromName} <${fromEmail}>`,
    Destination: {
      ToAddresses: [input.to],
      ...(input.cc?.length ? { CcAddresses: input.cc } : {}),
    },
    ReplyToAddresses: [TRAINING_SENDER_EMAIL],
    Content: {
      Simple: {
        Subject: { Data: input.subject, Charset: "UTF-8" },
        Body: {
          Html: { Data: input.html, Charset: "UTF-8" },
          Text: { Data: textBody, Charset: "UTF-8" },
        },
      },
    },
    ...(cfg.configurationSet ? { ConfigurationSetName: cfg.configurationSet } : {}),
  };

  try {
    const result = await getClient().send(new SendEmailCommand(params));
    return { messageId: result.MessageId ?? `ses-${Date.now()}` };
  } catch (err: unknown) {
    const name = err && typeof err === "object" && "name" in err ? String((err as { name: string }).name) : "";
    const message = err instanceof Error ? err.message : String(err);

    // Misconfigured SES_CONFIGURATION_SET should not block all mail.
    if (
      cfg.configurationSet &&
      message.includes("Configuration set") &&
      message.includes("does not exist")
    ) {
      const retryParams = { ...params };
      delete retryParams.ConfigurationSetName;
      const result = await getClient().send(new SendEmailCommand(retryParams));
      console.warn(
        `[ses] Configuration set "${cfg.configurationSet}" not found — sent without it.`,
      );
      return { messageId: result.MessageId ?? `ses-${Date.now()}` };
    }

    if (name === "Throttling" || message.includes("Throttling") || message.includes("429")) {
      throw new SesSendError(`SES throttled: ${message}`, 429, 60);
    }
    if (name === "MessageRejected" || message.includes("not verified")) {
      throw new SesSendError(`SES rejected: ${message}`, 403);
    }
    throw new SesSendError(`SES send failed: ${message}`, 500);
  }
}
