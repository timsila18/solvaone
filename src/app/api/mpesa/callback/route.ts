import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

type CallbackItem = { Name: string; Value?: string | number };

export async function POST(request: Request) {
  const payload = await request.json();
  const callback = payload?.Body?.stkCallback;
  const checkoutRequestId = callback?.CheckoutRequestID;

  if (!checkoutRequestId) {
    return NextResponse.json({ ok: true });
  }

  const metadata = callback?.CallbackMetadata?.Item as CallbackItem[] | undefined;
  const receipt = metadata?.find((item) => item.Name === "MpesaReceiptNumber")?.Value?.toString();
  const resultCode = Number(callback?.ResultCode);
  const status = resultCode === 0 ? "paid" : "failed";
  const supabase = createSupabaseAdminClient();

  const { data: payment } = await supabase
    .from("payments")
    .update({
      status,
      provider_reference: receipt,
      raw_callback: payload,
      paid_at: status === "paid" ? new Date().toISOString() : null,
      updated_at: new Date().toISOString()
    })
    .eq("checkout_request_id", checkoutRequestId)
    .select("id,user_id,project_id")
    .single();

  if (payment) {
    await supabase
      .from("projects")
      .update({ status: status === "paid" ? "paid" : "draft", updated_at: new Date().toISOString() })
      .eq("id", payment.project_id);
    await supabase.from("audit_logs").insert({
      user_id: payment.user_id,
      action: `payment.${status}`,
      entity_type: "payment",
      entity_id: payment.id,
      metadata: { checkoutRequestId, receipt }
    });
  }

  return NextResponse.json({ ok: true });
}
