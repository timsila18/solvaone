import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { extractTextFromCvFile } from "@/lib/cv-extraction";
import { checkRateLimit, clientIpFromHeaders, logAdminAction, rateLimitResponse, requireAdmin } from "@/lib/security";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/supabase/server";
import { enqueueTask } from "@/lib/job-desk/automation";
import { createApplicationScope } from "@/lib/job-desk/application-scope";

export const runtime = "nodejs";
export const maxDuration = 60;

const allowedTypes = new Map([
  ["text/plain", "txt"],
  ["application/pdf", "pdf"],
  ["application/msword", "doc"],
  ["application/vnd.openxmlformats-officedocument.wordprocessingml.document", "docx"]
]);

const intakeSchema = z.object({
  fullName: z.string().trim().min(2).max(160),
  whatsappPhone: z.string().trim().regex(/^\+?[0-9][0-9\s-]{7,20}$/),
  email: z.string().trim().email().or(z.literal("")),
  source: z.enum(["whatsapp", "tiktok", "website", "referral", "other"]),
  serviceType: z.enum(["cv_revamp", "cv_build", "job_search_full"]),
  targetJobTitles: z.string().max(1000),
  preferredIndustries: z.string().max(1000),
  preferredLocations: z.string().max(1000),
  excludedEmployers: z.string().max(1000),
  excludedRoles: z.string().max(1000),
  excludedKeywords: z.string().max(1000),
  employmentTypes: z.string().max(500),
  remotePreference: z.enum(["onsite", "hybrid", "remote", "flexible"]),
  experienceLevel: z.string().max(120),
  salaryExpectation: z.string().max(160),
  instructions: z.string().max(8000),
  pastedCvText: z.string().max(50000),
  paymentStatus: z.enum(["unpaid", "partially_paid", "paid", "waived"]),
  paymentMethod: z.enum(["mpesa", "cash", "bank", "manual", "other"]),
  amount: z.coerce.number().min(0).max(1000000),
  paymentReference: z.string().max(160),
  consentToProcess: z.literal("true"),
  applicationAuthorization: z.string().optional(),
  authorizationEvidence: z.string().trim().max(1000)
}).superRefine((input, context) => {
  if (input.serviceType === "job_search_full" && !input.email) context.addIssue({ code: "custom", path: ["email"], message: "Add the client's email for application updates." });
  if (input.serviceType === "job_search_full" && !input.targetJobTitles.trim()) context.addIssue({ code: "custom", path: ["targetJobTitles"], message: "Record authorized target roles." });
  if (input.serviceType === "job_search_full" && (input.applicationAuthorization !== "true" || input.authorizationEvidence.length < 8)) context.addIssue({ code: "custom", path: ["applicationAuthorization"], message: "Record the client's explicit application authorization and where it was given." });
  if (["paid", "partially_paid"].includes(input.paymentStatus)) {
    if (input.amount <= 0) context.addIssue({ code: "custom", path: ["amount"], message: "Enter the verified amount paid." });
    if (input.paymentReference.trim().length < 3) context.addIssue({ code: "custom", path: ["paymentReference"], message: "Enter the verified payment reference." });
  }
});

function list(value: string) {
  return value.split(/[,\n]/).map((item) => item.trim()).filter(Boolean).slice(0, 30);
}

function extensionFromName(name: string) {
  return name.split(".").pop()?.toLowerCase() ?? "";
}

function safeName(name: string) {
  const extension = extensionFromName(name);
  const base = name.replace(/\.[^.]+$/, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);
  return `${base || "client-cv"}.${extension || "txt"}`;
}

