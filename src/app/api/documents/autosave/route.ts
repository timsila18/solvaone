import { NextResponse } from "next/server";
import { z } from "zod";
import { checkRateLimit, clientIpFromHeaders, rateLimitResponse } from "@/lib/security";
import { createSupabaseServerClient, getCurrentUser } from "@/lib/supabase/server";

const schema = z.object({
  projectId: z.string().uuid().nullable().optional(),
  documentId: z.string().uuid().nullable().optional(),
  product: z.enum(["cv_builder", "cv_revamp", "cover_letter", "company_profile", "business_plan"]),
  templateId: z.string().min(2).max(120).nullable().optional(),
  title: z.string().min(2).max(160),
  payload: z.record(z.unknown()).optional().default({}),
  brief: z.string().max(20000).optional().default(""),
  html: z.string().max(200000).optional().default("")
});

export async function POST(request: Request) {
  const limited = checkRateLimit(`autosave:${clientIpFromHeaders(request.headers)}`, 60, 60 * 1000);
  if (!limited.allowed) return rateLimitResponse(limited.resetAt);

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
        template_id: input.templateId,
        title: input.title,
        status: "draft",
        source_brief: input.brief || JSON.stringify(input.payload)
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
      .update({ title: input.title, template_id: input.templateId, source_brief: input.brief || JSON.stringify(input.payload), updated_at: new Date().toISOString() })
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
    template_id: input.templateId,
    content: { brief: input.brief, payload: input.payload },
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

  if (input.html.trim()) {
    const { data: latest } = await supabase
      .from("document_versions")
      .select("version_number")
      .eq("document_id", document.id)
      .order("version_number", { ascending: false })
      .limit(1)
      .maybeSingle();

    await supabase.from("document_versions").insert({
      document_id: document.id,
      user_id: user.id,
      version_number: (latest?.version_number ?? 0) + 1,
      content: { html: input.html, payload: input.payload },
      change_type: "autosave"
    });
  }

  return NextResponse.json({ projectId, documentId: document.id });
}
