import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient, getCurrentUser } from "@/lib/supabase/server";
import { generateWithSolvaIntelligence } from "@/lib/solva-intelligence/service";
import { generationModeSchema } from "@/lib/solva-intelligence/types";

const schema = z.object({
  projectId: z.string().uuid(),
  documentId: z.string().uuid(),
  product: z.enum(["cv_builder", "cv_revamp", "cover_letter", "company_profile", "business_plan"]),
  templateId: z.string().min(2).max(120).nullable().optional(),
  title: z.string().min(2).max(160),
  payload: z.record(z.unknown()).default({}),
  brief: z.string().max(20000).optional(),
  mode: generationModeSchema.optional(),
  sectionId: z.string().max(120).optional(),
  sectionHtml: z.string().max(30000).optional()
});

async function hasPaidGenerationAccess(projectId: string, userId: string) {
  if (process.env.SOLVA_REQUIRE_PAYMENT_FOR_GENERATION !== "true") {
    return true;
  }

  const supabase = await createSupabaseServerClient();
  const { data: payment } = await supabase
    .from("payments")
    .select("id,status")
    .eq("project_id", projectId)
    .eq("user_id", userId)
    .eq("status", "paid")
    .maybeSingle();

  return Boolean(payment);
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid generation payload" }, { status: 400 });
  }

  if (!(await hasPaidGenerationAccess(parsed.data.projectId, user.id))) {
    return NextResponse.json({ error: "A successful payment is required before generation." }, { status: 402 });
  }

  try {
    const payload = parsed.data.brief
      ? { ...parsed.data.payload, sourceBrief: parsed.data.brief }
      : parsed.data.payload;

    const result = await generateWithSolvaIntelligence({
      userId: user.id,
      projectId: parsed.data.projectId,
      documentId: parsed.data.documentId,
      product: parsed.data.product,
      templateId: parsed.data.templateId,
      title: parsed.data.title,
      payload,
      mode: parsed.data.mode,
      sectionId: parsed.data.sectionId,
      sectionHtml: parsed.data.sectionHtml
    });

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Generation failed.";
    const supabase = await createSupabaseServerClient();
    await supabase.from("audit_logs").insert({
      user_id: user.id,
      action: "document.generate.failed",
      entity_type: "project",
      entity_id: parsed.data.projectId,
      metadata: { error: message, product: parsed.data.product }
    });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
