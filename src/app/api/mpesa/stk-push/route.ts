import { NextResponse } from "next/server";
import { z } from "zod";
import { initiateStkPush } from "@/lib/mpesa";
import { createSupabaseServerClient, getCurrentUser } from "@/lib/supabase/server";
import { products } from "@/lib/types";

const schema = z.object({
  projectId: z.string().uuid().nullable().optional(),
  product: z.enum(["cv_builder", "cv_revamp", "cover_letter", "company_profile", "business_plan"]),
  phone: z.string().regex(/^254\d{9}$/)
});

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = schema.safeParse(await request.json());
  if (!parsed.success || !parsed.data.projectId) {
    return NextResponse.json({ error: "Save the project before payment and use phone format 2547XXXXXXXX." }, { status: 400 });
  }

  const product = products[parsed.data.product];
  const supabase = await createSupabaseServerClient();
  const { data: project } = await supabase
    .from("projects")
    .select("id,title")
    .eq("id", parsed.data.projectId)
    .eq("user_id", user.id)
    .single();

  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const mpesa = await initiateStkPush({
    phone: parsed.data.phone,
    amount: product.priceKes,
    accountReference: `S1-${project.id.slice(0, 8)}`,
    transactionDescription: product.title
  });

  const { error } = await supabase.from("payments").insert({
    user_id: user.id,
    project_id: project.id,
    product: parsed.data.product,
    amount: product.priceKes,
    currency: "KES",
    status: "pending",
    provider: "mpesa",
    checkout_request_id: mpesa.CheckoutRequestID,
    merchant_request_id: mpesa.MerchantRequestID,
    raw_request: mpesa
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await supabase.from("projects").update({ status: "awaiting_payment" }).eq("id", project.id);
  return NextResponse.json({ checkoutRequestId: mpesa.CheckoutRequestID });
}
