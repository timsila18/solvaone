import { renderToBuffer, Document as PdfDocument, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import { AlignmentType, BorderStyle, Document, Footer, HeadingLevel, LineRuleType, Packer, PageNumber, Paragraph, TextRun } from "docx";
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/security";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/supabase/server";
import { solvaOutputSchema } from "@/lib/solva-intelligence/types";

export const runtime = "nodejs";
export const maxDuration = 60;

type Block = { kind: "paragraph" | "bullet" | "subheading"; text: string };
type Section = { title: string; blocks: Block[] };

const pdfStyles = StyleSheet.create({
  page: { backgroundColor: "#FFFFFF", color: "#000000", fontFamily: "Helvetica", fontSize: 12, lineHeight: 1.15, paddingTop: 49, paddingBottom: 46, paddingHorizontal: 56 },
  header: { marginBottom: 7 },
  name: { color: "#000000", fontSize: 16, fontWeight: 700, marginBottom: 2 },
  role: { color: "#000000", fontSize: 12, fontWeight: 700, marginBottom: 3 },
  contact: { color: "#000000", fontSize: 10.5, lineHeight: 1.15, marginBottom: 5 },
  section: { marginBottom: 5 },
  heading: { fontSize: 12, fontWeight: 700, textTransform: "uppercase", borderBottomWidth: 0.6, borderBottomColor: "#000000", paddingBottom: 2, marginTop: 10, marginBottom: 4 },
  paragraph: { fontSize: 12, lineHeight: 1.15, textAlign: "justify", marginBottom: 5 },
  subheading: { fontSize: 12, fontWeight: 700, marginTop: 5, marginBottom: 2 },
  bulletRow: { flexDirection: "row", marginBottom: 2 },
  bullet: { width: 13, color: "#000000", fontSize: 11 },
  bulletText: { flex: 1, fontSize: 11, lineHeight: 1.15, textAlign: "left" },
  footer: { position: "absolute", bottom: 22, right: 56, fontSize: 8.5 }
});

function textFromHtml(value: string) {
  return value.replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<br\s*\/?\s*>/gi, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<").replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'")
    .replace(/\s+/g, " ").trim();
}

function blocksFromHtml(html: string): Block[] {
  const blocks = [...html.matchAll(/<(p|li|h3)\b[^>]*>([\s\S]*?)<\/\1>/gi)]
    .map((match): Block => ({ kind: match[1].toLowerCase() === "li" ? "bullet" : match[1].toLowerCase() === "h3" ? "subheading" : "paragraph", text: textFromHtml(match[2]) }))
    .filter((block) => block.text.length > 0);
  return blocks.length ? blocks : [{ kind: "paragraph" as const, text: textFromHtml(html) }].filter((block) => block.text);
}

function exportSections(content: unknown): Section[] {
  const parsed = solvaOutputSchema.safeParse(content);
  if (!parsed.success) return [];
  return parsed.data.sections
    .filter((section) => !/missing information|improvement notes|details to collect|quality notes/i.test(section.title))
    .map((section) => ({ title: section.title, blocks: blocksFromHtml(section.html) }))
    .filter((section) => section.blocks.length > 0);
}

function docxBlock(block: Block) {
  return new Paragraph({
    children: [new TextRun({ text: block.text, font: "Arial", size: block.kind === "bullet" ? 22 : 24, bold: block.kind === "subheading" })],
    bullet: block.kind === "bullet" ? { level: 0 } : undefined,
    alignment: block.kind === "subheading" ? AlignmentType.LEFT : AlignmentType.BOTH,
    spacing: { line: 276, lineRule: LineRuleType.AUTO, after: block.kind === "bullet" ? 40 : block.kind === "subheading" ? 20 : 100, before: block.kind === "subheading" ? 100 : 0 },
    keepNext: block.kind === "subheading",
    widowControl: true
  });
}

