import { z } from "zod";
import { createOpenAIClient } from "@/lib/openai";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { buildProductPrompt } from "./prompts";
import { estimateCost, extractTokenUsage } from "./costs";
import { hasPromptInjectionRisk, sanitizePayload, sectionsToHtml, stripUnsafeHtml } from "./safety";
import { solvaOutputSchema, type GenerateDocumentInput, type SolvaOutput } from "./types";

const MAX_GENERATIONS_PER_HOUR = 10;
const CV_MIN_SECTION_COUNT = 9;
const CV_MIN_TEXT_LENGTH = 10500;
const CV_MIN_WORD_COUNT = 1400;
const CV_MIN_BULLET_COUNT = 30;
const CV_RECOVERABLE_TEXT_LENGTH = 8000;
const CV_RECOVERABLE_WORD_COUNT = 1100;

function isCvProduct(product: string) {
  return product === "cv_builder" || product === "cv_revamp";
}

function textFromHtml(html: string) {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<li[^>]*>/gi, "\n- ")
    .replace(/<\/(p|div|section|h1|h2|h3|li)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function wordCount(text: string) {
  return text.split(/\s+/).filter(Boolean).length;
}

function cvDepthIssue(input: GenerateDocumentInput, output: SolvaOutput) {
  if (!isCvProduct(input.product) || (input.mode && input.mode !== "full_document")) return null;

  const combinedText = output.sections.map((section) => `${section.title} ${textFromHtml(section.html)}`).join(" ");
  const sectionCount = output.sections.length;
  const bulletCount = output.sections.reduce((count, section) => count + (section.html.match(/<li\b|(^|\n)\s*[-*\u2022]/gi)?.length ?? 0), 0);
  const words = wordCount(combinedText);

  if (sectionCount < CV_MIN_SECTION_COUNT || combinedText.length < CV_MIN_TEXT_LENGTH || words < CV_MIN_WORD_COUNT || bulletCount < CV_MIN_BULLET_COUNT) {
    return [
      "The CV is too short for SolvaOne's premium standard.",
      `Current depth: ${sectionCount} sections, ${words} words, ${combinedText.length} text characters, ${bulletCount} bullets.`,
      `Required minimum: ${CV_MIN_SECTION_COUNT}+ sections, ${CV_MIN_WORD_COUNT}+ words, ${CV_MIN_TEXT_LENGTH}+ text characters, and ${CV_MIN_BULLET_COUNT}+ useful bullets.`,
      "Rewrite into a richer ATS-optimized CV targeting at least 3 full A4 pages in the premium PDF/DOCX layout.",
      "Do not add fake employers, dates, qualifications, certifications, referees, awards, or exact metrics.",
      "Never invent percentages, quantities, money, client counts, team sizes, project counts, KPIs, or any measurable result. Use supplied figures only; otherwise describe value qualitatively.",
      "Balance compact sections so the final page is substantially filled without repetition, padding, or unsupported content.",
      "Expand truthfully with role scope, professional summary depth, core competencies, career highlights, richer work bullets, technical tools, projects, leadership/volunteer details where provided, and missing-information prompts where details are absent."
    ].join("\n");
  }

  return null;
}

function cvDepthStats(output: SolvaOutput) {
  const combinedText = output.sections.map((section) => `${section.title} ${textFromHtml(section.html)}`).join(" ");
  return {
    sectionCount: output.sections.length,
    bulletCount: output.sections.reduce((count, section) => count + (section.html.match(/<li\b|(^|\n)\s*[-*\u2022]/gi)?.length ?? 0), 0),
    words: wordCount(combinedText),
    textLength: combinedText.length
  };
}

function isRecoverableCvDepth(input: GenerateDocumentInput, output: SolvaOutput) {
  if (!isCvProduct(input.product) || (input.mode && input.mode !== "full_document")) return true;
  const stats = cvDepthStats(output);
  return stats.sectionCount >= CV_MIN_SECTION_COUNT && stats.bulletCount >= CV_MIN_BULLET_COUNT && stats.words >= CV_RECOVERABLE_WORD_COUNT && stats.textLength >= CV_RECOVERABLE_TEXT_LENGTH;
}

function markRecoverableCvDepth(output: SolvaOutput, issue: string) {
  return {
    ...output,
    improvementNotes: [
      ...output.improvementNotes,
      "The CV has been delivered successfully. For an even stronger version, add measurable achievements, exact tools used, reporting scope, and leadership or project examples, then use Improve Section or Regenerate."
    ],
    missingInformation: Array.from(
      new Set([
        ...output.missingInformation,
        "To be provided: measurable achievements such as numbers handled, revenue, clients served, reports produced, team size, projects completed, or turnaround improvements.",
        "To be provided: exact tools, systems, certifications, referees, and role-specific keywords from the target job advert where available."
      ])
    ),
    qualityScores: {
      ...output.qualityScores,
      notes: [...output.qualityScores.notes, issue, "Delivered as a recoverable premium draft to avoid blocking a paid customer after a valid generation."]
    }
  };
}

function shouldRunCvWriterReview(input: GenerateDocumentInput) {
  return isCvProduct(input.product) && (!input.mode || input.mode === "full_document");
}

async function runHumanCvWriterReview(input: GenerateDocumentInput, draft: SolvaOutput, client: ReturnType<typeof createOpenAIClient>, model: string) {
  const reviewResponse = await client.responses.create({
    model,
    input: [
      {
        role: "system",
        content:
          "You are a senior professional CV writer and ATS reviewer for Kenya and East Africa. Return only valid JSON matching the supplied document schema."
      },
      {
        role: "developer",
        content: [
          "Review and polish the supplied CV JSON.",
          "Improve clarity, seniority, confidence, grammar, impact, ATS structure, repetition, and unnecessary filler.",
          "Keep the CV unbranded. Do not mention AI, SolvaOne, or the generation platform.",
          "Preserve truthfulness. Do not invent employers, dates, qualifications, certifications, referees, awards, or exact metrics.",
          "Never invent percentages, quantities, money, client counts, team sizes, project counts, KPIs, or measurable outcomes. Retain a metric only when it is supported by the customer's payload or source CV; otherwise rewrite it as a truthful qualitative contribution.",
          "Strengthen bullets using: Action + Scope + Tool/Method + Result/Business Value.",
          "Do not summarize or shorten the CV. The polished version must be at least as detailed as the draft.",
          "Keep or improve the 3-page premium depth standard: 1,500+ words, 9-12 useful sections, and 30+ useful bullets.",
          "Arrange the final CV as 3-4 balanced A4 pages. Avoid leaving a sparse final page by positioning compact factual sections thoughtfully or merging compatible short sections, without repetition or filler.",
          "If facts are missing, list the missing detail in missingInformation metadata. Do not create visible employer-facing CV sections that reveal the document is unfinished.",
          "Return one complete JSON object only. No markdown fences."
        ].join("\n")
      },
      {
        role: "user",
        content: JSON.stringify(
          {
            product: input.product,
            title: input.title,
            payload: input.payload,
            draft
          },
          null,
          2
        )
      }
    ],
    temperature: 0.18,
    max_output_tokens: 18000
  } as any);

  const polished = parseSolvaJson((reviewResponse as { output_text?: string }).output_text ?? "");
  const depthIssue = cvDepthIssue(input, polished);
  if (depthIssue) return { output: draft, response: reviewResponse };
  return { output: polished, response: reviewResponse };
}

async function enforceRateLimit(userId: string) {
  const supabase = await createSupabaseServerClient();
  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count, error } = await supabase
    .from("ai_generations")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .gte("created_at", since);

  if (error) return error.message;
  if ((count ?? 0) >= MAX_GENERATIONS_PER_HOUR) {
    return "Generation volume is high for this user. Continue because payment has already been confirmed, but record the event for admin review.";
  }
  return null;
}

