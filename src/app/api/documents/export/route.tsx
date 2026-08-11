import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  HeadingLevel,
  LineRuleType,
  Packer,
  PageNumber,
  Paragraph,
  TextRun
} from "docx";
import { NextRequest, NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { Page, Text, View, Document as PdfDocument, StyleSheet } from "@react-pdf/renderer";
import { userHasPaidProject } from "@/lib/payments";
import { createSupabaseServerClient, getCurrentUser } from "@/lib/supabase/server";

type PlainSection = { title: string; text: string };

const styles = StyleSheet.create({
  page: { padding: 44, fontSize: 10.5, lineHeight: 1.45, color: "#000000", fontFamily: "Helvetica" },
  title: { fontSize: 24, marginBottom: 7, fontWeight: 700 },
  titleRule: { width: 58, height: 4, backgroundColor: "#0066FF", marginBottom: 18 },
  sectionTitle: { fontSize: 13.5, marginTop: 14, marginBottom: 7, paddingBottom: 4, borderBottomWidth: 1, borderBottomColor: "#0066FF", fontWeight: 700 },
  body: { marginBottom: 5 },
  bulletRow: { flexDirection: "row", marginBottom: 4 },
  bulletDot: { width: 10, color: "#0066FF", fontWeight: 700 },
  bulletText: { flex: 1, fontSize: 10.5 },
  footer: { position: "absolute", bottom: 24, left: 44, right: 44, fontSize: 8, color: "#000000", flexDirection: "row", justifyContent: "flex-end" }
});

const cvStyles = StyleSheet.create({
  page: { padding: 0, fontSize: 12, lineHeight: 1.15, color: "#000000", fontFamily: "Helvetica", backgroundColor: "#FFFFFF" },
  header: { backgroundColor: "#000000", paddingTop: 28, paddingHorizontal: 38, paddingBottom: 17 },
  headerAccent: { width: 52, height: 4, backgroundColor: "#0066FF", marginBottom: 12 },
  name: { fontSize: 25, fontWeight: 700, marginBottom: 6, color: "#FFFFFF" },
  role: { fontSize: 12, color: "#FFFFFF", fontWeight: 700, marginBottom: 11 },
  contactBar: { borderTopWidth: 1, borderTopColor: "#0066FF", paddingTop: 8 },
  contactGrid: { flexDirection: "row", flexWrap: "wrap" },
  contactItem: { fontSize: 9.5, lineHeight: 1.15, color: "#FFFFFF", marginRight: 14, marginBottom: 4, maxWidth: 250 },
  body: { paddingHorizontal: 38, paddingTop: 16, paddingBottom: 34 },
  section: { marginBottom: 9 },
  sectionTitleRow: { flexDirection: "row", alignItems: "center", marginBottom: 5, paddingBottom: 3, borderBottomWidth: 1, borderBottomColor: "#0066FF" },
  sectionBadge: { width: 6, height: 17, backgroundColor: "#0066FF", marginRight: 8 },
  sectionTitle: { fontSize: 13, lineHeight: 1.15, fontWeight: 700, textTransform: "uppercase", color: "#000000" },
  paragraph: { fontSize: 12, lineHeight: 1.15, marginBottom: 4, textAlign: "justify" },
  bulletRow: { flexDirection: "row", marginBottom: 3.5 },
  bulletDot: { width: 12, color: "#0066FF", fontWeight: 700, fontSize: 12, lineHeight: 1.15 },
  bulletText: { flex: 1, fontSize: 12, lineHeight: 1.15, textAlign: "justify" },
  jobLine: { fontSize: 12, lineHeight: 1.15, fontWeight: 700, marginTop: 3, marginBottom: 3, textAlign: "left" },
  footer: { position: "absolute", bottom: 15, left: 38, right: 38, paddingTop: 5, borderTopWidth: 1, borderTopColor: "#0066FF", fontSize: 8.5, color: "#000000", flexDirection: "row", justifyContent: "flex-end" }
});

const CV_BODY_FONT_SIZE = 24;
const CV_LINE_SPACING_115 = 276;

function stripHtml(html: string) {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<(br|hr)\s*\/?>/gi, "\n")
    .replace(/<li[^>]*>/gi, "\n- ")
    .replace(/<\/(p|div|section|h1|h2|h3|li)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/\b(Email|Phone|Mobile|Tel|LinkedIn|Location|Address|Portfolio|Website):/gi, "\n$1:")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function isInternalCvSection(title: string) {
  return /application strengthening|missing evidence|missing information|improvement notes|achievement prompts|details to collect|quality notes/i.test(title);
}

function presentableLine(line: string) {
  return !/to be provided|additional detail recommended|structured service-ready|automated polish|service recovery/i.test(line);
}

function visibleLines(text: string) {
  return text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter((line) => line && presentableLine(line));
}

function sectionsFromHtml(html: string) {
  const matches = [...html.matchAll(/<h2[^>]*>(.*?)<\/h2>([\s\S]*?)(?=<h2|$)/gi)];
  const sections = matches.length ? matches.map((match) => ({ title: stripHtml(match[1]), text: stripHtml(match[2]) })) : [{ title: "Document", text: stripHtml(html) }];
  return sections.filter((section) => !isInternalCvSection(section.title));
}

function isCvProduct(product?: string | null) {
  return product === "cv_builder" || product === "cv_revamp";
}

function cvHeaderFromHtml(html: string, fallbackTitle: string) {
  const sections = sectionsFromHtml(html);
  const contactSection = sections.find((section) => /contact|candidate details|personal details/i.test(section.title));
  const contactLines = visibleLines(contactSection?.text ?? "");
  const titleName = fallbackTitle.split(/\s+-\s+/)[0]?.trim() || fallbackTitle;
  const h1 = stripHtml(html.match(/<h1[^>]*>(.*?)<\/h1>/i)?.[1] ?? "");
  const name =
    contactLines.find((line) => !/email|phone|mobile|tel|linkedin|location|address|website|portfolio/i.test(line) && line.length <= 80) ||
    h1 ||
    titleName;
  const contact = contactLines
    .filter((line) => line !== name)
    .filter((line) => /@|\+?\d{7,}|linkedin|location|address|website|portfolio|nairobi|kenya|mombasa|kisumu|nakuru|eldoret/i.test(line))
    .join(" | ");
  return { name, contact };
}

function roleFromTitle(title: string, name: string) {
  const normalized = title.replace(name, "").replace(/^[-\s]+/, "").replace(/\s+CV$/i, "").trim();
  return normalized || "Professional CV";
}

function sectionLines(text: string) {
  return visibleLines(text);
}

function isBulletLine(line: string) {
  return /^[-*\u2022]\s+/.test(line);
}

function cleanBullet(line: string) {
  return line.replace(/^[-*\u2022]\s+/, "").trim();
}

function lineStyleForCv(line: string) {
  if (/section$|department$|office$/i.test(line)) return cvStyles.jobLine;
  if (/ - |present|to date|20\d{2}|19\d{2}/i.test(line) && line.length < 130) return cvStyles.jobLine;
  return cvStyles.paragraph;
}

function docxParagraph(line: string, isCv: boolean) {
  const bullet = isBulletLine(line);
  const jobLine = isCv && lineStyleForCv(line) === cvStyles.jobLine;
  return new Paragraph({
    children: [
      new TextRun({
        text: bullet ? cleanBullet(line) : line,
        size: isCv ? CV_BODY_FONT_SIZE : 22,
        font: isCv ? "Arial" : "Aptos",
        bold: jobLine,
        color: "000000"
      })
    ],
    bullet: bullet ? { level: 0 } : undefined,
    indent: bullet ? { left: 360 } : undefined,
    alignment: isCv && !jobLine ? AlignmentType.BOTH : AlignmentType.LEFT,
    spacing: isCv
      ? { after: bullet ? 54 : 72, line: CV_LINE_SPACING_115, lineRule: LineRuleType.AUTO }
      : { after: 120 },
    keepLines: jobLine,
    widowControl: true
  });
}

function docxSectionTitle(title: string, isCv: boolean) {
  return new Paragraph({
    children: [
      new TextRun({
        text: title.toUpperCase(),
        bold: true,
        size: isCv ? 26 : 28,
        font: isCv ? "Arial" : "Aptos",
        color: "000000"
      })
    ],
    heading: HeadingLevel.HEADING_2,
    spacing: isCv
      ? { before: 180, after: 84, line: CV_LINE_SPACING_115, lineRule: LineRuleType.AUTO }
      : { before: 280, after: 120 },
    border: { bottom: { color: isCv ? "0066FF" : "000000", space: 1, style: BorderStyle.SINGLE, size: 6 } },
    keepNext: true,
    widowControl: true
  });
}

function buildDocxChildren(input: { title: string; html: string; product?: string; sections: PlainSection[] }) {
  const isCv = isCvProduct(input.product);
  const header = cvHeaderFromHtml(input.html, input.title);
  const cvSections = isCv ? input.sections.filter((section) => !/contact|candidate details|personal details/i.test(section.title)) : input.sections;

  if (isCv) {
    return [
      new Paragraph({
        children: [new TextRun({ text: header.name, bold: true, size: 44, font: "Arial", color: "000000" })],
        alignment: AlignmentType.CENTER,
        spacing: { after: 72, line: CV_LINE_SPACING_115, lineRule: LineRuleType.AUTO },
        keepNext: true
      }),
      ...(header.contact
        ? [
            new Paragraph({
              children: [new TextRun({ text: header.contact, size: 21, font: "Arial", color: "0066FF" })],
              alignment: AlignmentType.CENTER,
              spacing: { after: 126, line: CV_LINE_SPACING_115, lineRule: LineRuleType.AUTO },
              keepNext: true,
              widowControl: true
            })
          ]
        : []),
      ...cvSections.flatMap((section) => [docxSectionTitle(section.title, true), ...sectionLines(section.text).map((line) => docxParagraph(line, true))])
    ];
  }

  return [
    new Paragraph({ children: [new TextRun({ text: input.title, bold: true, size: 36, color: "000000" })], spacing: { after: 180 } }),
    ...input.sections.flatMap((section) => [docxSectionTitle(section.title, false), ...sectionLines(section.text).map((line) => docxParagraph(line, false))])
  ];
}

function PremiumCvPdf({ title, html }: { title: string; html: string }) {
  const sections = sectionsFromHtml(html).filter((section) => !/contact|candidate details|personal details/i.test(section.title));
  const header = cvHeaderFromHtml(html, title);
  const role = roleFromTitle(title, header.name);
  const contactItems = header.contact.split("|").map((item) => item.trim()).filter(Boolean);

  return (
    <PdfDocument title={title} author={header.name}>
      <Page size="A4" style={cvStyles.page}>
        <View style={cvStyles.header}>
          <View style={cvStyles.headerAccent} />
          <Text style={cvStyles.name}>{header.name}</Text>
          <Text style={cvStyles.role}>{role}</Text>
          {contactItems.length ? (
            <View style={cvStyles.contactBar}>
              <View style={cvStyles.contactGrid}>
                {contactItems.map((item) => (
                  <Text key={item} style={cvStyles.contactItem}>
                    {item}
                  </Text>
                ))}
              </View>
            </View>
          ) : null}
        </View>
        <View style={cvStyles.body}>
          {sections.map((section) => (
            <View key={section.title} style={cvStyles.section} wrap minPresenceAhead={55}>
              <View style={cvStyles.sectionTitleRow}>
                <View style={cvStyles.sectionBadge} />
                <Text style={cvStyles.sectionTitle}>{section.title}</Text>
              </View>
              {sectionLines(section.text).map((line, index) =>
                isBulletLine(line) ? (
                  <View key={`${section.title}-${index}`} style={cvStyles.bulletRow}>
                    <Text style={cvStyles.bulletDot}>-</Text>
                    <Text style={cvStyles.bulletText}>{cleanBullet(line)}</Text>
                  </View>
                ) : (
                  <Text key={`${section.title}-${index}`} style={lineStyleForCv(line)}>
                    {line}
                  </Text>
                )
              )}
            </View>
          ))}
        </View>
        <View style={cvStyles.footer} fixed>
          <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
        </View>
      </Page>
    </PdfDocument>
  );
}

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const documentId = request.nextUrl.searchParams.get("documentId");
  const format = request.nextUrl.searchParams.get("format");
  const variant = request.nextUrl.searchParams.get("variant") === "ats" ? "ats" : "premium";
  if (!documentId || (format !== "pdf" && format !== "docx")) {
    return NextResponse.json({ error: "Invalid export request" }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  const { data: document } = await supabase
    .from("documents")
    .select("id,title,html,project_id,projects(product)")
    .eq("id", documentId)
    .eq("user_id", user.id)
    .single();

  if (!document) return NextResponse.json({ error: "Document not found" }, { status: 404 });
  const hasPaid = await userHasPaidProject(user.id, document.project_id);
  if (!hasPaid) return NextResponse.json({ error: "Confirmed payment is required before downloads." }, { status: 402 });

  const project = Array.isArray(document.projects) ? document.projects[0] : document.projects;
  const product = project?.product as string | undefined;
  const sections = sectionsFromHtml(document.html);
  const filenameBase = document.title.replace(/[^\w-]+/g, "-").replace(/^-+|-+$/g, "").toLowerCase() || "document";
  const filename = isCvProduct(product) ? `${filenameBase}-${variant}` : filenameBase;
  const cvHeader = cvHeaderFromHtml(document.html, document.title);

  if (format === "docx") {
    const isCv = isCvProduct(product);
    const file = await Packer.toBuffer(
      new Document({
        creator: isCv ? cvHeader.name : "SolvaOne",
        title: document.title,
        styles: isCv
          ? {
              default: {
                document: {
                  run: { font: "Arial", size: CV_BODY_FONT_SIZE, color: "000000" },
                  paragraph: {
                    alignment: AlignmentType.BOTH,
                    spacing: { after: 72, line: CV_LINE_SPACING_115, lineRule: LineRuleType.AUTO }
                  }
                }
              }
            }
          : undefined,
        sections: [
          {
            properties: {
              page: {
                size: isCv ? { width: 11906, height: 16838 } : undefined,
                margin: isCv
                  ? { top: 936, right: 936, bottom: 936, left: 936, header: 432, footer: 432 }
                  : { top: 900, right: 900, bottom: 900, left: 900 }
              }
            },
            footers: isCv
              ? {
                  default: new Footer({
                    children: [
                      new Paragraph({
                        alignment: AlignmentType.RIGHT,
                        border: { top: { color: "0066FF", space: 4, style: BorderStyle.SINGLE, size: 4 } },
                        children: [
                          new TextRun({
                            children: ["Page ", PageNumber.CURRENT, " of ", PageNumber.TOTAL_PAGES],
                            size: 18,
                            font: "Arial",
                            color: "000000"
                          })
                        ]
                      })
                    ]
                  })
                }
              : undefined,
            children: buildDocxChildren({ title: document.title, html: document.html, product, sections })
          }
        ]
      })
    );
    return new NextResponse(new Uint8Array(file), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="${filename}.docx"`
      }
    });
  }

  if (isCvProduct(product) && variant !== "ats") {
    const file = await renderToBuffer(<PremiumCvPdf title={document.title} html={document.html} />);
    return new NextResponse(new Uint8Array(file), {
      headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${filename}.pdf"` }
    });
  }

  const file = await renderToBuffer(
    <PdfDocument title={document.title} author={isCvProduct(product) ? cvHeader.name : document.title}>
      <Page size="A4" style={styles.page}>
        <Text style={styles.title}>{isCvProduct(product) ? cvHeader.name : document.title}</Text>
        <View style={styles.titleRule} />
        {isCvProduct(product) && cvHeader.contact ? <Text style={styles.body}>{cvHeader.contact}</Text> : null}
        {sections
          .filter((section) => !isCvProduct(product) || !/contact|candidate details|personal details/i.test(section.title))
          .map((section) => (
            <View key={section.title} wrap>
              <Text style={styles.sectionTitle}>{section.title}</Text>
              {sectionLines(section.text).map((line, index) =>
                isBulletLine(line) ? (
                  <View key={`${section.title}-${index}`} style={styles.bulletRow}>
                    <Text style={styles.bulletDot}>-</Text>
                    <Text style={styles.bulletText}>{cleanBullet(line)}</Text>
                  </View>
                ) : (
                  <Text key={`${section.title}-${index}`} style={styles.body}>
                    {line}
                  </Text>
                )
              )}
            </View>
          ))}
        <View style={styles.footer} fixed>
          <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
        </View>
      </Page>
    </PdfDocument>
  );

  return new NextResponse(new Uint8Array(file), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${filename}.pdf"` }
  });
}
