import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient, getCurrentUser } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const paymentId = request.nextUrl.searchParams.get("paymentId");
  const projectId = request.nextUrl.searchParams.get("projectId");
  if (!paymentId && !projectId) return NextResponse.json({ error: "Missing payment identifier." }, { status: 400 });

  const supabase = await createSupabaseServerClient();
  let query = supabase
    .from("payments")
    .select("id,project_id,product_id,amount,currency,status,checkout_request_id,mpesa_receipt_number,receipt_number,result_description,created_at,updated_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1);

  query = paymentId ? query.eq("id", paymentId) : query.eq("project_id", projectId);
  const { data: payment, error } = await query.maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!payment) return NextResponse.json({ status: "pending" });

  return NextResponse.json({ payment });
}
