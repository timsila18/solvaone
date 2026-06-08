import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient, getCurrentUser } from "@/lib/supabase/server";

const schema = z.object({
  paymentId: z.string().uuid(),
  receiptNumber: z.string().min(4).optional()
});

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid verification payload." }, { status: 400 });

  const supabase = await createSupabaseServerClient();
  const { data: profile } = await supabase.from("users").select("role").eq("id", user.id).single();
  if (profile?.role !== "admin" && profile?.role !== "super_admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { data: payment, error } = await supabase
    .from("payments")
    .update({
      status: "successful",
      result_description: "Manually verified by admin",
      receipt_number: parsed.data.receiptNumber,
      verified_by: user.id,
      verified_at: new Date().toISOString(),
      paid_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })
    .eq("id", parsed.data.paymentId)
    .select("id,project_id")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await supabase.from("projects").update({ status: "paid", updated_at: new Date().toISOString() }).eq("id", payment.project_id);
  await supabase.from("payment_events").insert({
    payment_id: payment.id,
    event_type: "manual_admin_verification",
    raw_payload: { adminUserId: user.id }
  });

  return NextResponse.json({ ok: true });
}
