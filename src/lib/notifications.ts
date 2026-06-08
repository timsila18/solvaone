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

async function logNotification(event: string, input: NotificationInput) {
  console.info(`[SolvaOne notification:${event}]`, {
    userId: input.userId,
    email: input.email,
    phone: input.phone,
    subject: input.subject,
    metadata: input.metadata
  });
}
