import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { enqueueTask } from "./automation";
import { hasVerifiedJobDeskPayment } from "./payment";
import { readApplicationScope } from "./application-scope";
import { distinctSuccessfulDeliveries } from "./application-progress";

export async function queueApprovedVacancyMatches() {
  const db = createSupabaseAdminClient();
  const { count, error: poolError } = await db.from("job_desk_vacancies").select("id", { count: "exact", head: true })
    .eq("status", "open").eq("review_status", "approved").is("duplicate_of", null)
    .gte("last_seen_at", new Date(Date.now() - 72 * 3600000).toISOString());
  if (poolError) throw new Error(poolError.message);
  const summary = { approvedVacancies: count ?? 0, eligibleOrders: 0, queued: 0, held: 0, atTarget: 0 };
  if (!count) return summary;
  const { data: orders, error } = await db.from("job_desk_orders")
    .select("id,client_id,status,payment_status,amount,payment_reference,application_authorized,service_details")
    .eq("service_type", "job_search_full").in("status", ["approved", "active"])
    .order("created_at").limit(500);
  if (error) throw new Error(error.message);
  const activation = crypto.randomUUID();
  for (const order of orders ?? []) {
    if (!hasVerifiedJobDeskPayment(order) || !order.application_authorized || !readApplicationScope(order.service_details)) { summary.held++; continue; }
    const [{ data: client, error: clientError }, { data: cv, error: cvError }, { data: applications, error: applicationError }] = await Promise.all([
      db.from("job_desk_clients").select("consent_to_process").eq("id", order.client_id).maybeSingle(),
      db.from("job_desk_documents").select("id,status").eq("order_id", order.id).eq("document_type", "revamped_cv").order("version", { ascending: false }).limit(1).maybeSingle(),
      db.from("job_desk_applications").select("match_id,status,method,provider_message_id,provider_response").eq("order_id", order.id),
    ]);
    if (clientError || cvError || applicationError) throw new Error(clientError?.message ?? cvError?.message ?? applicationError?.message);
    if (!client?.consent_to_process || cv?.status !== "approved") { summary.held++; continue; }
    if (distinctSuccessfulDeliveries(applications ?? []) >= 10) { summary.atTarget++; continue; }
    summary.eligibleOrders++;
    // The existing matcher still checks suitability, scope and duplicate submissions.
    if (await enqueueTask("match", `approved-pool:${order.id}:${cv.id}:${activation}`, order.id)) summary.queued++;
  }
  return summary;
}
