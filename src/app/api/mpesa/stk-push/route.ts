import { NextResponse } from "next/server";
import { z } from "zod";
import { initiateDarajaStkPush } from "@/lib/payments";
import { productIdToGenerationProduct, type ProductId } from "@/lib/pricing";
import { createSupabaseServerClient, getCurrentUser } from "@/lib/supabase/server";

const schema = z.object({
  projectId: z.string().uuid(),
  productId: z.enum(["cv_builder", "cv_revamp", "cover_letter", "cv_cover_bundle", "company_profile", "business_plan"]),
  phone: z.string().min(9).max(20)
});

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid payment request." }, { status: 400 });

  const supabase = await createSupabaseServerClient();
  const { data: project } = await supabase
    .from("projects")
    .select("id,user_id,product")
    .eq("id", parsed.data.projectId)
    .eq("user_id", user.id)
    .single();

  if (!project) return NextResponse.json({ error: "Project not found." }, { status: 404 });

  const generationProduct = productIdToGenerationProduct(parsed.data.productId as ProductId);
  if (generationProduct !== project.product && parsed.data.productId !== "cv_cover_bundle") {
    return NextResponse.json({ error: "Payment product does not match this project." }, { status: 400 });
  }

  try {
    const payment = await initiateDarajaStkPush({
      userId: user.id,
      projectId: parsed.data.projectId,
      productId: parsed.data.productId as ProductId,
      phone: parsed.data.phone
    });
    return NextResponse.json({ paymentId: payment.id, checkoutRequestId: payment.checkout_request_id, status: "processing" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Payment initiation failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