async function nextVersionNumber(documentId: string) {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("document_versions")
    .select("version_number")
    .eq("document_id", documentId)
    .order("version_number", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data?.version_number ?? 0) + 1;
}

function parseSolvaJson(raw: string): SolvaOutput {
  const cleaned = raw.replace(/^```json/i, "").replace(/^```/, "").replace(/```$/, "").trim();
  const parsed = JSON.parse(cleaned);
  return solvaOutputSchema.parse(parsed);
}

function inputCvScores(input: GenerateDocumentInput) {
  const report = input.payload.cvQualityReport as { scores?: Record<string, number> } | undefined;
  return report?.scores ?? {};
}

function fallbackScores(output: SolvaOutput, input: GenerateDocumentInput) {
  const sectionCount = output.sections.length;
  const totalLength = output.sections.reduce((sum, section) => sum + section.html.length, 0);
  const completeness = Math.min(100, 55 + sectionCount * 5 + Math.floor(totalLength / 1200));
  const cvScores = inputCvScores(input);
  return {
    ...output.qualityScores,
    completeness: output.qualityScores.completeness || completeness,
    professionalTone: output.qualityScores.professionalTone || 85,
    structure: output.qualityScores.structure || Math.min(95, 60 + sectionCount * 5),
    ats: output.qualityScores.ats || cvScores.atsReadiness,
    achievementStrength: output.qualityScores.achievementStrength || cvScores.achievementStrength,
    recruiterReadability: output.qualityScores.recruiterReadability || cvScores.recruiterReadability,
    careerClarity: output.qualityScores.careerClarity || cvScores.careerClarity
  };
}

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function paragraphsFromText(value: unknown) {
  const text = String(value ?? "").trim();
  if (!text) return "";
  return text
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`)
    .join("");
}

