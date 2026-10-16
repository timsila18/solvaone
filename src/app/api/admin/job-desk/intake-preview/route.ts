import { NextResponse } from "next/server";
import { z } from "zod";
import { extractTextFromCvFile } from "@/lib/cv-extraction";
import { readLocalCvFields } from "@/lib/job-desk/local-cv-reader";
import { checkRateLimit, clientIpFromHeaders, logAdminAction, rateLimitResponse, requireAdmin } from "@/lib/security";
import { getCurrentUser } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 60;

const previewSchema = z.object({
  fullName: z.string(), email: z.string(), whatsappPhone: z.string(),
  targetJobTitles: z.array(z.string()), preferredIndustries: z.array(z.string()),
  preferredLocations: z.array(z.string()), experienceLevel: z.string(),
  remotePreference: z.enum(["onsite", "hybrid", "remote", "flexible"]),
  currentCity: z.string(), currentCountry: z.string(), noticePeriod: z.string(),
  applicantLinkedinUrl: z.string(), portfolioUrl: z.string()
});

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user || !(await requireAdmin(user)).allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const limited = checkRateLimit(`job-desk-preview:${user.id}:${clientIpFromHeaders(request.headers)}`, 12, 10 * 60 * 1000);
  if (!limited.allowed) return rateLimitResponse(limited.resetAt);
  const form = await request.formData();
  const file = form.get("cvFile");
  if (!(file instanceof File) || !file.size || file.size > 10 * 1024 * 1024 || !/\.(pdf|doc|docx|txt)$/i.test(file.name)) return NextResponse.json({ error: "Upload a PDF, DOCX, DOC or TXT CV up to 10MB." }, { status: 400 });
  const types: Record<string, string> = { pdf: "application/pdf", doc: "application/msword", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", txt: "text/plain" };
  const extension = file.name.split(".").pop()!.toLowerCase();
  try {
    const pasted = String(form.get("pastedCvText") ?? "").trim();
    const text = pasted.length >= 120 ? pasted : (await extractTextFromCvFile(file.name, types[extension], await file.arrayBuffer())).text;
    if (text.length < 120) return NextResponse.json({ error: "This CV has too little selectable text. Paste its text in the field below the upload." }, { status: 422 });
    const fields = previewSchema.parse(readLocalCvFields(text));
    await logAdminAction({ adminId: user.id, action: "job_desk.cv_prefill", targetType: "job_desk_intake", targetId: user.id, details: { mode: "local", apiCalls: 0, estimatedCost: 0 } });
    return NextResponse.json({ fields, sourceText: text.slice(0, 50000), mode: "local", apiCalls: 0 });
  } catch (cause) {
    return NextResponse.json({ error: cause instanceof Error ? cause.message : "Could not read the CV." }, { status: 500 });
  }
}
