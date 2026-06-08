import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient, getCurrentUser } from "@/lib/supabase/server";

const schema = z.object({
  documentId: z.string().uuid(),
  html: z.string().min(1).max(200000),
  payload: z.record(z.unknown()).optional().default({}),
  changeType: z.enum(["manual_edit", "section_regeneration", "section_improvement"]).default("manual_edit")
});

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid version payload" }, { status: 400 });

  const supabase = await createSupabaseServerClient();
  const { data: document } = await supabase
    .from("documents")
    .select("id")
    .eq("id", parsed.data.documentId)
    .eq("user_id", user.id)
    .single();

  if (!document) return NextResponse.json({ error: "Document not found" }, { status: 404 });

  const { data: latest } = await supabase
    .from("document_versions")
    .select("version_number")
    .eq("document_id", parsed.data.documentId)
    .order("version_number", { ascending: false })
    .limit(1)
    .maybeSingle();

  const versionNumber = (latest?.version_number ?? 0) + 1;
  await supabase.from("documents").update({ html: parsed.data.html, updated_at: new Date().toISOString() }).eq("id", parsed.data.documentId);
  const { error } = await supabase.from("document_versions").insert({
    document_id: parsed.data.documentId,
    user_id: user.id,
    version_number: versionNumber,
    content: { html: parsed.data.html, payload: parsed.data.payload },
    change_type: parsed.data.changeType
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ versionNumber });
}
