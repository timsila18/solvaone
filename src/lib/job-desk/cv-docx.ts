import { AlignmentType, BorderStyle, Document, Footer, HeadingLevel, LineRuleType, Packer, PageNumber, Paragraph, TextRun } from "docx";
import { solvaOutputSchema } from "@/lib/solva-intelligence/types";
import { tailorApprovedCv } from "./cv-tailoring";

type CvBlock = { kind: "paragraph" | "bullet" | "subheading"; text: string };

function plain(value: string) {
  return value.replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<br\s*\/?\s*>/gi, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<").replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'")
    .replace(/\s+/g, " ").trim();
}

function blocksFromHtml(html: string): CvBlock[] {
  const blocks = [...html.matchAll(/<(p|li|h3)\b[^>]*>([\s\S]*?)<\/\1>/gi)]
    .map((match): CvBlock => ({ kind: match[1].toLowerCase() === "li" ? "bullet" : match[1].toLowerCase() === "h3" ? "subheading" : "paragraph", text: plain(match[2]) }))
    .filter((block) => block.text.length > 0);
  return blocks.length ? blocks : [{ kind: "paragraph" as const, text: plain(html) }].filter((block) => block.text);
}

function blockParagraph(block: CvBlock) {
  return new Paragraph({
    children: [new TextRun({ text: block.text, font: "Arial", size: block.kind === "bullet" ? 22 : 24, bold: block.kind === "subheading" })],
    bullet: block.kind === "bullet" ? { level: 0 } : undefined,
    alignment: block.kind === "subheading" ? AlignmentType.LEFT : AlignmentType.BOTH,
    spacing: { line: 276, lineRule: LineRuleType.AUTO, after: block.kind === "bullet" ? 40 : block.kind === "subheading" ? 20 : 100, before: block.kind === "subheading" ? 100 : 0 },
    keepNext: block.kind === "subheading", widowControl: true
  });
}

export async function createJobDeskCvDocx({ name, role, contact, content, vacancy }: { name: string; role: string; contact: string; content: unknown; vacancy?: { title: string; description: string } }) {
  const cv = tailorApprovedCv(solvaOutputSchema.parse(content), vacancy);
  const sections = cv.sections
    .filter((section) => !/missing information|improvement notes|details to collect|quality notes/i.test(section.title))
    .map((section) => ({ title: section.title, blocks: blocksFromHtml(section.html) }))
    .filter((section) => section.blocks.length > 0);
  if (sections.length < 4) throw new Error("Approved CV requires review before attachment.");
  const body = [
    new Paragraph({ children: [new TextRun({ text: name, font: "Arial", bold: true, size: 32 })], spacing: { after: 40 }, keepNext: true }),
    ...(role ? [new Paragraph({ children: [new TextRun({ text: role, font: "Arial", size: 24, bold: true })], spacing: { after: 60 }, keepNext: true })] : []),
    ...(contact ? [new Paragraph({ children: [new TextRun({ text: contact, font: "Arial", size: 21 })], spacing: { after: 160 }, keepNext: true })] : []),
    ...sections.flatMap((section) => [
      new Paragraph({ children: [new TextRun({ text: section.title.toUpperCase(), font: "Arial", size: 24, bold: true })], heading: HeadingLevel.HEADING_2, border: { bottom: { color: "000000", style: BorderStyle.SINGLE, size: 4, space: 1 } }, spacing: { before: 200, after: 80 }, keepNext: true }),
      ...section.blocks.map(blockParagraph)
    ])
  ];
  return Packer.toBuffer(new Document({
    creator: name, title: `${name} CV`,
    styles: { default: { document: { run: { font: "Arial", size: 24 }, paragraph: { spacing: { line: 276, lineRule: LineRuleType.AUTO } } } } },
    sections: [{
      properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 720, right: 1120, bottom: 720, left: 1120 } } },
      footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ children: [PageNumber.CURRENT, " / ", PageNumber.TOTAL_PAGES], font: "Arial", size: 18 })] })] }) },
      children: body
    }]
  }));
}
