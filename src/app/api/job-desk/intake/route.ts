import { createHash, randomBytes, randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { extractTextFromCvFile } from "@/lib/cv-extraction";
import { checkRateLimit, clientIpFromHeaders, logSystemEvent, rateLimitResponse } from "@/lib/security";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { startJobDeskPayment } from "@/lib/job-desk/checkout";
import { getJobDeskService } from "@/lib/job-desk/services";
import { normalizeSafaricomPhone } from "@/lib/payments";
import { createApplicationScope } from "@/lib/job-desk/application-scope";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const MAX_TOTAL_SIZE = 20 * 1024 * 1024;
const mimeByExtension: Record<string, string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  doc: "application/msword",
  txt: "text/plain"
};

const schema = z.object({
  serviceType: z.enum(["job_search_full", "interview_coaching", "linkedin_revamp"]),
  fullName: z.string().trim().min(2).max(160),
  whatsappPhone: z.string().trim().regex(/^\+?[0-9][0-9\s-]{7,20}$/),
  email: z.union([z.literal(""), z.string().trim().email().max(254)]),
  targetJobTitles: z.string().trim().max(1000),
  positionName: z.string().trim().max(160),
  organizationName: z.string().trim().max(160),
  linkedInUrl: z.string().trim().max(500),
  linkedInEmail: z.union([z.literal(""), z.string().trim().email().max(254)]),
  preferredIndustries: z.string().trim().max(1000),
  preferredLocations: z.string().trim().max(1000),
  excludedEmployers: z.string().trim().max(1000),
  excludedRoles: z.string().trim().max(1000),
  excludedKeywords: z.string().trim().max(1000),
  employmentTypes: z.string().trim().max(500),
  remotePreference: z.enum(["onsite", "hybrid", "remote", "flexible"]),
  experienceLevel: z.string().trim().max(120),
  salaryExpectation: z.string().trim().max(160),
  instructions: z.string().trim().max(8000),
  pastedCvText: z.string().trim().max(50000),
  consentToProcess: z.literal("true"),
  applicationAuthorization: z.string().optional(),
  website: z.string().max(200).default("")
}).superRefine((value, context) => {
  if (value.serviceType === "job_search_full" && value.targetJobTitles.length < 2) context.addIssue({ code: "custom", path: ["targetJobTitles"], message: "Target role is required." });
  if (value.serviceType === "job_search_full" && !value.email) context.addIssue({ code: "custom", path: ["email"], message: "An email address is required for application updates." });
  if (value.serviceType === "job_search_full" && value.applicationAuthorization !== "true") context.addIssue({ code: "custom", path: ["applicationAuthorization"], message: "Authorize applications within your selected job preferences." });
  if (value.serviceType === "interview_coaching" && (!value.positionName || !value.organizationName)) context.addIssue({ code: "custom", path: ["positionName"], message: "Position and organization are required." });
  if (value.serviceType === "linkedin_revamp" && (!/^https:\/\/(?:www\.)?linkedin\.com\/in\/[a-z0-9%_-]+\/?(?:\?.*)?$/i.test(value.linkedInUrl) || !value.linkedInEmail)) context.addIssue({ code: "custom", path: ["linkedInUrl"], message: "A LinkedIn profile link and contact email are required." });
  if (/\bpassword\s*[:=]/i.test(value.instructions)) context.addIssue({ code: "custom", path: ["instructions"], message: "Do not send account passwords." });
});

function list(value: string) {
  return value.split(/[,\n]/).map((item) => item.trim()).filter(Boolean).slice(0, 30);
}

function fileInfo(file: File) {
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  const contentType = mimeByExtension[extension];
  if (!contentType || (file.type && file.type !== contentType && file.type !== "application/octet-stream")) return null;
  const base = file.name.replace(/\.[^.]+$/, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 70);
  return { extension, contentType, safeName: `${base || "document"}.${extension}` };
}

