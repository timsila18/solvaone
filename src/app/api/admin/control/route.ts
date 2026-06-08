import { NextResponse } from "next/server";
import { z } from "zod";
import { logAdminAction, requireAdmin, requireSuperAdmin } from "@/lib/security";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/supabase/server";

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("disable_user"), userId: z.string().uuid() }),
  z.object({ action: z.literal("enable_user"), userId: z.string().uuid() }),
  z.object({ action: z.literal("grant_credit"), userId: z.string().uuid(), creditType: z.string().min(2).max(80), value: z.number().positive() }),
  z.object({ action: z.literal("refund_status"), refundRequestId: z.string().uuid(), status: z.enum(["approved", "rejected", "escalated"]), adminNotes: z.string().max(2000).optional() }),
  z.object({ action: z.literal("coupon_upsert"), code: z.string().min(3).max(40), discountType: z.enum(["fixed", "percentage"]), value: z.number().positive(), productId: z.string().optional(), usageLimit: z.number().int().positive().optional() })
]);

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid admin action." }, { status: 400 });

  const admin = createSupabaseAdminClient();
  const auth = parsed.data.action === "coupon_upsert" || parsed.data.action === "disable_user" || parsed.data.action === "enable_user"
    ? await requireSuperAdmin(user)
    : await requireAdmin(user);
  if (!auth.allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  if (parsed.data.action === "disable_user" || parsed.data.action === "enable_user") {
    await admin.from("users").update({ status: parsed.data.action === "disable_user" ? "disabled" : "active" }).eq("id", parsed.data.userId);
    await logAdminAction({ adminId: user.id, action: parsed.data.action, targetType: "user", targetId: parsed.data.userId });
    return NextResponse.json({ ok: true });
  }

  if (parsed.data.action === "grant_credit") {
    const { data, error } = await admin
      .from("credits")
      .insert({ user_id: parsed.data.userId, credit_type: parsed.data.creditType, value: parsed.data.value, status: "active" })
      .select("id")
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    await logAdminAction({ adminId: user.id, action: "grant_credit", targetType: "credit", targetId: data.id, details: parsed.data });
    return NextResponse.json({ ok: true, creditId: data.id });
  }

  if (parsed.data.action === "refund_status") {
    const { error } = await admin
      .from("refund_requests")
      .update({ status: parsed.data.status, admin_notes: parsed.data.adminNotes ?? null })
      .eq("id", parsed.data.refundRequestId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    await logAdminAction({ adminId: user.id, action: "refund_status", targetType: "refund_request", targetId: parsed.data.refundRequestId, details: parsed.data });
    return NextResponse.json({ ok: true });
  }

  const { data, error } = await admin
    .from("coupons")
    .upsert({
      code: parsed.data.code.toUpperCase(),
      discount_type: parsed.data.discountType,
      value: parsed.data.value,
      product_id: parsed.data.productId ?? null,
      usage_limit: parsed.data.usageLimit ?? null,
      status: "active"
    }, { onConflict: "code" })
    .select("id")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await logAdminAction({ adminId: user.id, action: "coupon_upsert", targetType: "coupon", targetId: data.id, details: parsed.data });
  return NextResponse.json({ ok: true, couponId: data.id });
}
