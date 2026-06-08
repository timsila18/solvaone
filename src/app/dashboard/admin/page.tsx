import { redirect } from "next/navigation";
import { AppShell } from "@/components/dashboard/app-shell";
import { createSupabaseServerClient, getCurrentUser } from "@/lib/supabase/server";
import { products, type ProductKey } from "@/lib/types";
import { formatKes } from "@/lib/utils";

export default async function AdminPage({ searchParams }: { searchParams: Promise<{ range?: string; product?: string; status?: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const supabase = await createSupabaseServerClient();
  const { data: profile } = await supabase.from("users").select("role").eq("id", user.id).single();
  if (profile?.role !== "admin") redirect("/dashboard");

  const params = await searchParams;
  const [usersCount, allPayments, paidPayments, failedPayments, pendingPayments, documentsCount, activity, generations, failedGenerations, paymentEvents] = await Promise.all([
    supabase.from("users").select("id", { count: "exact", head: true }),
    supabase.from("payments").select("id,product,product_id,amount,status,created_at,result_description").order("created_at", { ascending: false }).limit(2000),
    supabase.from("payments").select("product,amount,status").eq("status", "paid"),
    supabase.from("payments").select("id,amount,product,created_at", { count: "exact" }).eq("status", "failed").limit(10),
    supabase.from("payments").select("id", { count: "exact", head: true }).in("status", ["pending", "processing"]),
    supabase.from("documents").select("id", { count: "exact", head: true }),
    supabase.from("audit_logs").select("action,entity_type,created_at").order("created_at", { ascending: false }).limit(12),
    supabase.from("ai_generations").select("product_type,total_tokens,estimated_cost,status,quality_scores").order("created_at", { ascending: false }).limit(1000),
    supabase.from("ai_generations").select("id,error_message,product_type,created_at", { count: "exact" }).eq("status", "failed").limit(10),
    supabase.from("payment_events").select("event_type,created_at").order("created_at", { ascending: false }).limit(500)
  ]);

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const filteredPayments = (allPayments.data ?? []).filter((payment) => {
    const productOk = !params.product || params.product === "all" || payment.product_id === params.product || payment.product === params.product;
    const statusOk = !params.status || params.status === "all" || payment.status === params.status;
    return productOk && statusOk;
  });
  const successfulPayments = filteredPayments.filter((payment) => payment.status === "successful" || payment.status === "paid");
  const revenue = successfulPayments.reduce((sum, payment) => sum + Number(payment.amount), 0);
  const revenueToday = successfulPayments.filter((payment) => new Date(payment.created_at) >= today).reduce((sum, payment) => sum + Number(payment.amount), 0);
  const revenueMonth = successfulPayments.filter((payment) => new Date(payment.created_at) >= monthStart).reduce((sum, payment) => sum + Number(payment.amount), 0);
  const averageOrderValue = successfulPayments.length ? revenue / successfulPayments.length : 0;
  const conversionRate = filteredPayments.length ? Math.round((successfulPayments.length / filteredPayments.length) * 100) : 0;
  const callbackFailures = (paymentEvents.data ?? []).filter((event) => event.event_type?.includes("unknown") || event.event_type?.includes("unmatched")).length;
  const byProduct = successfulPayments.reduce(
    (acc, payment) => {
      acc[payment.product as ProductKey] = (acc[payment.product as ProductKey] ?? 0) + Number(payment.amount);
      return acc;
    },
    {} as Partial<Record<ProductKey, number>>
  );
  const highestSellingProduct = Object.entries(byProduct).sort((a, b) => b[1] - a[1])[0]?.[0] as ProductKey | undefined;
  const generationRows = generations.data ?? [];
  const totalTokens = generationRows.reduce((sum, item) => sum + Number(item.total_tokens ?? 0), 0);
  const estimatedAiCost = generationRows.reduce((sum, item) => sum + Number(item.estimated_cost ?? 0), 0);
  const generationsByProduct = generationRows.reduce(
    (acc, item) => {
      acc[item.product_type as ProductKey] = (acc[item.product_type as ProductKey] ?? 0) + 1;
      return acc;
    },
    {} as Partial<Record<ProductKey, number>>
  );
  const mostUsedProduct = Object.entries(generationsByProduct).sort((a, b) => b[1] - a[1])[0]?.[0] as ProductKey | undefined;
  const qualityValues = generationRows
    .map((item) => Number((item.quality_scores as { completeness?: number } | null)?.completeness ?? 0))
    .filter(Boolean);
  const averageQuality = qualityValues.length
    ? Math.round(qualityValues.reduce((sum, value) => sum + value, 0) / qualityValues.length)
    : 0;

  return (
    <AppShell email={user.email} isAdmin>
      <div className="mb-8">
        <h1 className="text-4xl font-black">Admin Dashboard</h1>
        <p className="mt-2 text-black/55 dark:text-white/55">Operational visibility for SolvaOne.</p>
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Metric label="Total Users" value={String(usersCount.count ?? 0)} />
        <Metric label="Revenue Today" value={formatKes(revenueToday)} />
        <Metric label="Revenue This Month" value={formatKes(revenueMonth)} />
        <Metric label="Revenue All Time" value={formatKes(revenue)} />
        <Metric label="Documents Generated" value={String(documentsCount.count ?? 0)} />
        <Metric label="Successful Payments" value={String(successfulPayments.length)} />
        <Metric label="Failed Payments" value={String(failedPayments.count ?? 0)} />
        <Metric label="Pending Payments" value={String(pendingPayments.count ?? 0)} />
        <Metric label="Average Order Value" value={formatKes(averageOrderValue)} />
        <Metric label="Conversion Rate" value={`${conversionRate}%`} />
        <Metric label="Top Product" value={highestSellingProduct ? products[highestSellingProduct].title : "None"} />
        <Metric label="Callback Failures" value={String(callbackFailures)} />
        <Metric label="AI Generations" value={String(generationRows.length)} />
        <Metric label="AI Tokens" value={totalTokens.toLocaleString()} />
        <Metric label="Estimated AI Cost" value={`$${estimatedAiCost.toFixed(4)}`} />
        <Metric label="Average Quality" value={averageQuality ? `${averageQuality}%` : "0%"} />
      </div>
      <form className="mt-6 flex flex-wrap gap-3 rounded-lg border border-black/10 p-4 dark:border-white/10">
        <select name="range" defaultValue={params.range ?? "month"} className="h-10 rounded-lg border border-black/10 bg-white px-3 text-sm dark:border-white/10 dark:bg-black">
          <option value="today">Today</option>
          <option value="week">This week</option>
          <option value="month">This month</option>
          <option value="all">All time</option>
        </select>
        <select name="product" defaultValue={params.product ?? "all"} className="h-10 rounded-lg border border-black/10 bg-white px-3 text-sm dark:border-white/10 dark:bg-black">
          <option value="all">All products</option>
          {(Object.keys(products) as ProductKey[]).map((key) => (
            <option key={key} value={key}>{products[key].title}</option>
          ))}
        </select>
        <select name="status" defaultValue={params.status ?? "all"} className="h-10 rounded-lg border border-black/10 bg-white px-3 text-sm dark:border-white/10 dark:bg-black">
          <option value="all">All statuses</option>
          <option value="successful">Successful</option>
          <option value="processing">Processing</option>
          <option value="failed">Failed</option>
          <option value="timed_out">Timed out</option>
          <option value="cancelled">Cancelled</option>
        </select>
        <button className="h-10 rounded-lg bg-brand-blue px-4 text-sm font-bold text-white">Apply filters</button>
      </form>
      <section className="mt-8 grid gap-5 xl:grid-cols-2">
        <div className="rounded-lg border border-black/10 p-5 dark:border-white/10">
          <h2 className="text-xl font-black">Revenue by Product</h2>
          <div className="mt-5 space-y-3">
            {(Object.keys(products) as ProductKey[]).map((key) => (
              <div key={key}>
                <div className="flex justify-between text-sm font-bold">
                  <span>{products[key].title}</span>
                  <span>{formatKes(byProduct[key] ?? 0)}</span>
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-black/10 dark:bg-white/10">
                  <div
                    className="h-full rounded-full bg-brand-blue"
                    style={{ width: revenue ? `${Math.min(100, ((byProduct[key] ?? 0) / revenue) * 100)}%` : "0%" }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-lg border border-black/10 p-5 dark:border-white/10">
          <h2 className="text-xl font-black">Generations by Product</h2>
          <div className="mt-5 space-y-3">
            {(Object.keys(products) as ProductKey[]).map((key) => (
              <div key={key}>
                <div className="flex justify-between text-sm font-bold">
                  <span>{products[key].title}</span>
                  <span>{generationsByProduct[key] ?? 0}</span>
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-black/10 dark:bg-white/10">
                  <div
                    className="h-full rounded-full bg-brand-blue"
                    style={{ width: generationRows.length ? `${Math.min(100, ((generationsByProduct[key] ?? 0) / generationRows.length) * 100)}%` : "0%" }}
                  />
                </div>
              </div>
            ))}
          </div>
          <p className="mt-4 text-sm font-semibold text-black/55 dark:text-white/55">
            Most used product: {mostUsedProduct ? products[mostUsedProduct].title : "No generations yet"}
          </p>
        </div>
        <div className="rounded-lg border border-black/10 p-5 dark:border-white/10">
          <h2 className="text-xl font-black">User Activity</h2>
          <div className="mt-5 space-y-3">
            {activity.data?.length ? (
              activity.data.map((item, index) => (
                <div key={`${item.created_at}-${index}`} className="flex justify-between gap-3 rounded-lg border border-black/10 p-3 text-sm dark:border-white/10">
                  <span className="font-bold">{item.action}</span>
                  <span className="text-black/50 dark:text-white/50">{new Date(item.created_at).toLocaleString()}</span>
                </div>
              ))
            ) : (
              <p className="text-sm text-black/55 dark:text-white/55">No activity has been recorded yet.</p>
            )}
          </div>
        </div>
      </section>
      <section className="mt-8 rounded-lg border border-black/10 p-5 dark:border-white/10">
        <h2 className="text-xl font-black">Failed AI Generations</h2>
        <div className="mt-5 space-y-3">
          {failedGenerations.data?.length ? (
            failedGenerations.data.map((item) => (
              <div key={item.id} className="rounded-lg border border-black/10 p-3 text-sm dark:border-white/10">
                <div className="flex justify-between gap-3 font-bold">
                  <span>{products[item.product_type as ProductKey]?.title ?? item.product_type}</span>
                  <span>{new Date(item.created_at).toLocaleString()}</span>
                </div>
                <p className="mt-2 text-black/55 dark:text-white/55">{item.error_message}</p>
              </div>
            ))
          ) : (
            <p className="text-sm text-black/55 dark:text-white/55">No failed AI generations recorded.</p>
          )}
        </div>
      </section>
      <section className="mt-8 rounded-lg border border-black/10 p-5 dark:border-white/10">
        <h2 className="text-xl font-black">Failed Payments</h2>
        <div className="mt-5 overflow-x-auto">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead className="text-black/45 dark:text-white/45">
              <tr>
                <th className="py-3 font-bold">Product</th>
                <th className="py-3 font-bold">Amount</th>
                <th className="py-3 font-bold">Created</th>
              </tr>
            </thead>
            <tbody>
              {failedPayments.data?.length ? (
                failedPayments.data.map((payment) => (
                  <tr key={payment.id} className="border-t border-black/10 dark:border-white/10">
                    <td className="py-4">{products[payment.product as ProductKey].title}</td>
                    <td className="py-4">{formatKes(payment.amount)}</td>
                    <td className="py-4">{new Date(payment.created_at).toLocaleString()}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td className="py-6 text-black/55 dark:text-white/55" colSpan={3}>
                    No failed payments recorded.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </AppShell>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-black/10 p-5 dark:border-white/10">
      <p className="text-sm font-bold text-black/50 dark:text-white/50">{label}</p>
      <p className="mt-3 text-3xl font-black">{value}</p>
    </div>
  );
}
