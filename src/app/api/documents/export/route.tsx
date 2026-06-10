import { Document, HeadingLevel, Packer, Paragraph, TextRun } from "docx";
import { NextRequest, NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { Page, Text, View, Document as PdfDocument, StyleSheet } from "@react-pdf/renderer";
import { userHasPaidProject } from "@/lib/payments";
import { createSupabaseServerClient, getCurrentUser } from "@/lib/supabase/server";

const styles = StyleSheet.create({
  page: { padding: 44, fontSize: 10.5, lineHeight: 1.45, color: "#000000", fontFamily: "Helvetica" },
  brand: { color: "#0066FF", fontSize: 12, fontWeight: 700, marginBottom: 14 },
  title: { fontSize: 22, marginBottom: 16, fontWeight: 700 },
  sectionTitle: { fontSize: 14, marginTop: 14, marginBottom: 7, fontWeight: 700 },
  body: { marginBottom: 5 },
  footer: { position: "absolute", bottom: 24, left: 44, right: 44, fontSize: 8, color: "#000000", flexDirection: "row", justifyContent: "space-between" },
  watermark: { position: "absolute", top: "45%", left: 80, right: 80, textAlign: "center", fontSize: 34, color: "#000000", opacity: 0.08 }
});

const cvStyles = StyleSheet.create({
  page: { padding: 0, fontSize: 9.5, lineHeight: 1.35, color: "#000000", fontFamily: "Helvetica", backgroundColor: "#FFFFFF" },
  header: { paddingTop: 30, paddingHorizontal: 34, paddingBottom: 0 },
  headerAccent: { width: 46, height: 5, backgroundColor: "#0066FF", marginBottom: 11 },
  name: { fontSize: 28, fontWeight: 700, marginBottom: 5, color: "#000000" },
  role: { fontSize: 12, color: "#0066FF", fontWeight: 700, marginBottom: 14 },
  contactBar: { backgroundColor: "#000000", color: "#FFFFFF", paddingTop: 9, paddingHorizontal: 14, paddingBottom: 5, marginTop: 4 },
  contactGrid: { flexDirection: "row", flexWrap: "wrap" },
  contactItem: { fontSize: 8.8, color: "#FFFFFF", marginRight: 14, marginBottom: 4 },
  body: { paddingHorizontal: 34, paddingTop: 20, paddingBottom: 30 },
  section: { marginBottom: 12 },
  sectionTitleRow: { flexDirection: "row", alignItems: "center", marginBottom: 7 },
  sectionBadge: { width: 17, height: 17, borderWidth: 1.4, borderColor: "#0066FF", marginRight: 8 },
  sectionTitle: { fontSize: 11.6, fontWeight: 700, textTransform: "uppercase", color: "#000000" },
  paragraph: { fontSize: 9.5, marginBottom: 4.5 },
  bulletRow: { flexDirection: "row", marginBottom: 4 },
  bulletDot: { width: 10, color: "#0066FF", fontWeight: 700 },
  bulletText: { flex: 1, fontSize: 9.5 },
  jobLine: { fontSize: 10, fontWeight: 700, marginTop: 3, marginBottom: 3 },
  footer: { position: "absolute", bottom: 16, left: 34, right: 34, paddingTop: 6, borderTopWidth: 1, borderTopColor: "#0066FF", fontSize: 7.5, color: "#000000", flexDirection: "row", justifyContent: "flex-end" }
});

function stripHtml(html: string) {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<li[^>]*>/gi, "\n- ")
    .replace(/<\/(p|div|section|h1|h2|h3)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function sectionsFromHtml(html: string) {
  const matches = [...html.matchAll(/<h2[^>]*>(.*?)<\/h2>([\s\S]*?)(?=<h2|$)/gi)];
  if (!matches.length) return [{ title: "Document", text: stripHtml(html) }];
  return matches.map((match) => ({ title: stripHtml(match[1]), text: stripHtml(match[2]) }));
}

function cvHeaderFromHtml(html: string, fallbackTitle: string) {
  const name = stripHtml(html.match(/<h1[^>]*>(.*?)<\/h1>/i)?.[1] ?? fallbackTitle);
  const beforeFirstSection = html.split(/<h2/i)[0] ?? "";
  const contact = stripHtml(beforeFirstSection)
    .split(/\n+/)
    .map((line) => line.trim())
    .filter((line) => line && line !== name)
    .join(" | ");

  return { name, contact };
}

function isCvProduct(product?: string | null) {
  return product === "cv_builder" || product === "cv_revamp";
}

function lineStyleForCv(line: string) {
  if (/section$/i.test(line) || /department$/i.test(line) || /office$/i.test(line)) return cvStyles.jobLine;
  if (/—| - |present|to date|20\d{2}|19\d{2}/i.test(line) && line.length < 130) return cvStyles.jobLine;
  return cvStyles.paragraph;
}

function roleFromTitle(title: string, name: string) {
  const normalized = title.replace(name, "").replace(/^[-\s]+/, "").trim();
  return normalized || "Professional CV";
}

function PremiumCvPdf({ title, html }: { title: string; html: string }) {
  const sections = sectionsFromHtml(html);
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
            <View key={section.title} style={cvStyles.section} wrap>
              <View style={cvStyles.sectionTitleRow}>
                <View style={cvStyles.sectionBadge} />
                <Text style={cvStyles.sectionTitle}>{section.title}</Text>
              </View>
              {section.text
                .split(/\n+/)
                .map((line) => line.trim())
                .filter(Boolean)
                .map((line, index) => {
                  const bullet = line.replace(/^[-•]\s*/, "");
                  const isBullet = bullet !== line;
                  return isBullet ? (
                    <View key={`${section.title}-${index}`} style={cvStyles.bulletRow}>
                      <Text style={cvStyles.bulletDot}>•</Text>
                      <Text style={cvStyles.bulletText}>{bullet}</Text>
                    </View>
                  ) : (
                    <Text key={`${section.title}-${index}`} style={lineStyleForCv(line)}>
                      {line}
                    </Text>
                  );
                })}
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
  const filename = document.title.replace(/[^\w-]+/g, "-").toLowerCase();
  const cvHeader = cvHeaderFromHtml(document.html, document.title);

  if (format === "docx") {
    const file = await Packer.toBuffer(
      new Document({
        creator: isCvProduct(product) ? cvHeader.name : "SolvaOne",
        title: document.title,
        sections: [
          {
            children: [
              new Paragraph({ children: [new TextRun({ text: isCvProduct(product) ? cvHeader.name : document.title, bold: true, size: 36, color: "000000" })] }),
              ...(isCvProduct(product) && cvHeader.contact
                ? [new Paragraph({ children: [new TextRun({ text: cvHeader.contact, size: 20, color: "0066FF" })] })]
                : []),
              ...sections.flatMap((section) => [
                new Paragraph({ text: section.title.toUpperCase(), heading: HeadingLevel.HEADING_2 }),
                ...section.text.split(/\n+/).map((line) => new Paragraph(line))
              ])
            ]
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

  if (isCvProduct(product)) {
    const file = await renderToBuffer(<PremiumCvPdf title={document.title} html={document.html} />);
    return new NextResponse(new Uint8Array(file), {
      headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${filename}.pdf"` }
    });
  }

  const file = await renderToBuffer(
    <PdfDocument title={document.title} author="SolvaOne">
      <Page size="A4" style={styles.page}>
        <Text style={styles.brand}>SolvaOne | Create. Apply. Grow.</Text>
        <Text style={styles.title}>{document.title}</Text>
        {sections.map((section) => (
          <View key={section.title} wrap>
            <Text style={styles.sectionTitle}>{section.title}</Text>
            {section.text.split(/\n+/).map((line, index) => (
              <Text key={`${section.title}-${index}`} style={styles.body}>
                {line}
              </Text>
            ))}
          </View>
        ))}
        <View style={styles.footer} fixed>
          <Text>Exported {new Date().toLocaleDateString("en-KE")} by SolvaOne</Text>
          <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
        </View>
      </Page>
    </PdfDocument>
  );

  return new NextResponse(new Uint8Array(file), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${filename}.pdf"` }
  });
}
