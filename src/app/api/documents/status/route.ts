import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient, getCurrentUser } from "@/lib/supabase/server";

const querySchema = z.object({ documentId: z.string().uuid() });

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(request.url);
  const parsed = querySchema.safeParse({ documentId: url.searchParams.get("documentId") });
  if (!parsed.success) return NextResponse.json({ error: "Invalid document" }, { status: 400 });

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("documents")
    .select("id,html,structured_content,quality_scores,generation_status,updated_at")
    .eq("id", parsed.data.documentId)
    .eq("user_id", user.id)
    .single();

  if (error || !data) return NextResponse.json({ error: "Document not found" }, { status: 404 });

  return NextResponse.json({
    documentId: data.id,
    html: data.html ?? "",
    output: data.structured_content ?? null,
    qualityScores: data.quality_scores ?? {},
    status: data.generation_status ?? "draft",
    updatedAt: data.updated_at
  });
}
