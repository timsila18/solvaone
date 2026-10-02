import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { hasVerifiedJobDeskPayment } from "./payment";
import { hashAnswerToken, readAnswerRequest } from "./assisted-answers";

export async function loadAnswerRequest(token: string) {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  const db = createSupabaseAdminClient();
  const { data: batch, error } = await db.from("job_desk_authorization_batches").select("id,order_id,match_ids,expires_at,consumed_at").eq("token_hash", hashAnswerToken(token)).maybeSingle();
  if (error) throw new Error("Could not load the answer request.");
  if (!batch || batch.consumed_at || Date.parse(batch.expires_at) <= Date.now()) return null;
  const [{ data: order, error: orderError }, { data: cv, error: cvError }] = await Promise.all([
    db.from("job_desk_orders").select("id,service_type,status,service_details,updated_at,payment_status,amount,payment_reference,application_authorized,client:job_desk_clients(full_name,consent_to_process)").eq("id", batch.order_id).single(),
    db.from("job_desk_documents").select("id,status").eq("order_id", batch.order_id).eq("document_type", "revamped_cv").order("version", { ascending: false }).limit(1).maybeSingle()
  ]);
  if (orderError || cvError) throw new Error("Could not verify the answer request.");
  const snapshot = readAnswerRequest(order?.service_details);
  const client = Array.isArray(order?.client) ? order.client[0] : order?.client;
  if (!order || order.service_type !== "job_search_full" || !["approved", "active"].includes(order.status) || !hasVerifiedJobDeskPayment(order) || !order.application_authorized || !client?.consent_to_process || !snapshot || snapshot.batchId !== batch.id || snapshot.cvId !== cv?.id || cv.status !== "approved" || snapshot.savedAt || snapshot.questions.some(question => !batch.match_ids.includes(question.matchId))) return null;
  return { db, batch, order, snapshot, name: client.full_name };
}
