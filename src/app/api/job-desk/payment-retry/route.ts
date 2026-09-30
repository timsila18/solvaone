import { NextResponse } from "next/server";
import { checkRateLimit, clientIpFromHeaders, rateLimitResponse } from "@/lib/security";
import { findPublicJobDeskOrder } from "@/lib/job-desk/public-access";
import { startJobDeskPayment } from "@/lib/job-desk/checkout";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  if (origin && (!host || new URL(origin).host !== host)) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  const limited = checkRateLimit(`job-desk-retry:${clientIpFromHeaders(request.headers)}`, 5, 60 * 60 * 1000);
  if (!limited.allowed) return rateLimitResponse(limited.resetAt);
  const body = await request.json().catch(() => ({}));
  const order = await findPublicJobDeskOrder(typeof body.token === "string" ? body.token : "");
  if (!order) return NextResponse.json({ error: "Request not found." }, { status: 404 });
  try {
    const result = await startJobDeskPayment(order.id);
    return NextResponse.json(result);
  } catch (cause) {
    return NextResponse.json({ error: cause instanceof Error ? cause.message : "M-Pesa is temporarily unavailable." }, { status: 409 });
  }
}
