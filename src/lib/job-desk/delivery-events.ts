export type DeliveryState = { event: string; at: string; eventId: string };
const supported = new Set(["email.sent", "email.delivered", "email.delivery_delayed", "email.bounced", "email.failed", "email.complained"]);

export function nextDeliveryState(current: DeliveryState | undefined, incoming: DeliveryState) {
  if (!supported.has(incoming.event) || !Number.isFinite(Date.parse(incoming.at))) return current;
  if (current?.eventId === incoming.eventId) return current;
  if (current && Date.parse(incoming.at) < Date.parse(current.at)) return current;
  // A delayed/sent event must not undo an already confirmed terminal delivery outcome.
  if (current && ["email.delivered", "email.bounced", "email.failed", "email.complained"].includes(current.event) && ["email.sent", "email.delivery_delayed"].includes(incoming.event)) return current;
  return incoming;
}