function bulletListFromValues(values: unknown[]) {
  const items = values
    .flatMap((value) => String(value ?? "").split(/\n|,|;/))
    .map((value) => value.trim())
    .filter(Boolean)
    .slice(0, 36);
  if (!items.length) return "";
  return `<ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`;
}

function firstUsefulLine(...values: unknown[]) {
  for (const value of values) {
    const line = String(value ?? "")
      .split(/\r?\n/)
      .map((item) => item.trim())
      .find((item) => item.length > 2 && item.length < 90);
    if (line) return line;
  }
  return "Professional Document";
}

function section(id: string, title: string, html: string, note = "Structured from the customer's saved information.") {
  return { id, title, html: html || "<p>Available upon request.</p>", improvementNotes: [note] };
}

function optionalSection(id: string, title: string, html: string, note = "Structured from the customer's saved information.") {
  return html ? section(id, title, html, note) : null;
}

function buildServiceRecoveryOutput(input: GenerateDocumentInput, payload: Record<string, unknown>, reason: string): SolvaOutput {
  const targetRole = firstUsefulLine(payload.targetJobTitle, payload.letterType, payload.industry, input.title);
  const companyName = firstUsefulLine(payload.companyName, payload.company, payload.businessName, input.title);
  const commonNotes = [
    "A structured document was created from the saved customer details after the premium polish pass could not complete.",
    "The customer can edit this document, add missing details, regenerate, and download PDF or Word without paying again."
  ];

  if (input.product === "cv_builder" || input.product === "cv_revamp") {
    const source = payload.oldCvContent ?? payload.workExperience ?? payload.personalDetails ?? input.title;
    const name = firstUsefulLine(payload.personalDetails, payload.oldCvContent, input.title);
    const sections = [
      section("candidate_details", "Candidate Details", paragraphsFromText(payload.personalDetails || name)),
      section("target_role", "Target Role", `<p>${escapeHtml(targetRole)}</p>`),
      section(
        "professional_profile",
        "Professional Profile",
        `<p>${escapeHtml(name)} is a professional candidate positioned for ${escapeHtml(targetRole)} opportunities, with experience and background details organized into a clean, recruiter-friendly CV structure. The profile emphasizes transferable strengths, role alignment, professional discipline, and readiness to contribute in structured organizational environments.</p>`
      ),
      section("core_competencies", "Core Competencies / ATS Keywords", bulletListFromValues([payload.skills, payload.jobAdvertText, payload.targetIndustry, payload.industry])),
      section("professional_experience", "Professional Experience", paragraphsFromText(source)),
      optionalSection("education", "Education", paragraphsFromText(payload.education)),
      optionalSection("certifications_training", "Certifications and Training", paragraphsFromText(payload.certifications)),
      optionalSection("projects_leadership", "Projects and Leadership", paragraphsFromText(payload.projectsLeadership)),
      section("referees", "Referees", paragraphsFromText(payload.referees || "Available upon request."))
    ].filter(Boolean) as SolvaOutput["sections"];
    return {
      title: `${name} - ${targetRole} CV`,
      executiveSummary: "Structured CV recovery document prepared from the customer's saved details.",
      sections,
      qualityScores: { completeness: 72, professionalTone: 82, structure: 88, ats: 78, achievementStrength: 68, recruiterReadability: 82, careerClarity: 76, notes: [...commonNotes, reason] },
      improvementNotes: commonNotes,
      missingInformation: [
        "To be provided: measurable achievements for each role.",
        "To be provided: complete employment dates, tools/software, certifications, referees, and target job advert keywords where missing."
      ],
      atsKeywords: String(payload.jobAdvertText ?? payload.skills ?? payload.targetIndustry ?? "").split(/\W+/).filter((word) => word.length > 3).slice(0, 30),
      improvementsMade: ["Created a structured ATS-friendly CV layout from saved details.", "Added missing-information prompts so the customer can improve the paid document without starting over."]
    };
  }

  if (input.product === "cover_letter") {
    const applicant = firstUsefulLine(payload.applicantName, input.title);
    return {
      title: `${applicant} - ${targetRole} Cover Letter`,
      executiveSummary: "Structured cover letter recovery document prepared from saved details.",
      sections: [
        section("salutation", "Salutation", `<p>Dear Hiring Manager,</p>`),
        section("opening", "Opening Paragraph", `<p>I am writing to express interest in the ${escapeHtml(targetRole)} opportunity${payload.company ? ` at ${escapeHtml(payload.company)}` : ""}. My background and supplied experience details show a candidate ready to contribute with professionalism, reliability, and role-focused execution.</p>`),
        section("evidence_body", "Evidence-Based Body", paragraphsFromText(payload.experienceSummary || payload.keyAchievements || payload.jobAdvertText)),
        section("closing", "Closing Paragraph", `<p>I would welcome the opportunity to discuss how my background can support your team's goals. Thank you for your consideration.</p>`)
      ],
      qualityScores: { completeness: 76, professionalTone: 88, structure: 86, notes: [...commonNotes, reason] },
      improvementNotes: commonNotes,
      missingInformation: ["To be provided: company-specific achievements, contact details, and job advert priorities where missing."],
      atsKeywords: [],
      improvementsMade: ["Prepared a one-page cover letter structure from saved details."]
    };
  }

  if (input.product === "company_profile") {
    return {
      title: `${companyName} - Company Profile`,
      executiveSummary: "Structured company profile recovery document prepared from saved business details.",
      sections: [
        section("cover_page", "Cover Page Content", `<p>${escapeHtml(companyName)}</p><p>${escapeHtml(payload.location ?? "Location: To be provided")}</p>`),
        section("company_overview", "Company Overview", paragraphsFromText(payload.servicesProducts || payload.industry)),
        section("background", "Background", paragraphsFromText(payload.yearFounded || "To be provided.")),
        section("vision_mission_values", "Vision, Mission and Core Values", paragraphsFromText(payload.visionMissionValues)),
        section("services", "Our Services", bulletListFromValues([payload.servicesProducts])),
        section("target_clients", "Target Clients", paragraphsFromText(payload.targetClients)),
        section("why_choose_us", "Why Choose Us", bulletListFromValues(["Professional service delivery", "Clear communication", "Client-focused execution", "Compliance-minded operations"])),
        section("team_projects_compliance", "Team, Projects and Compliance", paragraphsFromText(payload.teamProjectsCompliance)),
        section("contact_information", "Contact Information", paragraphsFromText(payload.contactDetails))
      ],
      qualityScores: { completeness: 78, professionalTone: 86, structure: 90, tenderReadiness: 76, notes: [...commonNotes, reason] },
      improvementNotes: commonNotes,
      missingInformation: ["To be provided: registrations, licenses, past projects, team profiles, client references, and tender compliance evidence."],
      atsKeywords: [],
      improvementsMade: ["Created a tender-ready company profile structure from saved business details."]
    };
  }

  return {
    title: `${companyName} - Business Plan`,
    executiveSummary: "Structured business plan recovery document prepared from saved business details.",
    sections: [
      section("executive_summary", "Executive Summary", paragraphsFromText(payload.businessModel || payload.productsServices)),
      section("business_description", "Business Description", paragraphsFromText(payload.industryLocation)),
      section("problem_solution", "Problem Statement and Proposed Solution", paragraphsFromText(payload.targetMarket || payload.productsServices)),
      section("products_services", "Products and Services", bulletListFromValues([payload.productsServices])),
      section("market_analysis", "Market Analysis", paragraphsFromText(payload.targetMarket)),
      section("competitor_analysis", "Competitor Analysis", paragraphsFromText(payload.competitorsMarketing)),
      section("marketing_sales", "Marketing and Sales Strategy", paragraphsFromText(payload.competitorsMarketing)),
      section("operations_team", "Operations Plan and Team", paragraphsFromText(payload.operationsTeam)),
      section("financial_plan", "Financial Plan", paragraphsFromText(payload.startupCostsPricingRevenue || payload.financialFunding)),
      section("roadmap", "Implementation Roadmap", bulletListFromValues(["Finalize missing assumptions", "Confirm startup costs and pricing", "Validate target customers", "Launch sales and operations tracking"])),
      section("conclusion", "Conclusion", `<p>This plan is ready for editing and strengthening with the missing business details listed below.</p>`)
    ],
    qualityScores: { completeness: 76, professionalTone: 84, structure: 90, businessClarity: 78, notes: [...commonNotes, reason] },
    improvementNotes: commonNotes,
    missingInformation: ["To be provided: startup costs, revenue assumptions, competitor names, funding needs, implementation dates, and operating costs."],
    atsKeywords: [],
    improvementsMade: ["Created a practical business plan structure from saved business details."]
  };
}

