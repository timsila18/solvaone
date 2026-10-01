import { createSupabaseAdminClient } from "@/lib/supabase/admin";

// A match has one application row. Only its pending row may acquire the send lock.
export async function claimApplication(matchId: string, orderId: string, method: string, recipient: string) {
  const db = createSupabaseAdminClient();
  const { error: insertError } = await db.from("job_desk_applications").upsert({ match_id: matchId, order_id: orderId, method, recipient, status: "pending" }, { onConflict: "match_id", ignoreDuplicates: true });
  if (insertError) throw new Error(insertError.message);
  const { data: current, error: readError } = await db.from("job_desk_applications").select("id,status,provider_response,provider_message_id").eq("match_id", matchId).single();
  if (readError) throw new Error(readError.message);
  if (current.provider_message_id || ["sending", "submitted"].includes(current.status)) return false;
  if (current.status === "needs_human" && (current.provider_response as { clicked?: boolean })?.clicked === false) {
    const { error } = await db.from("job_desk_applications").update({ status: "pending" }).eq("id", current.id).eq("status", "needs_human").eq("provider_response", JSON.stringify(current.provider_response));
    if (error) throw new Error(error.message);
  }
  const { data: claimed, error } = await db.from("job_desk_applications").update({ status: "sending", recipient, error_message: null, provider_response: { clicked: null, started_at: new Date().toISOString() } }).eq("id", current.id).eq("status", "pending").is("provider_message_id", null).select("id").maybeSingle();
  if (error) throw new Error(error.message);
  return Boolean(claimed);
}
