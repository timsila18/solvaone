import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { hashToken } from "@/lib/job-desk/automation";
import { AuthorizationForm } from "@/components/job-desk/authorization-form";

export default async function AuthorizePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[A-Za-z0-9_-]{40,60}$/.test(token)) return <main className="mx-auto max-w-xl p-8">This authorization link is invalid.</main>;
  const db = createSupabaseAdminClient();
  const { data: match } = await db.from("job_desk_matches").select("id,status,cover_letter,authorization_expires_at,vacancy:job_desk_vacancies(title,company_name,location,application_method,apply_url),order:job_desk_orders(client:job_desk_clients(full_name))").eq("authorization_token_hash", hashToken(token)).maybeSingle();
  if (!match || match.status !== "ready" || !match.authorization_expires_at || new Date(match.authorization_expires_at) < new Date()) return <main className="mx-auto max-w-xl p-8">This authorization link has expired or was already used. Contact SolvaOne Job Desk.</main>;
  const vacancy = Array.isArray(match.vacancy) ? match.vacancy[0] : match.vacancy;
  const order = Array.isArray(match.order) ? match.order[0] : match.order;
  const client = Array.isArray(order?.client) ? order.client[0] : order?.client;
  return <main className="mx-auto max-w-2xl px-5 py-12"><h1 className="text-3xl font-black">Review your application</h1><p className="mt-3 text-black/60">{client?.full_name}, this is a request to authorize one specific job application.</p><section className="mt-8 border-y border-black/15 py-6"><h2 className="text-xl font-bold">{vacancy?.title}</h2><p className="mt-1">{vacancy?.company_name} · {vacancy?.location}</p><p className="mt-2 text-sm text-black/60">{vacancy?.application_method === "email" ? "Verified email application" : "External portal; a person will complete submission"}</p><a href={vacancy?.apply_url} target="_blank" rel="noopener noreferrer" className="mt-3 inline-block text-sm font-bold text-brand-blue">View original vacancy</a></section><h2 className="mt-7 text-lg font-bold">Prepared cover letter</h2><pre className="mt-3 whitespace-pre-wrap font-sans text-sm leading-6">{match.cover_letter}</pre><AuthorizationForm token={token} /></main>;
}
