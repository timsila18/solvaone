import { createHash, randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { checkRateLimit, clientIpFromHeaders, rateLimitResponse } from "@/lib/security";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { normalizeSafaricomPhone } from "@/lib/payments";
import { INTAKE_BUCKET, MAX_INTAKE_FILE_SIZE, intakeMimeByExtension, signIntakeUpload } from "@/lib/job-desk/public-upload";

export const runtime = "nodejs";

const schema = z.object({
  checkoutToken: z.string().regex(/^[A-Za-z0-9_-]{40,80}$/),
  phone: z.string().min(8).max(24),
  name: z.string().min(1).max(180),
  size: z.number().int().min(1).max(MAX_INTAKE_FILE_SIZE),
  kind: z.enum(["cv", "supporting"]),
  index: z.number().int().min(0).max(2)
});

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  if (origin && (!host || new URL(origin).host !== host)) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  const parsed = schema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Check your document name and size." }, { status: 400 });
  const { checkoutToken, name, size, kind, index } = parsed.data;
  const extension = name.split(".").pop()?.toLowerCase() ?? "";
  const contentType = intakeMimeByExtension[extension];
  if (!contentType) return NextResponse.json({ error: "Use a PDF, Word or TXT document." }, { status: 400 });
  let phone: string;
  try { phone = normalizeSafaricomPhone(parsed.data.phone); }
  catch { return NextResponse.json({ error: "Enter a valid Safaricom number." }, { status: 400 }); }
  const limited = checkRateLimit(`job-desk-upload:${clientIpFromHeaders(request.headers)}`, 120, 60 * 60 * 1000);
  if (!limited.allowed) return rateLimitResponse(limited.resetAt);
  const phoneLimit = checkRateLimit(`job-desk-upload-phone:${createHash("sha256").update(phone).digest("hex")}`, 24, 60 * 60 * 1000);
  if (!phoneLimit.allowed) return rateLimitResponse(phoneLimit.resetAt);

  const path = `staging/${checkoutToken}/${randomUUID()}.${extension}`;
  const { data, error } = await createSupabaseAdminClient().storage.from(INTAKE_BUCKET).createSignedUploadUrl(path);
  if (error || !data?.token) return NextResponse.json({ error: "Document upload is temporarily unavailable. Please retry." }, { status: 503 });
  const ref = signIntakeUpload({ checkoutToken, path, name, size, kind, index, expiresAt: Date.now() + 2 * 60 * 60 * 1000 });
  return NextResponse.json({ path, token: data.token, ref, contentType });
}