export async function POST(request: Request) {
  const limited = checkRateLimit(`job-desk-intake:${clientIpFromHeaders(request.headers)}`, 12, 10 * 60 * 1000);
  if (!limited.allowed) return rateLimitResponse(limited.resetAt);

  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const access = await requireAdmin(user);
  if (!access.allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const formData = await request.formData();
  const parsed = intakeSchema.safeParse(Object.fromEntries([...formData.entries()].filter(([key]) => key !== "cvFile")));
  if (!parsed.success) {
    return NextResponse.json({ error: "Check the client, payment, consent, and job preference fields.", fields: parsed.error.flatten().fieldErrors }, { status: 400 });
  }

  const file = formData.get("cvFile");
  if (!(file instanceof File) || file.size === 0) return NextResponse.json({ error: "Upload the client's CV." }, { status: 400 });
  if (file.size > 10 * 1024 * 1024) return NextResponse.json({ error: "The Job Desk CV upload limit is 10MB." }, { status: 400 });

  const extension = extensionFromName(file.name);
  const inferredType = file.type || [...allowedTypes.entries()].find(([, ext]) => ext === extension)?.[0] || "";
  if (!allowedTypes.has(inferredType) || !["txt", "pdf", "doc", "docx"].includes(extension)) {
    return NextResponse.json({ error: "Upload a TXT, PDF, DOC, or DOCX CV." }, { status: 400 });
  }

  const db = createSupabaseAdminClient();
  const orderId = randomUUID();
  let clientId: string | null = null;
  let storagePath: string | null = null;

  try {
    const { data: client, error: clientError } = await db
      .from("job_desk_clients")
      .insert({
        created_by: user.id,
        full_name: parsed.data.fullName,
        whatsapp_phone: parsed.data.whatsappPhone.replace(/[\s-]/g, ""),
        email: parsed.data.email || null,
        source: parsed.data.source,
        consent_to_process: true,
        consent_notes: "Consent recorded by admin during manual WhatsApp/TikTok intake."
      })
      .select("id")
      .single();
    if (clientError || !client) throw new Error(clientError?.message ?? "Unable to create the client.");
    clientId = client.id;

    const { error: profileError } = await db.from("job_desk_candidate_profiles").insert({
      client_id: client.id,
      target_job_titles: list(parsed.data.targetJobTitles),
      preferred_industries: list(parsed.data.preferredIndustries),
      preferred_locations: list(parsed.data.preferredLocations),
      employment_types: list(parsed.data.employmentTypes),
      remote_preference: parsed.data.remotePreference,
      experience_level: parsed.data.experienceLevel || null,
      salary_expectation: parsed.data.salaryExpectation || null,
      job_search_notes: parsed.data.instructions || null
    });
    if (profileError) throw new Error(profileError.message);

    const isPaid = parsed.data.paymentStatus === "paid" || parsed.data.paymentStatus === "waived";
    const scope = parsed.data.serviceType === "job_search_full" ? createApplicationScope({
      targetRoles: parsed.data.targetJobTitles,
      preferredLocations: parsed.data.preferredLocations,
      remotePreference: parsed.data.remotePreference,
      excludedEmployers: parsed.data.excludedEmployers,
      excludedRoles: parsed.data.excludedRoles,
      excludedKeywords: parsed.data.excludedKeywords,
      channel: "admin_recorded",
      evidence: parsed.data.authorizationEvidence
    }) : null;
    const { error: orderError } = await db.from("job_desk_orders").insert({
      id: orderId,
      client_id: client.id,
      created_by: user.id,
      assigned_to: user.id,
      service_type: parsed.data.serviceType,
      payment_status: parsed.data.paymentStatus,
      payment_method: parsed.data.paymentMethod,
      amount: parsed.data.amount,
      payment_reference: parsed.data.paymentReference || null,
      paid_at: isPaid ? new Date().toISOString() : null,
      source_channel: parsed.data.source,
      instructions: parsed.data.instructions || null,
      application_authorized: Boolean(scope),
      service_details: scope ? { applicationScope: scope } : {}
    });
    if (orderError) throw new Error(orderError.message);

    const bytes = await file.arrayBuffer();
    storagePath = `${orderId}/${Date.now()}-${safeName(file.name)}`;
    const { error: uploadError } = await db.storage.from("job-desk-intake").upload(storagePath, bytes, { contentType: inferredType, upsert: false });
    if (uploadError) throw new Error(uploadError.message);

    const extraction = await extractTextFromCvFile(file.name, inferredType, bytes);
    const pastedText = parsed.data.pastedCvText.trim();
    const extractedText = pastedText.length >= 120 ? pastedText : extraction.text;
    const extractionStatus = extractedText.length >= 120 ? "succeeded" : "needs_text";
    const warning = pastedText.length >= 120 ? "Admin-supplied pasted text was used as the processing source." : extraction.warning;

    const { error: intakeError } = await db.from("job_desk_intake_files").insert({
      order_id: orderId,
      client_id: client.id,
      uploaded_by: user.id,
      storage_path: storagePath,
      file_name: file.name,
      file_size: file.size,
      content_type: inferredType,
      extracted_text: extractedText,
      extraction_status: extractionStatus,
      extraction_warning: warning ?? null
    });
    if (intakeError) throw new Error(intakeError.message);

    if (isPaid && extractionStatus === "succeeded") {
      await enqueueTask("process_cv", `process_cv:${orderId}:intake`, orderId);
    }

    await logAdminAction({
      adminId: user.id,
      action: "job_desk.order_created",
      targetType: "job_desk_order",
      targetId: orderId,
      details: { clientId: client.id, serviceType: parsed.data.serviceType, paymentStatus: parsed.data.paymentStatus, extractionStatus }
    });

    return NextResponse.json({ ok: true, orderId, extractionStatus, extractionWarning: warning ?? null }, { status: 201 });
  } catch (error) {
    if (storagePath) await db.storage.from("job-desk-intake").remove([storagePath]);
    if (clientId) await db.from("job_desk_clients").delete().eq("id", clientId);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to create the Job Desk order." }, { status: 500 });
  }
}
