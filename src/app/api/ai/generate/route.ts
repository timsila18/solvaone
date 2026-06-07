import { NextResponse } from "next/server";
import { z } from "zod";
import { createOpenAIClient } from "@/lib/openai";
import { createSupabaseServerClient, getCurrentUser } from "@/lib/supabase/server";
import { products } from "@/lib/types";

const schema = z.object({
  projectId: z.string().uuid(),
  documentId: z.string().uuid(),
  product: z.enum(["cv_builder", "cv_revamp", "cover_letter", "company_profile", "business_plan"]),
  title: z.string().min(2).max(160),
  brief: z.string().min(40).max(20000)
});

function systemPrompt(product: keyof typeof products) {
  return [
    "You are SolvaOne, a premium enterprise document generation assistant for Solva Business Group.",
    "Return clean semantic HTML only. Do not include markdown fences, scripts, inline event handlers, or external links unless requested.",
    "Use concise, professional Kenyan business English.",
    `Document product: ${products[product].title}.`
  ].join("\n");
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

  const supabase = await createSupabaseServerClient();
  const { data: payment } = await supabase
    .from("payments")
    .select("id,status")
    .eq("project_id", parsed.data.projectId)
    .eq("user_id", user.id)
    .eq("status", "paid")
    .maybeSingle();

  if (!payment) {
    return NextResponse.json({ error: "A successful payment is required before generation." }, { status: 402 });
  }

  const client = createOpenAIClient();
  const response = await client.responses.create({
    model: process.env.OPENAI_MODEL ?? "gpt-4.1-mini",
    input: [
      { role: "system", content: systemPrompt(parsed.data.product) },
      {
        role: "user",
        content: `Title: ${parsed.data.title}\n\nSource brief:\n${parsed.data.brief}`
      }
    ]
  });

  const html = response.output_text;

  const { error } = await supabase
    .from("documents")
    .update({ html, version: 1, updated_at: new Date().toISOString() })
    .eq("id", parsed.data.documentId)
    .eq("user_id", user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await supabase.from("projects").update({ status: "ready", updated_at: new Date().toISOString() }).eq("id", parsed.data.projectId);
  await supabase.from("audit_logs").insert({
    user_id: user.id,
    action: "document.generate",
    entity_type: "document",
    entity_id: parsed.data.documentId,
    metadata: { model: process.env.OPENAI_MODEL ?? "gpt-4.1-mini", product: parsed.data.product }
  });

  return NextResponse.json({ html });
}
