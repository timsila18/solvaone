import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/security";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/supabase/server";

export async function GET(_request: Request, { params }: { params: Promise<{ orderId: string; fileId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await requireAdmin(user)).allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { orderId, fileId } = await params;
  const db = createSupabaseAdminClient();
  const { data: file, error } = await db.from("job_desk_intake_files").select("storage_path,file_name,content_type").eq("order_id", orderId).eq("id", fileId).single();
  if (error || !file) return NextResponse.json({ error: "File not found" }, { status: 404 });
  const { data, error: downloadError } = await db.storage.from("job-desk-intake").download(file.storage_path);
  if (downloadError || !data) return NextResponse.json({ error: "File unavailable" }, { status: 404 });
  return new NextResponse(data.stream(), { headers: {
    "Content-Type": file.content_type,
    "Content-Disposition": `attachment; filename="${file.file_name.replace(/["\\\r\n]/g, "_")}"`,
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff"
  } });
}
