import { redirect } from "next/navigation";
import { AppShell } from "@/components/dashboard/app-shell";
import { createSupabaseServerClient, getCurrentUser } from "@/lib/supabase/server";
import { products, type ProductKey } from "@/lib/types";
import { formatKes } from "@/lib/utils";

export default async function AdminPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const supabase = await createSupabaseServerClient();
  const { data: profile } = await supabase.from("users").select("role").eq("id", user.id).single();
  if (profile?.role !== "admin") redirect("/dashboard");

  const [usersCount, paidPayments, failedPayments, documentsCount, activity] = await Promise.all([
    supabase.from("users").select("id", { count: "exact", head: true }),
    supabase.from("payments").select("product,amount,status").eq("status", "paid"),
    supabase.from("payments").select("id,amount,product,created_at", { count: "exact" }).eq("status", "failed").limit(10),
    supabase.from("documents").select("id", { count: "exact", head: true }),
    supabase.from("audit_logs").select("action,entity_type,created_at").order("created_at", { ascending: false }).limit(12)
  ]);

  const revenue = paidPayments.data?.reduce((sum, payment) => sum + Number(payment.amount), 0) ?? 0;
  const byProduct = (paidPayments.data ?? []).reduce(
    (acc, payment) => {
      acc[payment.product as ProductKey] = (acc[payment.product as ProductKey] ?? 0) + Number(payment.amount);
      return acc;
    },
    {} as Partial<Record<ProductKey, number>>
  );

  return (
    <AppShell email={user.email} isAdmin>
      <div className="mb-8">
        <h1 className="text-4xl font-black">Admin Dashboard</h1>
        <p className="mt-2 text-black/55 dark:text-white/55">Operational visibility for SolvaOne.</p>
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Metric label="Total Users" value={String(usersCount.count ?? 0)} />
        <Metric label="Total Revenue" value={formatKes(revenue)} />
        <Metric label="Documents Generated" value={String(documentsCount.count ?? 0)} />
        <Metric label="Failed Payments" value={String(failedPayments.count ?? 0)} />
      </div>
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
