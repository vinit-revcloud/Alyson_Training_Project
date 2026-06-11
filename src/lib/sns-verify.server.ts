import { createVerify, X509Certificate } from "node:crypto";

const SNS_HOST_PATTERN = /^sns\.[a-z0-9-]+\.amazonaws\.com(\.cn)?$/i;

interface SnsEnvelope {
  Type: string;
  MessageId: string;
  TopicArn: string;
  Message: string;
  Timestamp: string;
  SignatureVersion: string;
  Signature: string;
  SigningCertURL: string;
  SubscribeURL?: string;
  Token?: string;
  Subject?: string;
}

function buildStringToSign(message: SnsEnvelope): string {
  const fields: Array<keyof SnsEnvelope> =
    message.Type === "Notification"
      ? ["Message", "MessageId", "Subject", "Timestamp", "TopicArn", "Type"]
      : ["Message", "MessageId", "SubscribeURL", "Timestamp", "Token", "TopicArn", "Type"];

  return fields
    .filter((key) => {
      const value = message[key];
      return typeof value === "string" && value.length > 0;
    })
    .map((key) => `${key}\n${message[key] as string}`)
    .join("\n");
}

function assertTrustedCertUrl(url: string): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("Invalid SNS SigningCertURL");
  }
  if (parsed.protocol !== "https:") throw new Error("SNS SigningCertURL must use HTTPS");
  if (!SNS_HOST_PATTERN.test(parsed.hostname)) {
    throw new Error("SNS SigningCertURL host is not trusted");
  }
}

/** Verify AWS SNS message signature (SubscriptionConfirmation + Notification). */
export async function verifySnsMessage(raw: unknown): Promise<SnsEnvelope> {
  if (!raw || typeof raw !== "object") throw new Error("Invalid SNS payload");

  const message = raw as SnsEnvelope;
  if (!message.Type || !message.Signature || !message.SigningCertURL || !message.MessageId) {
    throw new Error("Missing SNS signature fields");
  }

  assertTrustedCertUrl(message.SigningCertURL);

  const certResponse = await fetch(message.SigningCertURL);
  if (!certResponse.ok) throw new Error("Failed to fetch SNS signing certificate");

  const pem = await certResponse.text();
  const cert = new X509Certificate(pem);
  if (cert.validTo && Date.now() > Date.parse(cert.validTo)) {
    throw new Error("SNS signing certificate expired");
  }

  const algorithm = message.SignatureVersion === "2" ? "RSA-SHA256" : "RSA-SHA1";
  const verifier = createVerify(algorithm);
  verifier.update(buildStringToSign(message));
  verifier.end();

  const ok = verifier.verify(pem, message.Signature, "base64");
  if (!ok) throw new Error("Invalid SNS message signature");

  return message;
}
