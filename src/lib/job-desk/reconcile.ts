import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { enqueueTask } from "./automation";
import { queueClientUpdate } from "./client-updates";

export async function reconcileJobDeskPipeline() {
  const db = createSupabaseAdminClient();
  const { data: applications, error } = await db.from("job_desk_applications").select("match_id,order_id,status,provider_message_id,provider_response,updated_at").in("status", ["submitted", "sending"]).order("updated_at", { ascending: false }).limit(200);
  if (error) throw new Error(error.message);
  for (const application of applications ?? []) {
    if (application.status === "submitted") {
      const { error: matchError } = await db.from("job_desk_matches").update({ status: "submitted" }).eq("id", application.match_id).neq("status", "submitted");
      if (matchError) throw new Error(matchError.message);
      await queueClientUpdate(application.order_id, "application_submitted", application.match_id);
    } else if (Date.now() - Date.parse(application.updated_at) > 15 * 60000) {
      const { data: held, error: holdError } = await db.from("job_desk_applications").update({ status: "needs_human", error_message: "Send interrupted; verify provider or portal evidence before retrying. No automatic duplicate will be sent." }).eq("match_id", application.match_id).eq("status", "sending").eq("updated_at", application.updated_at).select("id").maybeSingle();
      if (holdError) throw new Error(holdError.message);
      if (held) {
        await db.from("job_desk_matches").update({ status: "needs_human" }).eq("id", application.match_id);
        await queueClientUpdate(application.order_id, "application_needs_action", application.match_id);
      }
    }
  }
  const { data: matches, error: matchError } = await db.from("job_desk_matches").select("id,order_id").eq("status", "authorized").not("authorized_at", "is", null).limit(200);
  if (matchError) throw new Error(matchError.message);
  for (const match of matches ?? []) await enqueueTask("submit", `submit:${match.id}`, match.order_id, { matchId: match.id });
}
