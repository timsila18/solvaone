import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/dashboard/app-shell";
import { createSupabaseServerClient, getCurrentUser } from "@/lib/supabase/server";
import { underTargetDeliveryReview } from "@/lib/job-desk/delivery-review";
import { canRetrySubmission } from "@/lib/job-desk/submission-preflight";
import { submissionOriginCounts, distinctSuccessfulDeliveries } from "@/lib/job-desk/application-progress";
import { workerPilotOrders } from "@/lib/job-desk/worker-pilot";
import { jobDeskAiEnabled } from "@/lib/job-desk/ai-policy";
import { OrderSearch } from "@/components/job-desk/order-search";

export default async function JobDeskReviewPage({ searchParams }: { searchParams: Promise<{ humanPage?: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const db = await createSupabaseServerClient();
  const { data: account } = await db.from("users").select("role").eq("id", user.id).single();
  if (!account || !["admin", "super_admin"].includes(account.role)) redirect("/dashboard");

  const requestedPage = Number((await searchParams).humanPage ?? "1");
  const humanPage = Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const humanPageSize = 30;
  const [ordersResult, tasksResult, matchesResult, vacanciesResult, aiResult] = await Promise.all([
    db.from("job_desk_orders").select("id,status,created_at,client:job_desk_clients(full_name)", { count: "exact" }).in("status", ["cv_review", "awaiting_information", "failed"]).order("created_at", { ascending: false }).limit(50),
    db.from("job_desk_tasks").select("id,order_id,task_type,last_error,created_at", { count: "exact" }).eq("status", "failed").gte("created_at", new Date(Date.now() - 24 * 3600000).toISOString()).order("created_at", { ascending: false }).limit(50),
    db.from("job_desk_matches").select("id,order_id,score,vacancy:job_desk_vacancies(title,company_name,apply_url),application:job_desk_applications(status,error_message,provider_response)", { count: "exact" }).eq("status", "needs_human").order("created_at", { ascending: false }).range((humanPage - 1) * humanPageSize, humanPage * humanPageSize - 1),
    db.from("job_desk_vacancies").select("id", { count: "exact", head: true }).eq("status", "open").eq("review_status", "needs_review"),
    db.from("job_desk_ai_runs").select("error_message,completed_at").eq("operation", "match_relevance").eq("status", "failed").gte("completed_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()).order("completed_at", { ascending: false }).limit(1).maybeSingle()
  ]);
  const error = ordersResult.error || tasksResult.error || matchesResult.error || vacanciesResult.error || aiResult.error;
  if (error) throw new Error(`Could not load Job Desk review queue: ${error.message}`);
  const orders = ordersResult.data ?? [];
  const tasks = tasksResult.data ?? [];
  const matches = matchesResult.data ?? [];
  const vacancyCount = vacanciesResult.count ?? 0;
  const { data: activeOrders, error: activeError } = await db.from("job_desk_orders").select("id,status,created_at,payment_status,amount,payment_reference,application_authorized,service_details,client:job_desk_clients(full_name)").eq("service_type", "job_search_full").in("payment_status", ["paid", "waived"]).not("status", "in", "(completed,cancelled,paused,awaiting_payment)").order("created_at").limit(500);
  if (activeError) throw new Error("Could not load daily delivery review.");
  const applications: { order_id: string; match_id: string; status: string; method: string; provider_message_id: string | null; provider_response: unknown }[] = [];
  if (activeOrders?.length) {
    for (let start = 0; start < 10000; start += 1000) {
      const { data, error } = await db.from("job_desk_applications").select("id,match_id,order_id,status,method,provider_message_id,provider_response").in("order_id", activeOrders.map(order=>order.id)).order("id").range(start,start+999);
      if (error) throw new Error("Could not verify delivery evidence for the daily review.");
      applications.push(...(data ?? []));
      if ((data ?? []).length < 1000) break;
      if (start === 9000) throw new Error("Delivery review exceeds its safe reporting limit.");
    }
  }
  const zeroDeliveryOrders = (activeOrders ?? []).map(order => ({ order, review: underTargetDeliveryReview(order, applications.filter(application=>application.order_id===order.id)) })).filter(item=>item.review).sort((a, b) => Number(a.review!.delivered > 0) - Number(b.review!.delivered > 0) || b.review!.ageHours - a.review!.ageHours);
  const origins = submissionOriginCounts(applications);
  const pilotIds = workerPilotOrders(process.env.JOB_DESK_WORKER_PILOT_ORDER_IDS);
  const pilotOrders = (activeOrders ?? []).filter(order => pilotIds.includes(order.id));
  const nameByOrder = new Map(orders.map((order) => [order.id, order.client?.[0]?.full_name]));

  return <AppShell email={user.email} isAdmin><div className="mx-auto max-w-5xl py-6">
    <Link href="/dashboard/admin/job-desk" className="text-sm font-bold text-brand-blue">Job Hunting</Link>
    <h1 className="mt-2 text-3xl font-black">Needs your attention</h1>
    <p className="mt-2 text-sm text-black/60 dark:text-white/60">Work from top to bottom. Automated processing continues for the rest of the queue.</p>
    <OrderSearch />
    <div className="mt-7 space-y-8">
      <ReviewSection title="Low-cost worker pilot" count={pilotIds.length} empty="Pilot is not configured.">
        <p className="py-3 text-sm">Paid AI: {jobDeskAiEnabled() ? "Enabled" : "Disabled"}. Target: 10 submissions per order.</p>
        {pilotOrders.map(order => { const client = Array.isArray(order.client) ? order.client[0] : order.client; const submitted = distinctSuccessfulDeliveries(applications.filter(application => application.order_id === order.id)); return <ReviewRow key={order.id} title={`${client?.full_name ?? "Client"} · ${submitted}/10 submitted`} description={submitted >= 10 ? "Target reached." : "Reviewed applications only; unresolved employer steps remain in the admin queue."} href={`/dashboard/admin/job-desk/${order.id}`} action="Open pilot order" />; })}
      </ReviewSection>
      {jobDeskAiEnabled() && aiResult.data?.error_message && /\b429\b|insufficient_quota|no credits remaining/i.test(aiResult.data.error_message) ? <p role="alert" className="border-l-4 border-amber-600 bg-amber-50 p-3 text-sm text-black">A recent AI suitability review failed because the API reported no credits. Automatic matching cannot complete new reviews until the service quota is restored. Existing confirmed submissions remain recorded.</p> : null}
      <section><h2 className="border-b border-black/15 pb-2 text-lg font-black dark:border-white/15">Submission source</h2><p className="py-3 text-sm">Agent: {origins.agentEmail} accepted emails and {origins.agentPortal} confirmed portals. Admin-recorded: {origins.adminRecorded}. Historical source not established: {origins.unattributed}. Admin-recorded entries may include Codex-assisted work; the existing records do not identify that separately.</p></section>
      <ReviewSection title="Delivery target: orders below ten" count={zeroDeliveryOrders.length} empty="No under-target issues in the reviewed paid orders.">
        <p className="py-3 text-sm">Clients without a submission first, then oldest orders. Orders waiting 24 hours or more are flagged overdue. Provider-accepted emails count as submitted, but delivery is tracked separately. Up to 500 active paid orders are reviewed.</p>
        {zeroDeliveryOrders.map(({order,review}) => { const client = Array.isArray(order.client) ? order.client[0] : order.client; return <ReviewRow key={order.id} title={`${client?.full_name ?? "Client"} · ${review!.delivered}/10 submitted · ${review!.ageHours} hours${review!.overdue ? " · Overdue" : ""}`} description={review!.nextAction} href={`/dashboard/admin/job-desk/${order.id}`} action="Resolve next step" />; })}
      </ReviewSection>
      <ReviewSection title="Failed processing in the last 24 hours" count={tasksResult.count ?? 0} empty="No recent failed tasks.">
        <p className="py-3 text-sm">Historical task failures remain recorded; only current failures are shown here.</p>
        {tasks.map((task) => <ReviewRow key={task.id} title={`${task.task_type.replaceAll("_", " ")} failed`} description={task.last_error || "Check the order and retry after correcting the cause."} href={task.order_id ? `/dashboard/admin/job-desk/${task.order_id}` : "/dashboard/admin/job-desk/vacancies"} action="Review failure" />)}
      </ReviewSection>
      <ReviewSection title="CV and client information" count={ordersResult.count ?? 0} empty="No CVs or client details awaiting review.">
        {orders.map((order) => <ReviewRow key={order.id} title={nameByOrder.get(order.id) || "Client order"} description={order.status === "cv_review" ? "Review and approve the prepared CV." : order.status === "awaiting_information" ? "Record the client's missing answers." : "Processing failed; inspect the order."} href={`/dashboard/admin/job-desk/${order.id}`} action="Open order" />)}
      </ReviewSection>
      <ReviewSection title="Applications needing a person" count={matchesResult.count ?? 0} empty="No applications currently paused for you.">
        <p className="py-3 text-sm">Page {humanPage} of {Math.max(1, Math.ceil((matchesResult.count ?? 0) / humanPageSize))}. A queued replacement search does not erase the original human step.</p>
        {matches.map((match) => { const vacancy = Array.isArray(match.vacancy) ? match.vacancy[0] : match.vacancy; const application = Array.isArray(match.application) ? match.application[0] : match.application; const safeToResume = canRetrySubmission(application); return <ReviewRow key={match.id} title={`${vacancy?.title ?? "Application"} · ${vacancy?.company_name ?? "Employer"}`} description={`${safeToResume ? "Not submitted: complete the required step. " : "Outcome uncertain: check the employer receipt before any retry. "}${application?.error_message || "Open the saved application packet."}`} href={`/dashboard/admin/job-desk/${match.order_id}#applications`} action={safeToResume ? "Complete step" : "Check receipt"} externalHref={vacancy?.apply_url} handoffHref={vacancy?.apply_url && /^https:\/\/(?:jobs\.lever\.co|boards\.greenhouse\.io|job-boards(?:\.eu)?\.greenhouse\.io)\//i.test(vacancy.apply_url) ? `/dashboard/admin/job-desk/handoff/${match.id}` : undefined} />; })}
        {(matchesResult.count ?? 0) > humanPageSize ? <nav aria-label="Human action pages" className="flex items-center gap-4 py-4 text-sm font-semibold">{humanPage > 1 ? <Link href={`/dashboard/admin/job-desk/review?humanPage=${humanPage - 1}`} className="text-brand-blue">Previous</Link> : null}<span>{humanPage} / {Math.ceil((matchesResult.count ?? 0) / humanPageSize)}</span>{humanPage * humanPageSize < (matchesResult.count ?? 0) ? <Link href={`/dashboard/admin/job-desk/review?humanPage=${humanPage + 1}`} className="text-brand-blue">Next</Link> : null}</nav> : null}
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

function ReviewRow({ title, description, href, action, externalHref, handoffHref }: { title: string; description: string; href: string; action: string; externalHref?: string | null; handoffHref?: string }) {
  return <div className="flex flex-wrap items-start justify-between gap-3 py-4"><div className="min-w-0 flex-1"><h3 className="font-bold">{title}</h3><p className="mt-1 break-words text-sm text-black/60 dark:text-white/60">{description}</p>{externalHref ? <a href={externalHref} target="_blank" rel="noopener noreferrer" className="mt-1 inline-block text-xs font-semibold text-brand-blue">Employer form</a> : null}</div>{handoffHref ? <Link href={handoffHref} className="px-3 py-2 text-xs font-bold text-brand-blue">Retained browser</Link> : null}<Link href={href} className="border border-brand-blue px-3 py-2 text-xs font-bold text-brand-blue">{action}</Link></div>;
}
