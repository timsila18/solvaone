import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { INTAKE_BUCKET } from "./public-upload";

export async function cleanupExpiredIntakeUploads() {
  const storage = createSupabaseAdminClient().storage.from(INTAKE_BUCKET);
  const cutoff = Date.now() - 4 * 60 * 60 * 1000;
  let cursor: string | undefined;
  let removed = 0;
  for (let page = 0; page < 5; page += 1) {
    const { data, error } = await storage.listV2({ prefix: "staging/", with_delimiter: false, limit: 100, cursor, sortBy: { column: "created_at", order: "asc" } });
    if (error) throw error;
    const expired = (data?.objects ?? []).filter((item) => item.key?.startsWith("staging/") && Date.parse(item.created_at) < cutoff).map((item) => item.key!);
    if (expired.length) {
      const result = await storage.remove(expired);
      if (result.error) throw result.error;
      removed += expired.length;
    }
    if (!data?.hasNext || !data.nextCursor || expired.length < (data.objects?.length ?? 0)) break;
    cursor = data.nextCursor;
  }
  return removed;
}
