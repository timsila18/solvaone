import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/dashboard/app-shell";
import { JobDeskIntakeForm } from "@/components/job-desk/intake-form";
import { createSupabaseServerClient, getCurrentUser } from "@/lib/supabase/server";
import { formatKes } from "@/lib/utils";

export default async function JobDeskPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const db = await createSupabaseServerClient();
  const { data: profile } = await db.from("users").select("role").eq("id", user.id).single();
  if (profile?.role !== "admin" && profile?.role !== "super_admin") redirect("/dashboard");

  const [{ data: orders }, { count: websiteCount }, { count: activeCount }, { count: reviewCount }, { count: awaitingCount }] = await Promise.all([
    db.from("job_desk_orders").select("id,status,payment_status,amount,service_type,source_channel,created_at,client:job_desk_clients(full_name,whatsapp_phone)").order("created_at", { ascending: false }).limit(30),
    db.from("job_desk_orders").select("id", { count: "exact", head: true }).eq("source_channel", "website").eq("status", "intake"),
    db.from("job_desk_orders").select("id", { count: "exact", head: true }).in("status", ["active", "approved", "cv_processing"]),
    db.from("job_desk_orders").select("id", { count: "exact", head: true }).eq("status", "cv_review"),
    db.from("job_desk_orders").select("id", { count: "exact", head: true }).eq("status", "awaiting_information")
  ]);

  return (
    <AppShell email={user.email} isAdmin>
      <div className="flex flex-col justify-between gap-4 border-b border-black/10 pb-6 dark:border-white/10 md:flex-row md:items-end">
        <div><h1 className="text-3xl font-black">SolvaOne Job Desk</h1><p className="mt-2 max-w-2xl text-sm text-black/55 dark:text-white/55">Manual WhatsApp intake, payment recording, structured candidate profiles, and approval-ready CV processing.</p></div>
        <Link href="/dashboard/admin" className="text-sm font-bold text-brand-blue">Back to admin dashboard</Link>
      </div>

      <div className="flex flex-col justify-between gap-3 border-b border-black/10 py-5 dark:border-white/10 sm:flex-row sm:items-center">
        <div><h2 className="font-black">Client submission link</h2><p className="mt-1 break-all text-sm text-black/55 dark:text-white/55">https://solvaone.co.ke/job-desk</p></div>
        <Link href="/job-desk" target="_blank" className="inline-flex h-10 items-center justify-center rounded-lg bg-brand-blue px-4 text-sm font-bold text-white">View client form</Link>
      </div>

      <div className="grid border-b border-black/10 dark:border-white/10 sm:grid-cols-4">
        <Metric label="New website requests" value={websiteCount ?? 0} />
        <Metric label="Active orders" value={activeCount ?? 0} />
        <Metric label="CVs awaiting review" value={reviewCount ?? 0} />
        <Metric label="Awaiting client information" value={awaitingCount ?? 0} />
      </div>

      <div className="grid gap-8 py-8 2xl:grid-cols-[minmax(0,1.1fr)_minmax(560px,0.9fr)]">
        <section className="min-w-0"><h2 className="text-xl font-black">Order queue</h2><p className="mt-1 text-sm text-black/50 dark:text-white/50">Newest manual intakes appear first.</p>
          <div className="mt-5 overflow-x-auto border-y border-black/10 dark:border-white/10">
            <table className="w-full min-w-[720px] text-left text-sm"><thead className="bg-black/[0.03] text-xs uppercase text-black/45 dark:bg-white/[0.05] dark:text-white/45"><tr><th className="px-3 py-3">Client</th><th className="px-3 py-3">Service</th><th className="px-3 py-3">Payment</th><th className="px-3 py-3">Workflow</th><th className="px-3 py-3">Created</th></tr></thead>
              <tbody>{orders?.length ? orders.map((order) => {
                const client = Array.isArray(order.client) ? order.client[0] : order.client;
                return <tr key={order.id} className="border-t border-black/10 dark:border-white/10"><td className="px-3 py-4"><Link className="font-bold hover:text-brand-blue" href={`/dashboard/admin/job-desk/${order.id}`}>{client?.full_name ?? "Unnamed client"}</Link><div className="text-xs text-black/45 dark:text-white/45">{client?.whatsapp_phone} · {order.source_channel}</div></td><td className="px-3 py-4">{order.service_type.replaceAll("_", " ")}</td><td className="px-3 py-4"><span className="font-semibold">{order.payment_status}</span><div className="text-xs text-black/45 dark:text-white/45">{formatKes(order.amount)}</div></td><td className="px-3 py-4"><Status value={order.status} /></td><td className="px-3 py-4 text-black/50 dark:text-white/50">{new Date(order.created_at).toLocaleDateString()}</td></tr>;
              }) : <tr><td colSpan={5} className="px-3 py-10 text-center text-black/50 dark:text-white/50">No Job Desk orders yet.</td></tr>}</tbody>
            </table>
          </div>
        </section>

        <section className="min-w-0 border border-black/10 p-5 dark:border-white/10"><JobDeskIntakeForm /></section>
      </div>
    </AppShell>
  );
}

function Metric({ label, value }: { label: string; value: number }) { return <div className="border-black/10 px-4 py-5 first:pl-0 dark:border-white/10 sm:border-r"><div className="text-2xl font-black">{value}</div><div className="mt-1 text-xs font-bold uppercase text-black/45 dark:text-white/45">{label}</div></div>; }
function Status({ value }: { value: string }) { return <span className="inline-flex rounded-full border border-brand-blue/25 bg-brand-blue/5 px-2 py-1 text-xs font-bold text-brand-blue">{value.replaceAll("_", " ")}</span>; }
