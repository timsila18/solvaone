import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient, getCurrentUser } from "@/lib/supabase/server";

const schema = z.object({
  projectId: z.string().uuid().nullable().optional(),
  documentId: z.string().uuid().nullable().optional(),
  product: z.enum(["cv_builder", "cv_revamp", "cover_letter", "company_profile", "business_plan"]),
  title: z.string().min(2).max(160),
  brief: z.string().max(20000).optional().default(""),
  html: z.string().max(200000).optional().default("")
});

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid document payload" }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  const input = parsed.data;
  let projectId = input.projectId ?? null;

  if (!projectId) {
    const { data, error } = await supabase
      .from("projects")
      .insert({
        user_id: user.id,
        product: input.product,
        title: input.title,
        status: "draft",
        source_brief: input.brief
      })
      .select("id")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    projectId = data.id;
  } else {
    const { error } = await supabase
      .from("projects")
      .update({ title: input.title, source_brief: input.brief, updated_at: new Date().toISOString() })
      .eq("id", projectId)
      .eq("user_id", user.id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  const documentPayload = {
    project_id: projectId,
    user_id: user.id,
    title: input.title,
    content: { brief: input.brief },
    html: input.html,
    format: "html",
    updated_at: new Date().toISOString()
  };

  const query = input.documentId
    ? supabase.from("documents").update(documentPayload).eq("id", input.documentId).eq("user_id", user.id).select("id").single()
    : supabase.from("documents").insert(documentPayload).select("id").single();

  const { data: document, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await supabase.from("audit_logs").insert({
    user_id: user.id,
    action: "document.autosave",
    entity_type: "document",
    entity_id: document.id,
    metadata: { projectId }
  });

  return NextResponse.json({ projectId, documentId: document.id });
}
