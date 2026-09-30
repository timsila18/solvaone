import { createHash } from "crypto";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function findPublicJobDeskOrder(token: string) {
  if (!/^[A-Za-z0-9_-]{40,80}$/.test(token)) return null;
  const hash = createHash("sha256").update(token).digest("hex");
  const db = createSupabaseAdminClient();
  const { data } = await db.from("job_desk_orders").select("id,status,payment_status,amount,service_type,source_channel,payment_reference").eq("public_access_token_hash", hash).eq("source_channel", "website").maybeSingle();
  return data ?? null;
}
