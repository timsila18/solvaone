import { NextResponse } from "next/server";
import { checkRateLimit, clientIpFromHeaders, rateLimitResponse } from "@/lib/security";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { reconcileJobDeskPayment } from "@/lib/job-desk/checkout";
import { findPublicJobDeskOrder } from "@/lib/job-desk/public-access";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  if (origin && (!host || new URL(origin).host !== host)) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  const limited = checkRateLimit(`job-desk-status:${clientIpFromHeaders(request.headers)}`, 120, 60 * 60 * 1000);
  if (!limited.allowed) return rateLimitResponse(limited.resetAt);
  const body = await request.json().catch(() => ({}));
  const token = typeof body.token === "string" ? body.token : "";
  const order = await findPublicJobDeskOrder(token);
  if (!order) return NextResponse.json({ error: "Request not found." }, { status: 404 });
  try { await reconcileJobDeskPayment(order.id); } catch { /* Callback or support can complete reconciliation. */ }
  const db = createSupabaseAdminClient();
  const [{ data: current }, { data: attempt }] = await Promise.all([
    db.from("job_desk_orders").select("payment_status,payment_reference,status").eq("id", order.id).single(),
    db.from("job_desk_payment_attempts").select("status,result_description").eq("order_id", order.id).order("created_at", { ascending: false }).limit(1).maybeSingle()
  ]);
  return NextResponse.json({ reference: order.id.slice(0, 8).toUpperCase(), paid: current?.payment_status === "paid", paymentStatus: current?.payment_status === "paid" ? "successful" : attempt?.status ?? "failed", message: attempt?.status === "needs_review" ? "Payment needs verification. Contact us with your M-Pesa receipt; do not pay again." : null });
}
