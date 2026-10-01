import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/dashboard/app-shell";
import { SourceForm } from "@/components/job-desk/source-form";
import { VacancyForm } from "@/components/job-desk/vacancy-form";
import { AutomationControls } from "@/components/job-desk/automation-controls";
import { VacancyReviewControls } from "@/components/job-desk/vacancy-review-controls";
import { recommendedSources } from "@/lib/job-desk/vacancy-feeds";
import { createSupabaseServerClient, getCurrentUser } from "@/lib/supabase/server";

const reviewLabels: Record<string, string> = {
  thin_description: "Details need checking",
  old_published_date: "Older publication date",
  payment_request_language: "Mentions an application payment",
  messaging_only_application: "Mentions messaging-only applications",
  duplicate_listing: "Possible duplicate",
  admin_rejected: "Rejected by admin"
};

function VacancyRow({ vacancy, status }: { vacancy: any; status: "needs_review" | "approved" | "rejected" }) {
  const reasons = (vacancy.review_reasons ?? []) as string[];
  const pending = status !== "approved";
  return <div className="flex flex-wrap items-start justify-between gap-3 py-4 text-sm">
    <div className="min-w-0 flex-1">
      <a href={vacancy.apply_url} target="_blank" rel="noopener noreferrer" className="font-bold text-brand-blue hover:underline">{vacancy.title}</a>
      <p className="mt-1 text-black/60 dark:text-white/60">{vacancy.company_name} · {vacancy.location || "Location not supplied"} · {vacancy.provider}</p>
      <p className="mt-1 text-xs text-black/50 dark:text-white/50">Last seen {new Date(vacancy.last_seen_at).toLocaleString()}</p>
      {pending ? <p className="mt-2 text-xs font-semibold">{reasons.length ? reasons.map((reason) => reviewLabels[reason] ?? reason).join(" · ") : "Awaiting first review"}</p> : null}
    </div>
    {pending ? <VacancyReviewControls vacancyId={vacancy.id} duplicate={Boolean(vacancy.duplicate_of)} rejected={status === "rejected"} /> : <span className="text-xs font-bold text-brand-blue">Approved</span>}
  </div>;
}

export default async function VacanciesPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const db = await createSupabaseServerClient();
  const { data: account } = await db.from("users").select("role").eq("id", user.id).single();
  if (!account || !["admin", "super_admin"].includes(account.role)) redirect("/dashboard");
  const [{ data: sources }, { data: pending }, { data: approved }, { data: rejected }, { count: openCount }, { count: reviewCount }] = await Promise.all([
    db.from("job_desk_sources").select("*").order("company_name"),
    db.from("job_desk_vacancies").select("id,title,company_name,location,provider,apply_url,last_seen_at,review_reasons,duplicate_of").eq("status", "open").eq("review_status", "needs_review").order("last_seen_at", { ascending: false }).limit(100),
    db.from("job_desk_vacancies").select("id,title,company_name,location,provider,apply_url,last_seen_at,review_reasons,duplicate_of").eq("status", "open").eq("review_status", "approved").is("duplicate_of", null).order("last_seen_at", { ascending: false }).limit(100),
    db.from("job_desk_vacancies").select("id,title,company_name,location,provider,apply_url,last_seen_at,review_reasons,duplicate_of").eq("status", "open").eq("review_status", "rejected").order("last_seen_at", { ascending: false }).limit(50),
    db.from("job_desk_vacancies").select("id", { count: "exact", head: true }).eq("status", "open"),
    db.from("job_desk_vacancies").select("id", { count: "exact", head: true }).eq("status", "open").eq("review_status", "needs_review")
  ]);
  const configured = new Set((sources ?? []).map((source) => `${source.provider}:${source.site_token.toLowerCase()}`));
  return <AppShell email={user.email} isAdmin>
    <div className="border-b border-black/10 pb-6 dark:border-white/10">
      <Link href="/dashboard/admin/job-desk" className="text-sm font-bold text-brand-blue">Job Desk</Link>
      <h1 className="mt-2 text-3xl font-black">Vacancies and sources</h1>
      <p className="mt-2 text-sm text-black/60 dark:text-white/60">{openCount ?? 0} open listings · {reviewCount ?? 0} need review. Only approved, recently checked listings enter client matches.</p>
    </div>
    <section className="py-7">
      <h2 className="text-lg font-bold">Source catalogue</h2>
      <div className="mt-3"><AutomationControls action="connect_catalogue" label="Connect missing catalogue sources" /></div>
      <p className="mt-1 text-sm text-black/55 dark:text-white/55">Official employer-hosted feeds are shared across all clients. Sources refresh daily; use Refresh for an immediate check.</p>
      <div className="mt-4 divide-y divide-black/10 dark:divide-white/10">
        {recommendedSources.map((source) => <div key={`${source.provider}:${source.site_token}`} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm"><span><b>{source.company_name}</b> · {source.provider}</span>{configured.has(`${source.provider}:${source.site_token.toLowerCase()}`) ? <span className="text-xs font-semibold text-brand-blue">Connected</span> : <AutomationControls action="add_source" label="Connect source" provider={source.provider} siteToken={source.site_token} companyName={source.company_name} />}</div>)}
      </div>
    </section>
    <section className="border-t border-black/10 py-7 dark:border-white/10">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-bold">Configured feeds</h2><AutomationControls action="refresh_all" label="Refresh all sources" /></div>
      <div className="divide-y divide-black/10 dark:divide-white/10">{sources?.map((source) => <div key={source.id} className="flex flex-wrap items-center justify-between gap-3 py-4 text-sm"><div><b>{source.company_name}</b> · {source.provider}/{source.site_token}<p className="text-xs text-black/50 dark:text-white/50">Last sync: {source.last_synced_at ? new Date(source.last_synced_at).toLocaleString() : "not yet"}{source.last_error ? ` · ${source.last_error}` : ""}</p></div><AutomationControls action="discover" id={source.id} label="Refresh" /></div>)}</div>
      <h3 className="mb-3 mt-7 text-sm font-bold">Add another official ATS board</h3>
      <SourceForm />
    </section>
    <section className="border-t border-black/10 py-7 dark:border-white/10"><h2 className="mb-4 text-lg font-bold">Needs review</h2><div className="divide-y divide-black/10 dark:divide-white/10">{pending?.length ? pending.map((vacancy) => <VacancyRow key={vacancy.id} vacancy={vacancy} status="needs_review" />) : <p className="text-sm text-black/50 dark:text-white/50">No listings waiting for review.</p>}</div></section>
    <section className="border-t border-black/10 py-7 dark:border-white/10"><h2 className="mb-4 text-lg font-bold">Approved listings</h2><div className="divide-y divide-black/10 dark:divide-white/10">{approved?.length ? approved.map((vacancy) => <VacancyRow key={vacancy.id} vacancy={vacancy} status="approved" />) : <p className="text-sm text-black/50 dark:text-white/50">Refresh the sources to populate this list.</p>}</div></section>
    <section className="border-t border-black/10 py-7 dark:border-white/10"><h2 className="mb-4 text-lg font-bold">Rejected listings</h2><div className="divide-y divide-black/10 dark:divide-white/10">{rejected?.length ? rejected.map((vacancy) => <VacancyRow key={vacancy.id} vacancy={vacancy} status="rejected" />) : <p className="text-sm text-black/50 dark:text-white/50">No rejected listings.</p>}</div></section>
    <section className="border-t border-black/10 py-7 dark:border-white/10"><h2 className="mb-4 text-lg font-bold">Add vacancy for review</h2><VacancyForm /></section>
  </AppShell>;
}