function pdfCv(name: string, role: string, contact: string, sections: Section[]) {
  return <PdfDocument title={`${name} CV`} author={name}>
    <Page size="A4" style={pdfStyles.page}>
      <View style={pdfStyles.header}>
        <Text style={pdfStyles.name}>{name}</Text>
        {role ? <Text style={pdfStyles.role}>{role}</Text> : null}
        {contact ? <Text style={pdfStyles.contact}>{contact}</Text> : null}
      </View>
        {sections.map((section) => <View key={section.title} style={pdfStyles.section}>
          <Text style={pdfStyles.heading} minPresenceAhead={42}>{section.title}</Text>
          {section.blocks.map((block, index) => block.kind === "bullet"
            ? <View key={index} style={pdfStyles.bulletRow}><Text style={pdfStyles.bullet}>•</Text><Text style={pdfStyles.bulletText}>{block.text}</Text></View>
            : <Text key={index} style={block.kind === "subheading" ? pdfStyles.subheading : pdfStyles.paragraph}>{block.text}</Text>)}
        </View>)}
      <Text fixed style={pdfStyles.footer} render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
    </Page>
  </PdfDocument>;
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ orderId: string }> }) {
  const user = await getCurrentUser();
  if (!user || !(await requireAdmin(user)).allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const format = request.nextUrl.searchParams.get("format");
  if (format !== "pdf" && format !== "docx") return NextResponse.json({ error: "Choose PDF or DOCX." }, { status: 400 });
  const { orderId } = await params;
  const db = createSupabaseAdminClient();
  const { data: order, error: orderError } = await db.from("job_desk_orders").select("id,client_id,client:job_desk_clients(full_name,email,whatsapp_phone)").eq("id", orderId).single();
  if (orderError || !order) return NextResponse.json({ error: "Job Desk order not found." }, { status: 404 });
  const { data: cv, error: cvError } = await db.from("job_desk_documents").select("id,status,structured_content").eq("order_id", orderId).eq("document_type", "revamped_cv").in("status", ["review", "approved"]).order("version", { ascending: false }).limit(1).maybeSingle();
  if (cvError || !cv) return NextResponse.json({ error: "No CV is ready for review or download." }, { status: 404 });
  const { data: candidate } = await db.from("job_desk_candidate_profiles").select("structured_profile").eq("client_id", order.client_id).maybeSingle();
  const sections = exportSections(cv.structured_content);
  if (sections.length < 4) return NextResponse.json({ error: "CV content needs review before export." }, { status: 409 });
  const client = Array.isArray(order.client) ? order.client[0] : order.client;
  const name = client?.full_name?.trim() || "Candidate";
  const profile = candidate?.structured_profile as { targetHeadline?: string; location?: string } | null;
  const role = profile?.targetHeadline?.trim() || "";
  const contact = [client?.email, client?.whatsapp_phone, profile?.location].filter(Boolean).join("  |  ");
  const safeName = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80) || "candidate";
  const suffix = cv.status === "review" ? "-review" : "";

  try {
    if (format === "pdf") {
      const file = await renderToBuffer(pdfCv(name, role, contact, sections));
      return new NextResponse(new Uint8Array(file), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${safeName}-cv${suffix}.pdf"`, "Cache-Control": "private, no-store" } });
    }
    const body = [
      new Paragraph({ children: [new TextRun({ text: name, font: "Arial", bold: true, size: 32 })], spacing: { after: 40 }, keepNext: true }),
      ...(role ? [new Paragraph({ children: [new TextRun({ text: role, font: "Arial", size: 24, bold: true })], spacing: { after: 60 }, keepNext: true })] : []),
      ...(contact ? [new Paragraph({ children: [new TextRun({ text: contact, font: "Arial", size: 21 })], spacing: { after: 160 }, keepNext: true })] : []),
      ...sections.flatMap((section) => [
        new Paragraph({ children: [new TextRun({ text: section.title.toUpperCase(), font: "Arial", size: 24, bold: true })], heading: HeadingLevel.HEADING_2, border: { bottom: { color: "000000", style: BorderStyle.SINGLE, size: 4, space: 1 } }, spacing: { before: 200, after: 80 }, keepNext: true }),
        ...section.blocks.map(docxBlock)
      ])
    ];
    const file = await Packer.toBuffer(new Document({ creator: name, title: `${name} CV`, styles: { default: { document: { run: { font: "Arial", size: 24 }, paragraph: { spacing: { line: 276, lineRule: LineRuleType.AUTO } } } } }, sections: [{ properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 720, right: 1120, bottom: 720, left: 1120 } } }, footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ children: [PageNumber.CURRENT, " / ", PageNumber.TOTAL_PAGES], font: "Arial", size: 18 })] })] }) }, children: body }] }));
    return new NextResponse(new Uint8Array(file), { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "Content-Disposition": `attachment; filename="${safeName}-cv${suffix}.docx"`, "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json({ error: "The CV could not be exported. Please retry or review the content." }, { status: 500 });
  }
}
