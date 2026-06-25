import { NextResponse } from "next/server";
import { z } from "zod";
import { assertAiUsageAllowed } from "@/lib/ai-usage";
import { extractTextFromStoredCv } from "@/lib/cv-extraction";
import { createSupabaseServerClient, getCurrentUser } from "@/lib/supabase/server";
import { userHasPaidProject } from "@/lib/payments";
import { checkRateLimit, clientIpFromHeaders, rateLimitResponse } from "@/lib/security";
import { generateWithSolvaIntelligence } from "@/lib/solva-intelligence/service";
import { hasPromptInjectionRisk } from "@/lib/solva-intelligence/safety";
import { generationModeSchema } from "@/lib/solva-intelligence/types";

const schema = z.object({
  projectId: z.string().uuid(),
  documentId: z.string().uuid(),
  product: z.enum(["cv_builder", "cv_revamp", "cover_letter", "company_profile", "business_plan"]),
  templateId: z.string().min(2).max(120).nullable().optional(),
  title: z.string().min(2).max(160),
  payload: z.record(z.unknown()).default({}),
  brief: z.string().max(20000).optional(),
  mode: generationModeSchema.optional(),
  sectionId: z.string().max(120).optional(),
  sectionHtml: z.string().max(30000).optional()
});

async function hasPaidGenerationAccess(projectId: string, userId: string) {
  if (process.env.SOLVA_REQUIRE_PAYMENT_FOR_GENERATION === "false") {
    return true;
  }

  return userHasPaidProject(userId, projectId);
}

function textValue(payload: Record<string, unknown>, key: string) {
  const value = payload[key];
  return typeof value === "string" ? value.trim() : "";
}

function hasText(payload: Record<string, unknown>, key: string, minLength = 12) {
  return textValue(payload, key).length >= minLength;
}

function validateProductInput(product: z.infer<typeof schema>["product"], payload: Record<string, unknown>, brief = "") {
  if (product === "cv_builder") {
    return hasText(payload, "personalDetails", 12) && hasText(payload, "targetJobTitle", 3) && (hasText(payload, "workExperience", 20) || hasText(payload, "education", 12) || brief.trim().length >= 30);
  }

  if (product === "cover_letter") {
    return hasText(payload, "applicantName", 2) && hasText(payload, "targetJobTitle", 3) && (hasText(payload, "company", 2) || hasText(payload, "industry", 3)) && (hasText(payload, "experienceSummary", 20) || hasText(payload, "keyAchievements", 20) || hasText(payload, "jobAdvertText", 40));
  }

  if (product === "company_profile") {
    return hasText(payload, "companyName", 2) && hasText(payload, "industry", 3) && hasText(payload, "servicesProducts", 20);
  }

  if (product === "business_plan") {
    return hasText(payload, "businessName", 2) && hasText(payload, "industryLocation", 3) && hasText(payload, "productsServices", 20) && (hasText(payload, "targetMarket", 12) || hasText(payload, "businessModel", 12));
  }

  return true;
}

export async function POST(request: Request) {
  const ip = clientIpFromHeaders(request.headers);
  const limited = checkRateLimit(`ai:${ip}`, 10, 60 * 1000);
  if (!limited.allowed) return rateLimitResponse(limited.resetAt);

  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid generation payload" }, { status: 400 });
  }

  if (!(await hasPaidGenerationAccess(parsed.data.projectId, user.id))) {
    return NextResponse.json({ error: "A successful payment is required before generation." }, { status: 402 });
  }

  try {
    await assertAiUsageAllowed(user.id, parsed.data.projectId);
    let generationPayload = parsed.data.payload;

    if (
      parsed.data.product === "cv_revamp" &&
      (typeof generationPayload.oldCvContent !== "string" || generationPayload.oldCvContent.trim().length < 40) &&
      typeof generationPayload.uploadedCvStoragePath === "string"
    ) {
      const extraction = await extractTextFromStoredCv(
        user.id,
        generationPayload.uploadedCvStoragePath,
        typeof generationPayload.uploadedCvFileName === "string" ? generationPayload.uploadedCvFileName : "uploaded-cv.docx",
        typeof generationPayload.uploadedCvFileType === "string" ? generationPayload.uploadedCvFileType : ""
      );

      if (extraction.text) {
        generationPayload = {
          ...generationPayload,
          oldCvContent: extraction.text,
          uploadedCvParseWarning: extraction.warning ?? ""
        };
      }
    }

    if (parsed.data.product === "cv_revamp" && typeof generationPayload.oldCvContent === "string" && generationPayload.oldCvContent.trim().length < 40) {
      return NextResponse.json({ error: "Upload a readable DOCX or TXT CV, or paste the CV text before generation." }, { status: 400 });
    }

    if (parsed.data.product === "cv_revamp" && typeof generationPayload.oldCvContent !== "string") {
      return NextResponse.json({ error: "Upload a readable DOCX or TXT CV, or paste the CV text before generation." }, { status: 400 });
    }

    if (!validateProductInput(parsed.data.product, generationPayload, parsed.data.brief ?? "")) {
      return NextResponse.json({ error: "Add the required document details before generation." }, { status: 400 });
    }

    if (hasPromptInjectionRisk(generationPayload) || hasPromptInjectionRisk({ brief: parsed.data.brief ?? "", sectionHtml: parsed.data.sectionHtml ?? "" })) {
      return NextResponse.json({ error: "The input contains unsafe instructions. Please remove prompt override or secret-request language." }, { status: 400 });
    }

    const payload = parsed.data.brief
      ? { ...generationPayload, sourceBrief: parsed.data.brief }
      : generationPayload;

    const result = await generateWithSolvaIntelligence({
      userId: user.id,
      projectId: parsed.data.projectId,
      documentId: parsed.data.documentId,
      product: parsed.data.product,
      templateId: parsed.data.templateId,
      title: parsed.data.title,
      payload,
      mode: parsed.data.mode,
      sectionId: parsed.data.sectionId,
      sectionHtml: parsed.data.sectionHtml
    });

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Generation failed.";
    const supabase = await createSupabaseServerClient();
    await supabase.from("audit_logs").insert({
      user_id: user.id,
      action: "document.generate.failed",
      entity_type: "project",
      entity_id: parsed.data.projectId,
      metadata: { error: message, product: parsed.data.product }
    });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
