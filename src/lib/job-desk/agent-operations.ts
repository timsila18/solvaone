import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { distinctSuccessfulDeliveries } from "./application-progress";
import { hasVerifiedJobDeskPayment } from "./payment";
import { agentReadiness } from "./agent-readiness";

export async function agentOperationsSnapshot() {
  const db = createSupabaseAdminClient();
  const [{ data: orders, error: orderError }, { count: failedTasks, error: failedError }, { count: queuedTasks, error: queuedError }] = await Promise.all([
    db.from("job_desk_orders").select("id,status,payment_status,amount,payment_reference,service_type").eq("service_type", "job_search_full").in("status", ["approved", "active"]).limit(500),
    db.from("job_desk_tasks").select("id", { count: "exact", head: true }).eq("status", "failed"),
    db.from("job_desk_tasks").select("id", { count: "exact", head: true }).eq("status", "queued")
  ]);
  if (orderError || failedError || queuedError) throw new Error(orderError?.message ?? failedError?.message ?? queuedError?.message ?? "Could not load agent operations.");
  const eligible = (orders ?? []).filter(hasVerifiedJobDeskPayment);
  const { data: applications, error: applicationError } = eligible.length
    ? await db.from("job_desk_applications").select("order_id,match_id,status,method,provider_message_id,provider_response").in("order_id", eligible.map(order => order.id)).eq("status", "submitted").limit(5000)
    : { data: [], error: null };
  if (applicationError) throw new Error(applicationError.message);
  const deliveredByOrder = new Map<string, number>();
  const recent = applications ?? [];
  for (const order of eligible) deliveredByOrder.set(order.id, distinctSuccessfulDeliveries(recent.filter(application => application.order_id === order.id)));
  const agent = await agentReadiness();
  return {
    checkedAt: new Date().toISOString(),
    agent,
    activeOrders: eligible.length,
    zeroSubmissionOrders: eligible.filter(order => !(deliveredByOrder.get(order.id) ?? 0)).length,
    underTargetOrders: eligible.filter(order => (deliveredByOrder.get(order.id) ?? 0) < 10).length,
    failedTasks: failedTasks ?? 0,
    queuedTasks: queuedTasks ?? 0,
    emailConfigured: Boolean(process.env.RESEND_API_KEY && (process.env.JOB_DESK_FROM_EMAIL ?? process.env.FROM_EMAIL)),
    dedicatedAgentConfigured: Boolean(process.env.APPLICATION_AGENT_URL && (process.env.APPLICATION_AGENT_TOKEN_NEXT || process.env.APPLICATION_AGENT_TOKEN))
  };
}

