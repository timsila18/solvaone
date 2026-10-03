import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { enqueueTask } from "./automation";
import { hasVerifiedJobDeskPayment } from "./payment";
import { readApplicationScope } from "./application-scope";
import { discoveryWindow } from "./worker-lifecycle";
import { successfulDelivery } from "./application-progress";

export const hasSubmissionEvidence = successfulDelivery;

export async function recoverUnderfilledSearches() {
  const db = createSupabaseAdminClient();
  const summary = { checked: 0, zeroSubmissions: 0, queued: 0, held: 0 };
  const { data: orders, error } = await db.from("job_desk_orders")
    .select("id,client_id,status,payment_status,amount,payment_reference,application_authorized,service_details")
    .eq("service_type", "job_search_full").in("status", ["approved", "active"])
    .order("created_at").limit(500);
  if (error) throw new Error(error.message);
  for (const order of orders ?? []) {
    summary.checked++;
    if (!hasVerifiedJobDeskPayment(order) || !order.application_authorized || !readApplicationScope(order.service_details)) { summary.held++; continue; }
    const { data: client, error: clientError } = await db.from("job_desk_clients").select("consent_to_process").eq("id", order.client_id).maybeSingle();
    if (clientError) throw new Error(clientError.message);
    const { data: cv, error: cvError } = await db.from("job_desk_documents").select("id,status").eq("order_id", order.id).eq("document_type", "revamped_cv").order("version", { ascending: false }).limit(1).maybeSingle();
    if (cvError) throw new Error(cvError.message);
    if (!client?.consent_to_process || cv?.status !== "approved") { summary.held++; continue; }
    const { data: applications, error: applicationError } = await db.from("job_desk_applications").select("status,method,provider_message_id,provider_response").eq("order_id", order.id);
    if (applicationError) throw new Error(applicationError.message);
    const submitted = (applications ?? []).filter(hasSubmissionEvidence).length;
    if (!submitted) summary.zeroSubmissions++;
    if (submitted >= 10) continue;
    const { data: pending, error: taskError } = await db.from("job_desk_tasks").select("id").eq("order_id", order.id).eq("task_type", "match").in("status", ["queued", "running"]).limit(1).maybeSingle();
    if (taskError) throw new Error(taskError.message);
    if (pending) continue;
    if (await enqueueTask("match", `search-recovery:${order.id}:${cv.id}:${discoveryWindow()}`, order.id)) summary.queued++;
  }
  return summary;
}
