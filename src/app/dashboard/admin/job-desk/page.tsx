import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/dashboard/app-shell";
import { JobDeskIntakeForm } from "@/components/job-desk/intake-form";
import { AutomationControls } from "@/components/job-desk/automation-controls";
import { ShareIntakeLink } from "@/components/job-desk/share-intake-link";
import { EmailSenderTest } from "@/components/job-desk/email-sender-test";
import { createSupabaseServerClient, getCurrentUser } from "@/lib/supabase/server";
import { formatKes } from "@/lib/utils";
import { hasSubmissionEvidence } from "@/lib/job-desk/search-recovery";
import { hasVerifiedJobDeskPayment } from "@/lib/job-desk/payment";
import { applicationProgress, deliveryStage, type ProgressMatch } from "@/lib/job-desk/application-progress";
import { AgentOperationsPanel } from "@/components/job-desk/agent-operations-panel";
import { orderPagination, prioritizeOrders } from "@/lib/job-desk/order-pagination";

export default async function JobDeskPage({ searchParams }: { searchParams: Promise<{ page?: string | string[] }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const db = await createSupabaseServerClient();
  const { data: profile } = await db.from("users").select("role").eq("id", user.id).single();
  if (profile?.role !== "admin" && profile?.role !== "super_admin") redirect("/dashboard");

  const params = await searchParams;
  const { count: totalCount, error: countError } = await db.from("job_desk_orders").select("id", { count: "exact", head: true });
  if (countError) throw new Error("Order count could not be loaded. Please refresh.");
  const totalOrders = totalCount ?? 0;
  const pagination = orderPagination(params.page, totalOrders);

  // Rank the whole queue before slicing pages, including older unhandled orders.
  const allOrders = [];
  for (let from = 0; from < totalOrders; from += 500) {
    const { data, error } = await db.from("job_desk_orders").select("id,status,payment_status,amount,payment_reference,service_type,source_channel,created_at,client:job_desk_clients(full_name,whatsapp_phone)").order("created_at", { ascending: false }).order("id", { ascending: false }).range(from, from + 499);
    if (error) throw new Error("Orders could not be loaded. Please refresh.");
    allOrders.push(...(data ?? []));
  }
  const handled = new Set<string>();
  for (let from = 0; from < allOrders.length; from += 100) {
    const { data, error } = await db.from("job_desk_applications").select("order_id,status,method,provider_message_id,provider_response").in("order_id", allOrders.slice(from, from + 100).map(order => order.id)).eq("status", "submitted");
    if (error) throw new Error("Application outcomes could not be loaded. Please refresh.");
    for (const application of data ?? []) {
      if (hasSubmissionEvidence(application) || application.provider_message_id || application.provider_response?.clicked === true) handled.add(application.order_id);
    }
  }
  const orders = prioritizeOrders(allOrders, handled).slice(pagination.from, pagination.to + 1);

  const [{ count: websiteCount }, { count: activeCount }, { count: reviewCount }, { count: awaitingCount }, { count: queuedCount }, { count: failedCount }, { count: humanCount }] = await Promise.all([
    db.from("job_desk_orders").select("id", { count: "exact", head: true }).eq("source_channel", "website").eq("status", "intake"),
    db.from("job_desk_orders").select("id", { count: "exact", head: true }).in("status", ["active", "approved", "cv_processing"]),
    db.from("job_desk_orders").select("id", { count: "exact", head: true }).eq("status", "cv_review"),
    db.from("job_desk_orders").select("id", { count: "exact", head: true }).eq("status", "awaiting_information"),
    db.from("job_desk_tasks").select("id", { count: "exact", head: true }).eq("status", "queued"),
    db.from("job_desk_tasks").select("id", { count: "exact", head: true }).eq("status", "failed"),
    db.from("job_desk_matches").select("id", { count: "exact", head: true }).eq("status", "needs_human")
  ]);
  const activeOrders = (orders ?? []).filter(order => order.service_type === "job_search_full" && ["approved", "active"].includes(order.status) && hasVerifiedJobDeskPayment(order));
  const submissionCounts = new Map<string, number>();
  if (activeOrders.length) {
    const { data: applications, error } = await db.from("job_desk_applications").select("order_id,status,method,provider_message_id,provider_response").in("order_id", activeOrders.map(order => order.id));
    if (error) throw new Error("Application outcomes could not be loaded. Please refresh.");
    for (const application of applications ?? []) if (hasSubmissionEvidence(application)) submissionCounts.set(application.order_id, (submissionCounts.get(application.order_id) ?? 0) + 1);
  }
  const zeroOrders = activeOrders.filter(order => !submissionCounts.get(order.id));
  const progressByOrder = new Map<string, ReturnType<typeof applicationProgress>>();
  if (orders?.length) {
    const { data: matches, error: progressError } = await db.from("job_desk_matches").select("id,order_id,vacancy_id,reasons,status,cover_letter,application:job_desk_applications(status,method,provider_message_id,provider_response)").in("order_id", orders.map(order => order.id)).neq("status", "rejected").limit(1000);
    if (progressError) throw new Error("Client progress could not be loaded. Please refresh.");
    for (const order of orders) progressByOrder.set(order.id, applicationProgress((matches ?? []).filter(match => {
      if (match.order_id !== order.id) return false;
      const application = Array.isArray(match.application) ? match.application[0] : match.application;
      return ["confirmed", "delivered", "accepted", "submittedPendingConfirmation"].includes(deliveryStage(application))
        || (Array.isArray(match.reasons) && match.reasons.some(reason => typeof reason === "string" && reason.startsWith("Suitability review:")));
    }) as ProgressMatch[]));
  }
  const priorityOrders = orders;

  return (
    <AppShell email={user.email} isAdmin>
      <div className="flex flex-col justify-between gap-4 border-b border-black/10 pb-6 dark:border-white/10 md:flex-row md:items-end">
        <div><h1 className="text-3xl font-black">SolvaOne Job Hunting</h1><p className="mt-2 max-w-2xl text-sm text-black/55 dark:text-white/55">Manual WhatsApp intake, payment recording, structured candidate profiles, and approval-ready CV processing.</p><Link className="mt-3 inline-block text-sm font-bold text-brand-blue" href="/dashboard/admin/job-desk/employers">Employer vacancy verification</Link></div>
        <div className="flex flex-wrap items-center gap-4 text-sm font-bold text-brand-blue"><AutomationControls action="run_queue" label="Run agent queue" /><AutomationControls action="refresh_all" label="Refresh vacancy sources" /><Link href="/dashboard/admin/job-desk/review">Needs your attention</Link><Link href="/dashboard/admin/job-desk/vacancies">Vacancies and sources</Link><Link href="/dashboard/admin">Admin dashboard</Link></div>
      </div>

      <div className="flex flex-col justify-between gap-3 border-b border-black/10 py-5 dark:border-white/10 sm:flex-row sm:items-center">
        <div><h2 className="font-black">Client submission link</h2><p className="mt-1 break-all text-sm text-black/55 dark:text-white/55">https://solvaone.co.ke/job-desk</p></div>
        <div className="flex flex-wrap items-center gap-2"><ShareIntakeLink /><Link href="/job-desk" target="_blank" className="inline-flex h-10 items-center justify-center bg-brand-blue px-4 text-sm font-bold text-white">View client form</Link></div>
      </div>

      <EmailSenderTest />
      <AgentOperationsPanel />
      {zeroOrders.length > 0 && <section className="border-b border-black/10 py-5 dark:border-white/10" aria-label="Orders without submissions">
        <h2 className="font-black">No confirmed submissions yet · {zeroOrders.length}</h2>
        <p className="mt-1 text-sm text-black/55 dark:text-white/55">Paid, active orders on this page. Approved and authorized orders are recovery-checked every five minutes; clients without a confirmed delivery are prioritized. No eligible vacancy is not a completed application.</p>
        <ul className="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-sm font-bold text-brand-blue">{zeroOrders.map(order => { const client = Array.isArray(order.client) ? order.client[0] : order.client; return <li key={order.id}><Link href={`/dashboard/admin/job-desk/${order.id}`}>{client?.full_name ?? "Review order"}</Link></li>; })}</ul>
      </section>}
      <div className="grid border-b border-black/10 dark:border-white/10 sm:grid-cols-2 xl:grid-cols-7">
        <Metric label="New website requests" value={websiteCount ?? 0} />
        <Metric label="Active orders" value={activeCount ?? 0} />
        <Metric label="CVs awaiting review" value={reviewCount ?? 0} />
        <Metric label="Awaiting client information" value={awaitingCount ?? 0} />
        <Metric label="Queued tasks" value={queuedCount ?? 0} />
        <Metric label="Failed tasks" value={failedCount ?? 0} />
        <Metric label="Human review" value={humanCount ?? 0} />
      </div>

      <div className="grid items-start gap-6 py-8 xl:grid-cols-[minmax(0,1.2fr)_minmax(360px,0.8fr)]">
        <section className="min-w-0"><h2 className="text-xl font-black">All orders</h2><p className="mt-1 text-sm text-black/50 dark:text-white/50">{totalOrders} orders · Unhandled paid orders first. Unpaid orders are visible but do not enter the service queue.</p>
          <OrderPagination {...pagination} total={totalOrders} shown={orders?.length ?? 0} />
          <div role="region" aria-label="Order queue" tabIndex={0} className="mt-5 max-h-[70dvh] min-h-60 overflow-auto overscroll-contain [scrollbar-gutter:stable] border-y border-black/10 dark:border-white/10">
            <table className="w-full min-w-[720px] text-left text-sm"><thead className="sticky top-0 z-[1] bg-gray-100 text-xs uppercase text-black/45 dark:bg-neutral-900 dark:text-white/45"><tr><th className="px-3 py-3">Client</th><th className="px-3 py-3">Service</th><th className="px-3 py-3">Payment</th><th className="px-3 py-3">Workflow</th><th className="px-3 py-3">Created</th></tr></thead>
              <tbody>{orders?.length ? priorityOrders.map((order) => {
                const client = Array.isArray(order.client) ? order.client[0] : order.client;
                return <tr key={order.id} className="border-t border-black/10 dark:border-white/10"><td className="px-3 py-4"><Link className="font-bold hover:text-brand-blue" href={`/dashboard/admin/job-desk/${order.id}`}>{client?.full_name ?? "Unnamed client"}</Link><div className="text-xs text-black/45 dark:text-white/45">{client?.whatsapp_phone} · {order.source_channel}</div></td><td className="px-3 py-4">{order.service_type.replaceAll("_", " ")}</td><td className="px-3 py-4"><span className="font-semibold">{order.payment_status}</span><div className="text-xs text-black/45 dark:text-white/45">{formatKes(order.amount)}</div></td><td className="px-3 py-4"><Status value={order.status} />{order.service_type === "job_search_full" ? <OrderProgress value={progressByOrder.get(order.id)} /> : null}</td><td className="px-3 py-4 text-black/50 dark:text-white/50">{new Date(order.created_at).toLocaleDateString()}</td></tr>;
              }) : <tr><td colSpan={5} className="px-3 py-10 text-center text-black/50 dark:text-white/50">No Job Hunting orders yet.</td></tr>}</tbody>
            </table>
          </div>
          <OrderPagination {...pagination} total={totalOrders} shown={orders?.length ?? 0} />
        </section>

        <section aria-label="New order form" tabIndex={0} className="max-h-[75dvh] min-w-0 overflow-y-auto overscroll-contain [scrollbar-gutter:stable] border border-black/10 p-5 dark:border-white/10"><JobDeskIntakeForm /></section>
      </div>
    </AppShell>
  );
}
function OrderPagination({ page, pages, from, total, shown }: { page: number; pages: number; from: number; total: number; shown: number }) {
  const controlClass = "inline-flex h-10 w-10 items-center justify-center border border-black/15 text-brand-blue hover:bg-brand-blue/5 dark:border-white/15";
  return <nav aria-label="Order pagination" className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm">
    <span className="text-black/55 dark:text-white/55">{shown ? from + 1 : 0}-{from + shown} of {total} orders</span>
    <div className="flex items-center gap-3">
      {page > 1 ? <Link href={`?page=${page - 1}`} scroll={false} prefetch={false} aria-label="Previous page" title="Previous page" className={controlClass}><ChevronLeft size={18} /></Link> : <button disabled aria-label="Previous page" className={`${controlClass} opacity-30`}><ChevronLeft size={18} /></button>}
      <span aria-live="polite" className="font-semibold">Page {page} of {pages}</span>
      {page < pages ? <Link href={`?page=${page + 1}`} scroll={false} prefetch={false} aria-label="Next page" title="Next page" className={controlClass}><ChevronRight size={18} /></Link> : <button disabled aria-label="Next page" className={`${controlClass} opacity-30`}><ChevronRight size={18} /></button>}
    </div>
  </nav>;
}

function Metric({ label, value }: { label: string; value: number }) { return <div className="border-black/10 px-4 py-5 first:pl-0 dark:border-white/10 sm:border-r"><div className="text-2xl font-black">{value}</div><div className="mt-1 text-xs font-bold uppercase text-black/45 dark:text-white/45">{label}</div></div>; }
function Status({ value }: { value: string }) { return <span className="inline-flex rounded-full border border-brand-blue/25 bg-brand-blue/5 px-2 py-1 text-xs font-bold text-brand-blue">{value.replaceAll("_", " ")}</span>; }

function OrderProgress({ value }: { value?: ReturnType<typeof applicationProgress> }) {
  if (!value) return null;
  return <div className="mt-2 max-w-xs text-xs leading-5"><p>{value.suitable} suitable → {value.ready} ready → {value.delivered} delivered emails → {value.confirmed} confirmed portals → {value.blocked} blocked</p><p className="text-black/60 dark:text-white/60">{value.accepted} accepted, delivery unconfirmed</p>{!value.delivered && !value.confirmed ? <b className="text-brand-blue">First delivery priority</b> : null}</div>;
}
