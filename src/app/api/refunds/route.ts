import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient, getCurrentUser } from "@/lib/supabase/server";

const schema = z.object({
  paymentId: z.string().uuid(),
  reason: z.string().min(10).max(2000)
});

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid refund request." }, { status: 400 });

  const supabase = await createSupabaseServerClient();
  const { data: payment } = await supabase
    .from("payments")
    .select("id,user_id,status")
    .eq("id", parsed.data.paymentId)
    .eq("user_id", user.id)
    .single();
  if (!payment) return NextResponse.json({ error: "Payment not found." }, { status: 404 });

  const { data, error } = await supabase
    .from("refund_requests")
    .insert({
      user_id: user.id,
      payment_id: payment.id,
      reason: parsed.data.reason,
      status: "pending"
    })
    .select("id")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ refundRequestId: data.id });
}
