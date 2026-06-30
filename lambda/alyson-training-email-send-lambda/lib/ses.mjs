import { SESv2Client, SendEmailCommand } from "@aws-sdk/client-sesv2";

let sesClient;

function getSesClient() {
  if (!sesClient) {
    sesClient = new SESv2Client({ region: process.env.SES_REGION || process.env.AWS_REGION || "us-west-2" });
  }
  return sesClient;
}

function getFromAddress() {
  const email = process.env.SES_FROM_EMAIL || "training.group@cintara.ai";
  const name = process.env.SES_FROM_NAME || "Cintara Training";
  return `${name} <${email}>`;
}

export async function sendTemplatedEmail({ to, templateName, placeholders }) {
  const client = getSesClient();
  const command = new SendEmailCommand({
    FromEmailAddress: getFromAddress(),
    Destination: { ToAddresses: [to] },
    Content: {
      Template: {
        TemplateName: templateName,
        TemplateData: JSON.stringify(placeholders ?? {}),
      },
    },
    ...(process.env.SES_CONFIGURATION_SET
      ? { ConfigurationSetName: process.env.SES_CONFIGURATION_SET }
      : {}),
  });

  const result = await client.send(command);
  return result.MessageId ?? null;
}
