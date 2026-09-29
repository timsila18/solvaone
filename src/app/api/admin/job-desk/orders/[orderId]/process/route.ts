import { NextResponse } from "next/server";
import { processJobDeskOrder } from "@/lib/job-desk/service";
import { checkRateLimit, clientIpFromHeaders, rateLimitResponse, requireAdmin } from "@/lib/security";
import { getCurrentUser } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: Request, { params }: { params: Promise<{ orderId: string }> }) {
  const limited = checkRateLimit(`job-desk-process:${clientIpFromHeaders(request.headers)}`, 8, 10 * 60 * 1000);
  if (!limited.allowed) return rateLimitResponse(limited.resetAt);
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const access = await requireAdmin(user);
  if (!access.allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { orderId } = await params;

  try {
    const result = await processJobDeskOrder({ orderId, adminId: user.id });
    return NextResponse.json({ ok: true, reused: result.reused, runId: result.runId });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "CV processing failed." }, { status: 500 });
  }
}

