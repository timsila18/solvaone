import { createSupabaseAdminClient } from "@/lib/supabase/admin";

type NotificationInput = {
  userId?: string;
  email?: string | null;
  phone?: string | null;
  subject: string;
  message: string;
  metadata?: Record<string, unknown>;
};

export async function notifyPaymentSuccessful(input: NotificationInput) {
  return logNotification("payment.successful", input);
}

export async function notifyPaymentFailed(input: NotificationInput) {
  return logNotification("payment.failed", input);
}

export async function notifyDocumentReady(input: NotificationInput) {
  return logNotification("document.ready", input);
}

export async function notifyReceiptGenerated(input: NotificationInput) {
  return logNotification("receipt.generated", input);
}

export async function notifyWelcome(input: NotificationInput) {
  return logNotification("welcome", input);
}

export async function notifyAbandonedCheckout(input: NotificationInput) {
  return logNotification("checkout.abandoned", input);
}

export async function notifyPasswordReset(input: NotificationInput) {
  return logNotification("password.reset", input);
}

async function logNotification(event: string, input: NotificationInput) {
  const message = input.message;
  console.info(`[SolvaOne notification:${event}]`, { userId: input.userId, email: input.email, phone: input.phone, subject: input.subject, metadata: input.metadata });

  try {
    const supabase = createSupabaseAdminClient();
    if (input.userId) {
      await supabase.from("notifications").insert({
        user_id: input.userId,
        type: event,
        title: input.subject,
        message,
        status: "unread"
      });
    }

    if (input.email) {
      const provider = process.env.EMAIL_PROVIDER;
      await supabase.from("email_logs").insert({
        user_id: input.userId ?? null,
        email: input.email,
        subject: input.subject,
        status: provider ? "queued" : "logged",
        provider_response: provider ? { provider, configured: Boolean(process.env.RESEND_API_KEY || provider !== "resend") } : { provider: "console" }
      });
    }
  } catch (error) {
    console.info("[SolvaOne notification storage fallback]", error instanceof Error ? error.message : "Notification storage unavailable");
  }
}