async function saveServiceRecoveryDocument(input: GenerateDocumentInput, generationId: string, payload: Record<string, unknown>, reason: string) {
  const supabase = await createSupabaseServerClient();
  const output = buildServiceRecoveryOutput(input, payload, reason);
  const safeSections = output.sections.map((item) => ({ ...item, html: stripUnsafeHtml(item.html) }));
  const html = sectionsToHtml(safeSections);
  const versionNumber = await nextVersionNumber(input.documentId);

  await supabase
    .from("documents")
    .update({
      title: output.title || input.title,
      html,
      structured_content: { ...output, sections: safeSections },
      quality_scores: output.qualityScores,
      generation_status: "succeeded",
      version: versionNumber,
      updated_at: new Date().toISOString()
    })
    .eq("id", input.documentId)
    .eq("user_id", input.userId);

  await supabase.from("document_versions").insert({
    document_id: input.documentId,
    user_id: input.userId,
    version_number: versionNumber,
    content: { html, output: { ...output, sections: safeSections }, qualityScores: output.qualityScores, serviceRecovery: true },
    change_type: "generation"
  });

  await supabase
    .from("ai_generations")
    .update({
      output_payload: { ...output, sections: safeSections, serviceRecovery: true },
      quality_scores: output.qualityScores,
      status: "failed",
      error_message: reason
    })
    .eq("id", generationId);

  await supabase.from("projects").update({ status: "ready", updated_at: new Date().toISOString() }).eq("id", input.projectId);

  await supabase.from("audit_logs").insert({
    user_id: input.userId,
    action: "document.generate.service_recovery",
    entity_type: "project",
    entity_id: input.projectId,
    metadata: { documentId: input.documentId, product: input.product, generationId, reason }
  });

  return { html, output: { ...output, sections: safeSections, qualityScores: output.qualityScores }, generationId, serviceRecovery: true };
}

