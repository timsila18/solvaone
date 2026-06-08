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
  footer: { position: "absolute", bottom: 24, left: 44, right: 44, fontSize: 8, color: "#666666", flexDirection: "row", justifyContent: "space-between" },
  watermark: { position: "absolute", top: "45%", left: 80, right: 80, textAlign: "center", fontSize: 34, color: "#DDDDDD" }
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

  const sections = sectionsFromHtml(document.html);
  const filename = document.title.replace(/[^\w-]+/g, "-").toLowerCase();

  if (format === "docx") {
    const file = await Packer.toBuffer(
      new Document({
        creator: "SolvaOne",
        title: document.title,
        sections: [
          {
            children: [
              new Paragraph({ text: "SolvaOne", heading: HeadingLevel.HEADING_1 }),
              new Paragraph({ children: [new TextRun({ text: document.title, bold: true, size: 32 })] }),
              ...sections.flatMap((section) => [
                new Paragraph({ text: section.title, heading: HeadingLevel.HEADING_2 }),
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
