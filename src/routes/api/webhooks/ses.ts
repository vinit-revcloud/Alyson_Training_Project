import { createFileRoute } from "@tanstack/react-router";
import { dbAdmin } from "@/integrations/neon/client.server";
import { verifySnsMessage } from "@/lib/sns-verify.server";

interface SnsMessage {
  Type: string;
  MessageId?: string;
  Token?: string;
  TopicArn?: string;
  Message?: string;
  SubscribeURL?: string;
}

interface SesEvent {
  eventType?: string;
  mail?: { messageId?: string; destination?: string[] };
  bounce?: { bouncedRecipients?: { emailAddress?: string }[] };
  complaint?: { complainedRecipients?: { emailAddress?: string }[] };
}

export const Route = createFileRoute("/api/webhooks/ses")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let raw: unknown;
        try {
          raw = await request.json();
        } catch {
          return new Response("Bad request", { status: 400 });
        }

        let body: SnsMessage;
        try {
          body = await verifySnsMessage(raw);
        } catch (error) {
          const message = error instanceof Error ? error.message : "Invalid SNS message";
          console.error("[ses-webhook]", message);
          return new Response("Forbidden", { status: 403 });
        }

        if (body.Type === "SubscriptionConfirmation" && body.SubscribeURL) {
          await fetch(body.SubscribeURL);
          return new Response("OK");
        }

        if (body.Type !== "Notification" || !body.Message) {
          return new Response("OK");
        }

        let sesEvent: SesEvent;
        try {
          sesEvent = JSON.parse(body.Message) as SesEvent;
        } catch {
          return new Response("OK");
        }

        const messageId = sesEvent.mail?.messageId;
        const eventType = sesEvent.eventType;

        if (eventType === "Delivery" && messageId) {
          await dbAdmin.from("email_send_log").update({ status: "sent" }).eq("message_id", messageId);
          await dbAdmin
            .from("notification_log")
            .update({ status: "sent", sent_at: new Date().toISOString() })
            .eq("provider_message_id", messageId);
        }

        const suppressedEmails: string[] = [];
        if (eventType === "Bounce") {
          for (const r of sesEvent.bounce?.bouncedRecipients ?? []) {
            if (r.emailAddress) suppressedEmails.push(r.emailAddress.toLowerCase());
          }
        }
        if (eventType === "Complaint") {
          for (const r of sesEvent.complaint?.complainedRecipients ?? []) {
            if (r.emailAddress) suppressedEmails.push(r.emailAddress.toLowerCase());
          }
        }

        for (const email of suppressedEmails) {
          await dbAdmin.from("suppressed_emails").upsert(
            {
              email,
              reason: eventType === "Bounce" ? "bounce" : "complaint",
              metadata: { message_id: messageId, sns_message_id: body.MessageId },
            },
            { onConflict: "email" },
          );
          await dbAdmin
            .from("email_send_log")
            .update({ status: eventType === "Bounce" ? "bounced" : "complained" })
            .eq("recipient_email", email);
        }

        return new Response("OK");
      },
    },
  },
});
