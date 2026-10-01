import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/supabase/server";
import { checkRateLimit, rateLimitResponse, requireAdmin } from "@/lib/security";
import { sendApplicationEmail } from "@/lib/job-desk/email-transport";

export async function POST(request: Request) {
  if (request.headers.get("origin") !== new URL(request.url).origin) return NextResponse.json({ error: "Invalid origin." }, { status: 403 });
  const user = await getCurrentUser();
  if (!user?.email || !(await requireAdmin(user)).allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const limit = checkRateLimit(`job-desk-sender-test:${user.id}`, 3, 10 * 60 * 1000);
  if (!limit.allowed) return rateLimitResponse(limit.resetAt);
  try {
    const result = await sendApplicationEmail({ to: [user.email], subject: "SolvaOne application sender test", text: "The Job Desk sender is able to send email. This is a configuration test, not a job application." }, `sender-test-${randomUUID()}`);
    return NextResponse.json({ message: "Resend accepted the test email. Check your inbox or spam folder; this does not prove employer delivery.", messageId: result.id });
  } catch (cause) {
    return NextResponse.json({ error: cause instanceof Error ? cause.message : "Sender test failed." }, { status: 502 });
  }
}
