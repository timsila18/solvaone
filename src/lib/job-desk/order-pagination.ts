export const ORDER_PAGE_SIZE = 30;

type QueueOrder = { id: string; status: string; payment_status: string; created_at: string };

export function prioritizeOrders<T extends QueueOrder>(orders: T[], submitted: ReadonlySet<string>) {
  const rank = (order: T) => {
    if (["completed", "cancelled", "paused"].includes(order.status)) return 3;
    if (!["paid", "waived"].includes(order.payment_status)) return 2;
    return submitted.has(order.id) ? 1 : 0;
  };
  return [...orders].sort((a, b) => rank(a) - rank(b)
    || b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id));
}

export function orderPagination(rawPage: string | string[] | undefined, total: number) {
  const requested = typeof rawPage === "string" && /^[1-9]\d*$/.test(rawPage) ? Number(rawPage) : 1;
  const pages = Math.max(1, Math.ceil(total / ORDER_PAGE_SIZE));
  const page = Number.isSafeInteger(requested) ? Math.min(requested, pages) : 1;
  const from = (page - 1) * ORDER_PAGE_SIZE;
  return { page, pages, from, to: from + ORDER_PAGE_SIZE - 1 };
}

