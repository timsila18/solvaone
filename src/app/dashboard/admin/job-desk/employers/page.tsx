import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/dashboard/app-shell";
import { createSupabaseServerClient, getCurrentUser } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/security";
import { employerLeadSubject, readEmployerLead } from "@/lib/job-desk/employer-network";
import { verifyEmployerVacancy } from "./actions";

export default async function EmployerRequestsPage() {
  const user = await getCurrentUser();
  if (!user || !(await requireAdmin(user)).allowed) redirect("/dashboard");
  const db = await createSupabaseServerClient();
  const { data, error } = await db.from("contact_messages").select("id,message,created_at").eq("subject", employerLeadSubject).in("status", ["new", "open"]).order("created_at", { ascending: true }).limit(100);
  if (error) throw new Error("Employer requests could not be loaded.");
  return <AppShell email={user.email} isAdmin><Link className="text-brand-blue" href="/dashboard/admin/job-desk">Job Hunting</Link><h1 className="mt-4 text-3xl font-black">Employer vacancy verification</h1><p className="my-4">Share <Link className="text-brand-blue" href="/employers">solvaone.co.ke/employers</Link> with genuine employers. Independently verify each advert before importing it.</p>
    {!data?.length && <p className="py-8">No employer vacancies awaiting verification.</p>}
    {data?.map(lead => { const parsed = readEmployerLead(lead.message); if (!parsed.success) return <p key={lead.id}>Invalid employer request: {lead.id}</p>; const row = parsed.data; return <section key={lead.id} className="border-t border-black/20 py-6 dark:border-white/20"><h2 className="text-xl font-bold">{row.title} · {row.company}</h2><p className="my-2 break-words">{row.location} · Closing {row.closingDate}<br />{row.contactName} · {row.email} · {row.phone}<br />Recruitment: {row.applicationEmail}</p><a className="text-brand-blue" href={row.advertUrl} target="_blank" rel="noopener noreferrer">Official advert</a><p className="my-4 whitespace-pre-wrap">{row.requirements}</p><form action={verifyEmployerVacancy} className="grid gap-3"><input type="hidden" name="id" value={lead.id} />{[["employerVerified", "Employer identity independently verified"], ["openVerified", "Vacancy is currently open and genuine"], ["recipientVerified", "Recruitment email verified against official employer instructions"], ["permissionVerified", "Employer permits applications through this channel"], ["feesVerified", "No applicant recruitment fees"]].map(([name,label]) => <label key={name} className="flex gap-3 text-sm"><input type="checkbox" name={name} />{label}</label>)}<div className="flex gap-3"><button name="action" value="approve" className="rounded bg-brand-blue px-4 py-3 font-bold text-white">Import verified vacancy</button><button name="action" value="reject" className="rounded border border-black/20 px-4 py-3 dark:border-white/20">Reject</button></div></form></section>; })}
  </AppShell>;
}
