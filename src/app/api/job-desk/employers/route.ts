import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { checkRateLimit, clientIpFromHeaders, rateLimitResponse } from "@/lib/security";
import { employerVacancySchema, employerLeadSubject, employerDeadlineOpen } from "@/lib/job-desk/employer-network";

export async function POST(request: Request) {
  if (request.headers.get("origin") !== new URL(request.url).origin) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  const ip = createHash("sha256").update(clientIpFromHeaders(request.headers)).digest("hex");
  const limit = checkRateLimit(`employer-intake:${ip}`, 6, 3600000);
  if (!limit.allowed) return rateLimitResponse(limit.resetAt);
  const body = await request.text();
  if (body.length > 16000) return NextResponse.json({ error: "Vacancy details are too long." }, { status: 413 });
  let input: unknown;
  try { input = JSON.parse(body); } catch { return NextResponse.json({ error: "Invalid vacancy details." }, { status: 400 }); }
  const parsed = employerVacancySchema.safeParse(input);
  if (!parsed.success || !employerDeadlineOpen(parsed.data.closingDate)) return NextResponse.json({ error: "Complete all fields and use a valid future deadline within 90 days." }, { status: 400 });
  try {
    const row = parsed.data;
    const { error } = await createSupabaseAdminClient().from("contact_messages").insert({ name: row.contactName, email: row.email, phone: row.phone, subject: employerLeadSubject, message: JSON.stringify(row), status: "new" });
    if (error) throw error;
    return NextResponse.json({ message: "Vacancy received for verification. It is not published yet." });
  } catch { return NextResponse.json({ error: "We could not save this vacancy. Please retry." }, { status: 503 }); }
}