export async function generateWithSolvaIntelligence(input: GenerateDocumentInput) {
  const supabase = await createSupabaseServerClient();
  const usageWarning = await enforceRateLimit(input.userId);
  const payload = sanitizePayload({
    ...input.payload,
    ...(usageWarning ? { usageWarning } : {})
  });
  if (JSON.stringify(payload).length > 60000) {
    throw new Error("Input is too large. Please shorten the pasted content and try again.");
  }

  if (hasPromptInjectionRisk(payload)) {
    throw new Error("The input appears to contain unsafe prompt instructions. Please remove them and try again.");
  }

  const model = process.env.OPENAI_MODEL ?? "gpt-4.1-mini";
  const { data: generation, error: generationError } = await supabase
    .from("ai_generations")
    .insert({
      user_id: input.userId,
      project_id: input.projectId,
      document_id: input.documentId,
      product_type: input.product,
      input_payload: { ...input, payload },
      model_used: model,
      status: "running"
    })
    .select("id")
    .single();

  if (generationError) throw new Error(generationError.message);

  try {
    const prompt = buildProductPrompt({ ...input, payload });
    const client = createOpenAIClient();
    let output: SolvaOutput | null = null;
    let rawResponse: unknown = null;
    let usageTotals = { inputTokens: 0, outputTokens: 0, totalTokens: 0 };

    for (let attempt = 1; attempt <= 3; attempt += 1) {
      rawResponse = await client.responses.create({
        model,
        input: [
          { role: "system", content: prompt.system },
          {
            role: "developer",
            content:
              attempt === 1
                ? prompt.developer
                : `${prompt.developer}\n\nREPAIR MODE: The previous response was invalid, too thin, or did not meet the required schema/depth standard. Return one complete valid JSON object only. Do not include markdown fences, commentary, or trailing text.`
          },
          {
            role: "user",
            content:
              attempt === 1
                ? prompt.user
                : `${prompt.user}\n\nQUALITY RETRY INSTRUCTIONS:\n${output ? cvDepthIssue(input, output) ?? "Return valid JSON that fully satisfies the schema." : "Return valid JSON that fully satisfies the schema."}`
          }
        ],
        temperature: attempt === 1 ? 0.35 : 0.15,
        max_output_tokens: isCvProduct(input.product) && (!input.mode || input.mode === "full_document") ? 18000 : 12000
      } as any);
      const attemptUsage = extractTokenUsage(rawResponse);
      usageTotals = {
        inputTokens: usageTotals.inputTokens + attemptUsage.inputTokens,
        outputTokens: usageTotals.outputTokens + attemptUsage.outputTokens,
        totalTokens: usageTotals.totalTokens + attemptUsage.totalTokens
      };

      try {
        output = parseSolvaJson((rawResponse as { output_text?: string }).output_text ?? "");
        const depthIssue = cvDepthIssue(input, output);
        if (depthIssue && attempt < 3) continue;
        if (depthIssue && isRecoverableCvDepth(input, output)) {
          output = markRecoverableCvDepth(output, depthIssue);
          break;
        }
        if (depthIssue) throw new Error(depthIssue);
        break;
      } catch (error) {
        if (attempt === 3) throw error;
      }
    }

    if (!output) throw new Error("Solva Intelligence returned an empty response.");

    if (shouldRunCvWriterReview(input)) {
      const polished = await runHumanCvWriterReview({ ...input, payload }, output, client, model);
      output = polished.output;
      rawResponse = polished.response;
      const reviewUsage = extractTokenUsage(polished.response);
      usageTotals = {
        inputTokens: usageTotals.inputTokens + reviewUsage.inputTokens,
        outputTokens: usageTotals.outputTokens + reviewUsage.outputTokens,
        totalTokens: usageTotals.totalTokens + reviewUsage.totalTokens
      };
    }

    const qualityScores = fallbackScores(output, { ...input, payload });
    const safeSections = output.sections.map((section) => ({ ...section, html: stripUnsafeHtml(section.html) }));
    const html = sectionsToHtml(safeSections);
    const usage = usageTotals.totalTokens > 0 ? usageTotals : extractTokenUsage(rawResponse);
    const estimatedCost = estimateCost(model, usage.inputTokens, usage.outputTokens);
    const versionNumber = await nextVersionNumber(input.documentId);

    await supabase
      .from("documents")
      .update({
        title: output.title || input.title,
        html,
        structured_content: { ...output, sections: safeSections },
        quality_scores: qualityScores,
        generation_status: "succeeded",
        version: versionNumber,
        updated_at: new Date().toISOString()
      })
      .eq("id", input.documentId)
      .eq("user_id", input.userId);

    await supabase.from("document_versions").insert({
      document_id: input.documentId,
      user_id: input.userId,
      version_number: versionNumber,
      content: { html, output: { ...output, sections: safeSections }, qualityScores },
      change_type: input.mode === "full_document" || !input.mode ? "generation" : "section_improvement"
    });

    await supabase
      .from("ai_generations")
      .update({
        output_payload: { ...output, sections: safeSections },
        token_input: usage.inputTokens,
        token_output: usage.outputTokens,
        total_tokens: usage.totalTokens,
        estimated_cost: estimatedCost,
        quality_scores: qualityScores,
        status: "succeeded"
      })
      .eq("id", generation.id);

    await supabase.from("projects").update({ status: "ready", updated_at: new Date().toISOString() }).eq("id", input.projectId);

    return { html, output: { ...output, sections: safeSections, qualityScores }, generationId: generation.id };
  } catch (error) {
    const message = error instanceof z.ZodError ? "Generated output failed quality validation." : error instanceof Error ? error.message : "Generation failed.";
    const recovery = await saveServiceRecoveryDocument(input, generation.id, payload, message).catch(async () => {
      await supabase
        .from("ai_generations")
        .update({ status: "failed", error_message: message })
        .eq("id", generation.id);
      await supabase
        .from("documents")
        .update({ generation_status: "failed", updated_at: new Date().toISOString() })
        .eq("id", input.documentId)
        .eq("user_id", input.userId);
      return null;
    });
    if (recovery) return recovery;
    throw new Error(message);
  }
}
