import { NextResponse } from "next/server";
import { reconcileEmailDeliveries } from "@/lib/job-desk/email-delivery";
import { getCurrentUser } from "@/lib/supabase/server";
import { checkRateLimit, rateLimitResponse, requireAdmin } from "@/lib/security";

export const runtime = "nodejs";
export const maxDuration = 120;

async function check() {
  try { return NextResponse.json(await reconcileEmailDeliveries({ force: true }), { headers: { "Cache-Control": "no-store" } }); }
  catch { return NextResponse.json({ error: "Delivery check failed. Check server logs and provider configuration." }, { status: 502 }); }
}

export async function GET(request: Request) {
  const authorization = request.headers.get("authorization");
  if (![process.env.CRON_SECRET, process.env.JOB_DESK_WORKER_SECRET].some(secret => secret && authorization === `Bearer ${secret}`)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return check();
}

export async function POST(request: Request) {
  if (request.headers.get("origin") !== new URL(request.url).origin) return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
  const user = await getCurrentUser();
  if (!user || !(await requireAdmin(user)).allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const limit = checkRateLimit(`job-desk-delivery-check:${user.id}`, 3, 10 * 60 * 1000);
  if (!limit.allowed) return rateLimitResponse(limit.resetAt);
  return check();
}
