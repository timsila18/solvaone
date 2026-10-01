import type { GenerateDocumentInput, SolvaOutput } from "./types";

function isFullCv(input: Pick<GenerateDocumentInput, "product" | "mode">) {
  return (input.product === "cv_builder" || input.product === "cv_revamp") && (!input.mode || input.mode === "full_document");
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

export function cvDepthStats(output: Pick<SolvaOutput, "sections">) {
  const combinedText = output.sections.map((section) => `${section.title} ${textFromHtml(section.html)}`).join(" ");
  return {
    sectionCount: output.sections.length,
    bulletCount: output.sections.reduce((count, section) => count + (section.html.match(/<li\b|(^|\n)\s*[-*\u2022]/gi)?.length ?? 0), 0),
    words: combinedText.split(/\s+/).filter(Boolean).length,
    textLength: combinedText.length
  };
}

export function isUsableCv(input: Pick<GenerateDocumentInput, "product" | "mode">, output: Pick<SolvaOutput, "sections">) {
  if (!isFullCv(input)) return true;
  const stats = cvDepthStats(output);
  return stats.sectionCount >= 2 && stats.words >= 35 && stats.textLength >= 200;
}

export function cvDepthIssue(input: Pick<GenerateDocumentInput, "product" | "mode">, output: Pick<SolvaOutput, "sections">) {
  if (!isFullCv(input)) return null;
  const { sectionCount, words, bulletCount } = cvDepthStats(output);
  if (sectionCount >= 4 && words >= 500 && bulletCount >= 5) return null;
  return [
    `The supplied information supports ${sectionCount} sections, ${words} words and ${bulletCount} experience bullets so far.`,
    "Improve useful detail where the source supports it, without repeating duties or inventing facts.",
    "Record any missing achievements, dates, tools or qualifications in private improvement notes, not the employer-facing CV."
  ].join(" ");
}
