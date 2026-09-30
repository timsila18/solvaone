export function hasVerifiedJobDeskPayment(order: { payment_status: string; amount?: number | string | null; payment_reference?: string | null } | null | undefined) {
  if (!order) return false;
  if (order.payment_status === "waived") return true;
  return order.payment_status === "paid" && Number(order.amount) > 0 && Boolean(order.payment_reference?.trim());
}
