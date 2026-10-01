import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { hashBatchToken } from "@/lib/job-desk/batch-authorization";
import { BatchAuthorizationForm } from "@/components/job-desk/batch-authorization-form";

export const dynamic = "force-dynamic";

export default async function BatchAuthorizationPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[A-Za-z0-9_-]{40,60}$/.test(token)) return <main className="mx-auto max-w-2xl p-8">This authorization link is invalid.</main>;
  const db = createSupabaseAdminClient();
  const { data: batch } = await db.from("job_desk_authorization_batches").select("order_id,match_ids,expires_at,consumed_at,order:job_desk_orders(client:job_desk_clients(full_name))").eq("token_hash", hashBatchToken(token)).maybeSingle();
  if (!batch || batch.consumed_at || new Date(batch.expires_at) < new Date()) return <main className="mx-auto max-w-2xl p-8">This approval link has expired or was already used. Contact SolvaOne Job Desk.</main>;
  const { data: matches } = await db.from("job_desk_matches").select("id,cover_letter,status,vacancy:job_desk_vacancies(title,company_name,location,apply_url,application_method)").eq("order_id", batch.order_id).in("id", batch.match_ids);
  const order = Array.isArray(batch.order) ? batch.order[0] : batch.order;
  const client = Array.isArray(order?.client) ? order.client[0] : order?.client;
  const options = (matches ?? []).filter((match) => match.status === "ready").map((match) => {
    const vacancy = Array.isArray(match.vacancy) ? match.vacancy[0] : match.vacancy;
    return { id: match.id, title: vacancy?.title ?? "Job application", company: vacancy?.company_name ?? "Employer", location: vacancy?.location ?? "", url: vacancy?.apply_url ?? "", method: vacancy?.application_method ?? "portal", letter: match.cover_letter ?? "" };
  });
  return <main className="min-h-screen bg-white px-5 py-12 text-black"><div className="mx-auto max-w-3xl"><h1 className="text-3xl font-black">Review your job applications</h1><p className="mt-3 text-sm leading-6">{client?.full_name}, review each vacancy and prepared letter below. Select only the applications you authorize. Portal applications may require you to complete a login, assessment or identity check.</p>{options.length ? <BatchAuthorizationForm token={token} options={options} /> : <p className="mt-8 border-t border-black/15 py-6">No applications are ready for approval. Contact SolvaOne Job Desk for an updated link.</p>}</div></main>;
}
