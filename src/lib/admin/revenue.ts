export type RevenueRow = {
  id: string; product: string; product_id?: string | null; amount: number | string;
  status: string; created_at: string; paid_at?: string | null;
  mpesa_receipt_number?: string | null; source?: string; currency?: string;
};
export type RevenueOrder = { id: string; service_type: string; amount: number | string; payment_status: string; payment_reference?: string | null; created_at: string; paid_at?: string | null };
export type RevenueAttempt = Omit<RevenueRow, "product"> & { order_id: string; updated_at?: string };

export async function readAllRows<T>(page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += 500) {
    const result = await page(from, from + 499);
    if (result.error) throw new Error("Dashboard records could not be loaded. Retry instead of relying on incomplete totals.");
    rows.push(...(result.data ?? []));
    if ((result.data?.length ?? 0) < 500) return rows;
  }
}

export function revenueLedger(payments: RevenueRow[], orders: RevenueOrder[], attempts: RevenueAttempt[]): RevenueRow[] {
  const rows = payments.map(row => ({ ...row, source: "Document payment" }));
  const seenReceipts = new Set(payments.filter(row => ["paid", "successful"].includes(row.status)).map(row => row.mpesa_receipt_number?.trim()).filter(Boolean));
  for (const order of orders) {
    const successful = attempts.filter(row => row.order_id === order.id && row.status === "successful");
    const hasMatchingAttempt = successful.some(row => Number(row.amount) === Number(order.amount) && Boolean(row.mpesa_receipt_number));
    if (order.payment_status === "paid" && Number(order.amount) > 0 && !hasMatchingAttempt) {
      const reference = order.payment_reference?.trim();
      if (!reference || !seenReceipts.has(reference)) rows.push({ id: `order:${order.id}`, product: order.service_type, amount: order.amount, status: "successful", created_at: order.created_at, paid_at: order.paid_at, source: "Admin-recorded Job Hunting payment", currency: "KES" });
    }
  }
  for (const attempt of attempts) {
    const receipt = attempt.mpesa_receipt_number?.trim();
    if (attempt.status === "successful" && receipt && seenReceipts.has(receipt)) continue;
    if (attempt.status === "successful" && receipt) seenReceipts.add(receipt);
    const order = orders.find(row => row.id === attempt.order_id);
    rows.push({ ...attempt, id: `attempt:${attempt.id}`, product: order?.service_type ?? "job_search_full", status: attempt.status === "successful" && !receipt ? "needs_review" : attempt.status, paid_at: attempt.status === "successful" ? order?.paid_at ?? attempt.updated_at : null, source: "Job Hunting M-Pesa", currency: "KES" });
  }
  return rows.sort((a,b) => Date.parse(b.paid_at ?? b.created_at) - Date.parse(a.paid_at ?? a.created_at));
}

export function nairobiBoundaries(now = new Date()) {
  const local = new Date(now.getTime() + 3 * 3600000);
  const today = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) - 3 * 3600000;
  return { today, month: Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), 1) - 3 * 3600000, week: today - ((local.getUTCDay() + 6) % 7) * 86400000 };
}

export function summarizeRevenue(rows: RevenueRow[], params: { range?: string; product?: string; status?: string }, now = new Date()) {
  const boundaries = nairobiBoundaries(now);
  const base = rows.filter(row => !params.product || params.product === "all" || (row.product_id ?? row.product) === params.product);
  const paid = base.filter(row => ["successful", "paid"].includes(row.status));
  const sum = (items: RevenueRow[]) => items.reduce((total,row) => total + Number(row.amount), 0);
  const dated = (row: RevenueRow) => Date.parse(row.paid_at ?? row.created_at);
  const inPeriod = (row: RevenueRow, start: number) => dated(row) >= start && dated(row) <= now.getTime();
  const start = boundaries[params.range as keyof typeof boundaries];
  const filtered = base.filter(row => (!start || inPeriod(row,start)) && (!params.status || params.status === "all" || row.status === params.status || params.status === "successful" && row.status === "paid"));
  const successful = filtered.filter(row => ["successful", "paid"].includes(row.status));
  const byProduct: Record<string,number> = {};
  successful.forEach(row => { byProduct[row.product_id ?? row.product] = (byProduct[row.product_id ?? row.product] ?? 0) + Number(row.amount); });
  return { filtered, successful, byProduct, revenue: sum(paid), selectedRevenue: sum(successful), revenueToday: sum(paid.filter(row => inPeriod(row,boundaries.today))), revenueMonth: sum(paid.filter(row => inPeriod(row,boundaries.month))), failed: filtered.filter(row=>row.status==="failed").length, pending: filtered.filter(row=>["pending","processing","initiating","needs_review"].includes(row.status)).length, averageOrderValue: successful.length ? sum(successful)/successful.length : 0, conversionRate: filtered.length ? Math.round(successful.length/filtered.length*100) : 0, adminRecorded: sum(paid.filter(row=>row.source==="Admin-recorded Job Hunting payment")) };
}
