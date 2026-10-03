import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/dashboard/app-shell";
import { createSupabaseServerClient, getCurrentUser } from "@/lib/supabase/server";
import { zeroDeliveryReview } from "@/lib/job-desk/delivery-review";

export default async function JobDeskReviewPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const db = await createSupabaseServerClient();
  const { data: account } = await db.from("users").select("role").eq("id", user.id).single();
  if (!account || !["admin", "super_admin"].includes(account.role)) redirect("/dashboard");

  const [ordersResult, tasksResult, matchesResult, vacanciesResult] = await Promise.all([
    db.from("job_desk_orders").select("id,status,created_at,client:job_desk_clients(full_name)", { count: "exact" }).in("status", ["cv_review", "awaiting_information", "failed"]).order("created_at", { ascending: false }).limit(50),
    db.from("job_desk_tasks").select("id,order_id,task_type,last_error,created_at", { count: "exact" }).eq("status", "failed").order("created_at", { ascending: false }).limit(50),
    db.from("job_desk_matches").select("id,order_id,score,vacancy:job_desk_vacancies(title,company_name),application:job_desk_applications(error_message)", { count: "exact" }).eq("status", "needs_human").order("created_at", { ascending: false }).limit(50),
    db.from("job_desk_vacancies").select("id", { count: "exact", head: true }).eq("status", "open").eq("review_status", "needs_review")
  ]);
  const error = ordersResult.error || tasksResult.error || matchesResult.error || vacanciesResult.error;
  if (error) throw new Error(`Could not load Job Desk review queue: ${error.message}`);
  const orders = ordersResult.data ?? [];
  const tasks = tasksResult.data ?? [];
  const matches = matchesResult.data ?? [];
  const vacancyCount = vacanciesResult.count ?? 0;
  const { data: activeOrders, error: activeError } = await db.from("job_desk_orders").select("id,status,created_at,payment_status,amount,payment_reference,application_authorized,service_details,client:job_desk_clients(full_name)").eq("service_type", "job_search_full").in("payment_status", ["paid", "waived"]).not("status", "in", "(completed,cancelled,paused,awaiting_payment)").order("created_at").limit(500);
  if (activeError) throw new Error("Could not load daily delivery review.");
  const applications: { order_id: string; status: string; method: string; provider_message_id: string | null; provider_response: unknown }[] = [];
  if (activeOrders?.length) {
    for (let start = 0; start < 10000; start += 1000) {
      const { data, error } = await db.from("job_desk_applications").select("id,order_id,status,method,provider_message_id,provider_response").in("order_id", activeOrders.map(order=>order.id)).order("id").range(start,start+999);
      if (error) throw new Error("Could not verify delivery evidence for the daily review.");
      applications.push(...(data ?? []));
      if ((data ?? []).length < 1000) break;
      if (start === 9000) throw new Error("Delivery review exceeds its safe reporting limit.");
    }
  }
  const zeroDeliveryOrders = (activeOrders ?? []).map(order => ({ order, review: zeroDeliveryReview(order, applications.filter(application=>application.order_id===order.id)) })).filter(item=>item.review);
  const nameByOrder = new Map(orders.map((order) => [order.id, order.client?.[0]?.full_name]));

  return <AppShell email={user.email} isAdmin><div className="mx-auto max-w-5xl py-6">
    <Link href="/dashboard/admin/job-desk" className="text-sm font-bold text-brand-blue">Job Hunting</Link>
    <h1 className="mt-2 text-3xl font-black">Needs your attention</h1>
    <p className="mt-2 text-sm text-black/60 dark:text-white/60">Work from top to bottom. Automated processing continues for the rest of the queue.</p>
    <div className="mt-7 space-y-8">
      <ReviewSection title="Daily review: no delivered applications" count={zeroDeliveryOrders.length} empty="No unpaid-delivery issues in the reviewed paid orders.">
        <p className="py-3 text-sm">Oldest first. Orders waiting 24 hours or more are flagged overdue. Email-provider acceptance is not confirmed delivery. Up to 500 active paid orders are reviewed.</p>
        {zeroDeliveryOrders.map(({order,review}) => { const client = Array.isArray(order.client) ? order.client[0] : order.client; return <ReviewRow key={order.id} title={`${client?.full_name ?? "Client"} · ${review!.ageHours} hours${review!.overdue ? " · Overdue" : ""}`} description={review!.nextAction} href={`/dashboard/admin/job-desk/${order.id}`} action="Resolve next step" />; })}
      </ReviewSection>
      <ReviewSection title="Failed processing" count={tasksResult.count ?? 0} empty="No failed tasks.">
        {tasks.map((task) => <ReviewRow key={task.id} title={`${task.task_type.replaceAll("_", " ")} failed`} description={task.last_error || "Check the order and retry after correcting the cause."} href={task.order_id ? `/dashboard/admin/job-desk/${task.order_id}` : "/dashboard/admin/job-desk/vacancies"} action="Review failure" />)}
      </ReviewSection>
      <ReviewSection title="CV and client information" count={ordersResult.count ?? 0} empty="No CVs or client details awaiting review.">
        {orders.map((order) => <ReviewRow key={order.id} title={nameByOrder.get(order.id) || "Client order"} description={order.status === "cv_review" ? "Review and approve the prepared CV." : order.status === "awaiting_information" ? "Record the client's missing answers." : "Processing failed; inspect the order."} href={`/dashboard/admin/job-desk/${order.id}`} action="Open order" />)}
      </ReviewSection>
      <ReviewSection title="Applications needing a person" count={matchesResult.count ?? 0} empty="No applications currently paused for you.">
        {matches.map((match) => { const vacancy = Array.isArray(match.vacancy) ? match.vacancy[0] : match.vacancy; const application = Array.isArray(match.application) ? match.application[0] : match.application; return <ReviewRow key={match.id} title={`${vacancy?.title ?? "Application"} · ${vacancy?.company_name ?? "Employer"}`} description={application?.error_message || "Open the application packet and complete the supported human step."} href={`/dashboard/admin/job-desk/${match.order_id}#applications`} action="Open application" />; })}
      </ReviewSection>
      <ReviewSection title="Vacancies needing review" count={vacancyCount} empty="No vacancies awaiting review.">
        {vacancyCount ? <ReviewRow title={`${vacancyCount} listings need verification`} description="Review source, eligibility, closing date and duplicate warnings before matching." href="/dashboard/admin/job-desk/vacancies" action="Review vacancies" /> : null}
      </ReviewSection>
    </div>
  </div></AppShell>;
}

function ReviewSection({ title, count, empty, children }: { title: string; count: number; empty: string; children: React.ReactNode }) {
  return <section><div className="flex items-baseline justify-between border-b border-black/15 pb-2 dark:border-white/15"><h2 className="text-lg font-black">{title}</h2><span className="text-sm font-bold text-brand-blue">{count}</span></div><div className="divide-y divide-black/10 dark:divide-white/10">{count ? children : <p className="py-4 text-sm text-black/55 dark:text-white/55">{empty}</p>}</div></section>;
}

function ReviewRow({ title, description, href, action }: { title: string; description: string; href: string; action: string }) {
  return <div className="flex flex-wrap items-start justify-between gap-3 py-4"><div className="min-w-0 flex-1"><h3 className="font-bold">{title}</h3><p className="mt-1 break-words text-sm text-black/60 dark:text-white/60">{description}</p></div><Link href={href} className="border border-brand-blue px-3 py-2 text-xs font-bold text-brand-blue">{action}</Link></div>;
}
