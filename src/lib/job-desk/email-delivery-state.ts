export const terminalDeliveryEvents = new Set(["email.delivered", "email.bounced", "email.failed", "email.complained"]);
const events = new Set(["sent", "delivered", "delivery_delayed", "bounced", "failed", "complained"]);

export function observedDelivery(payload: unknown, providerId: string, previous: any, now: string) {
  if (!payload || typeof payload !== "object") return null;
  const value = payload as { id?: unknown; last_event?: unknown };
  if (value.id !== providerId || typeof value.last_event !== "string" || !events.has(value.last_event)) return null;
  if (terminalDeliveryEvents.has(previous?.event)) return previous;
  return { event: `email.${value.last_event}`, at: now, eventId: `resend-poll:${providerId}:${value.last_event}`, source: "provider_poll", observedAt: now };
}
