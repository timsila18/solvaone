import { z } from "zod";
import { createOpenAIClient } from "@/lib/openai";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { buildProductPrompt } from "./prompts";
import { estimateCost, extractTokenUsage } from "./costs";
import { hasPromptInjectionRisk, sanitizePayload, sectionsToHtml, stripUnsafeHtml } from "./safety";
import { solvaOutputSchema, type GenerateDocumentInput, type SolvaOutput } from "./types";

const MAX_GENERATIONS_PER_HOUR = 10;
const CV_MIN_SECTION_COUNT = 9;
const CV_MIN_TEXT_LENGTH = 9000;
const CV_MIN_WORD_COUNT = 1100;
const CV_MIN_BULLET_COUNT = 30;

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
      "Expand truthfully with role scope, professional summary depth, core competencies, career highlights, richer work bullets, technical tools, projects, leadership/volunteer details where provided, and missing-information prompts where details are absent."
    ].join("\n");
  }

  return null;
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
          "Strengthen bullets using: Action + Scope + Tool/Method + Result/Business Value.",
          "Do not summarize or shorten the CV. The polished version must be at least as detailed as the draft.",
          "Keep or improve the 3-page premium depth standard: 1,500+ words, 9-12 useful sections, and 30+ useful bullets.",
          "If facts are missing, use To be provided and list the missing detail in missingInformation.",
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

  if (error) throw new Error(error.message);
  if ((count ?? 0) >= MAX_GENERATIONS_PER_HOUR) {
    throw new Error("Generation limit reached. Please try again later.");
  }
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

export async function generateWithSolvaIntelligence(input: GenerateDocumentInput) {
  await enforceRateLimit(input.userId);

  const supabase = await createSupabaseServerClient();
  const payload = sanitizePayload(input.payload);
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
    await supabase
      .from("ai_generations")
      .update({ status: "failed", error_message: message })
      .eq("id", generation.id);
    await supabase
      .from("documents")
      .update({ generation_status: "failed", updated_at: new Date().toISOString() })
      .eq("id", input.documentId)
      .eq("user_id", input.userId);
    throw new Error(message);
  }
}