function hasExpectedSignature(bytes: Uint8Array, extension: string) {
  if (extension === "pdf") return bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46;
  if (extension === "docx") return bytes[0] === 0x50 && bytes[1] === 0x4b;
  if (extension === "doc") return bytes[0] === 0xd0 && bytes[1] === 0xcf;
  return !bytes.includes(0);
}

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  if (origin && (!host || new URL(origin).host !== host)) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  const limited = checkRateLimit(`public-job-desk:${clientIpFromHeaders(request.headers)}`, 3, 60 * 60 * 1000);
  if (!limited.allowed) return rateLimitResponse(limited.resetAt);
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > MAX_TOTAL_SIZE + 150000) return NextResponse.json({ error: "Files exceed the 20MB total limit." }, { status: 413 });

  let formData: FormData;
  try { formData = await request.formData(); }
  catch { return NextResponse.json({ error: "Could not read the submission." }, { status: 400 }); }
  const parsed = schema.safeParse(Object.fromEntries([...formData.entries()].filter(([key]) => key !== "cvFile" && key !== "supportingFiles")));
  if (!parsed.success) return NextResponse.json({ error: "Check the required details and consent." }, { status: 400 });
  if (parsed.data.website) return NextResponse.json({ ok: true }, { status: 202 });
  if ([...formData.keys()].some((key) => /password/i.test(key))) return NextResponse.json({ error: "Do not submit account passwords." }, { status: 400 });
  let paymentPhone: string;
  try { paymentPhone = normalizeSafaricomPhone(parsed.data.whatsappPhone); }
  catch { return NextResponse.json({ error: "Enter a valid Safaricom number for the M-Pesa prompt." }, { status: 400 }); }

  const cv = formData.get("cvFile");
  const supportingFiles = formData.getAll("supportingFiles").filter((item): item is File => item instanceof File && item.size > 0);
  const hasCv = cv instanceof File && cv.size > 0;
  if (parsed.data.serviceType !== "interview_coaching" && !hasCv) return NextResponse.json({ error: "Upload your CV to continue." }, { status: 400 });
  const files = [...(hasCv ? [{ file: cv, kind: "cv" as const }] : []), ...supportingFiles.map((file) => ({ file, kind: "supporting" as const }))];
  if (supportingFiles.length > 2 || files.some(({ file }) => file.size > MAX_FILE_SIZE) || files.reduce((sum, { file }) => sum + file.size, 0) > MAX_TOTAL_SIZE) {
    return NextResponse.json({ error: "Upload one CV and up to two supporting files, each under 10MB and 20MB in total." }, { status: 400 });
  }
  const prepared = await Promise.all(files.map(async ({ file, kind }) => ({ file, kind, info: fileInfo(file), bytes: new Uint8Array(await file.arrayBuffer()) })));
  if (prepared.some(({ info, bytes }) => !info || !hasExpectedSignature(bytes, info.extension))) {
    return NextResponse.json({ error: "Use valid PDF, DOCX, DOC, or TXT files." }, { status: 400 });
  }

  const db = createSupabaseAdminClient();
  const orderId = randomUUID();
  const accessToken = randomBytes(32).toString("base64url");
  const service = getJobDeskService(parsed.data.serviceType)!;
  let clientId: string | null = null;
  const uploadedPaths: string[] = [];
  try {
    const { data: client, error: clientError } = await db.from("job_desk_clients").insert({
      full_name: parsed.data.fullName,
      whatsapp_phone: paymentPhone,
      email: parsed.data.email || null,
      source: "website",
      consent_to_process: true,
      consent_notes: "Client accepted Job Desk processing consent on website intake form."
    }).select("id").single();
    if (clientError || !client) throw new Error(clientError?.message ?? "Client creation failed.");
    clientId = client.id;

    const { error: profileError } = await db.from("job_desk_candidate_profiles").insert({
      client_id: clientId,
      target_job_titles: list(parsed.data.targetJobTitles || parsed.data.positionName),
      preferred_industries: list(parsed.data.preferredIndustries),
      preferred_locations: list(parsed.data.preferredLocations),
      employment_types: list(parsed.data.employmentTypes),
      remote_preference: parsed.data.remotePreference,
      experience_level: parsed.data.experienceLevel || null,
      salary_expectation: parsed.data.salaryExpectation || null,
      job_search_notes: parsed.data.instructions || null
    });
    if (profileError) throw new Error(profileError.message);

    const scope = parsed.data.serviceType === "job_search_full" ? createApplicationScope({
      targetRoles: parsed.data.targetJobTitles,
      preferredLocations: parsed.data.preferredLocations,
      remotePreference: parsed.data.remotePreference,
      excludedEmployers: parsed.data.excludedEmployers,
      excludedRoles: parsed.data.excludedRoles,
      excludedKeywords: parsed.data.excludedKeywords,
      channel: "website",
      evidence: "Client checked the scoped application authorization box on the website intake."
    }) : null;
    const { error: orderError } = await db.from("job_desk_orders").insert({
      id: orderId,
      client_id: clientId,
      service_type: parsed.data.serviceType,
      service_details: { positionName: parsed.data.positionName, organizationName: parsed.data.organizationName, linkedInUrl: parsed.data.linkedInUrl, linkedInEmail: parsed.data.linkedInEmail, ...(scope ? { applicationScope: scope } : {}) },
      public_access_token_hash: createHash("sha256").update(accessToken).digest("hex"),
      status: "awaiting_payment",
      payment_status: "unpaid",
      amount: service.price,
      source_channel: "website",
      instructions: parsed.data.instructions || null,
      application_authorized: Boolean(scope)
    });
    if (orderError) throw new Error(orderError.message);

    for (const { file, kind, info, bytes } of prepared) {
      if (!info) throw new Error("Invalid file.");
      const path = `${orderId}/${randomUUID()}-${info.safeName}`;
      const { error: uploadError } = await db.storage.from("job-desk-intake").upload(path, bytes, { contentType: info.contentType, upsert: false });
      if (uploadError) throw new Error(uploadError.message);
      uploadedPaths.push(path);
      const extraction = kind === "cv" ? await extractTextFromCvFile(file.name, info.contentType, Buffer.from(bytes)) : null;
      const pasted = kind === "cv" ? parsed.data.pastedCvText : "";
      const text = pasted.length >= 120 ? pasted : extraction?.text ?? "";
      const { error: fileError } = await db.from("job_desk_intake_files").insert({
        order_id: orderId,
        client_id: clientId,
        storage_path: path,
        file_name: file.name.slice(0, 180),
        file_size: file.size,
        content_type: info.contentType,
        document_kind: kind,
        extracted_text: text,
        extraction_status: kind === "cv" ? (text.length >= 120 ? "succeeded" : "needs_text") : "pending",
        extraction_warning: kind === "cv" ? extraction?.warning ?? null : null
      });
      if (fileError) throw new Error(fileError.message);
    }
    let paymentStatus = "initiating";
    let paymentError: string | null = null;
    try { paymentStatus = (await startJobDeskPayment(orderId)).status; }
    catch (cause) {
      const { data: attempt } = await db.from("job_desk_payment_attempts").select("status").eq("order_id", orderId).order("created_at", { ascending: false }).limit(1).maybeSingle();
      paymentStatus = attempt?.status ?? "failed";
      paymentError = cause instanceof Error ? cause.message : "M-Pesa prompt could not be sent.";
    }
    return NextResponse.json({ ok: true, accessToken, reference: orderId.slice(0, 8).toUpperCase(), paymentStatus, paymentError, price: service.price, needsReadableCv: prepared.find((item) => item.kind === "cv")?.info?.extension === "doc" && parsed.data.pastedCvText.length < 120 }, { status: 201 });
  } catch (error) {
    if (uploadedPaths.length) await db.storage.from("job-desk-intake").remove(uploadedPaths);
    if (clientId) await db.from("job_desk_clients").delete().eq("id", clientId);
    await logSystemEvent({ category: "job_desk.public_intake", level: "error", message: error instanceof Error ? error.message : "Unknown intake error" });
    return NextResponse.json({ error: "We could not receive your documents. Please try again or contact support." }, { status: 500 });
  }
}
