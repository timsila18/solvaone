import { Document, Packer, Paragraph } from "docx";
import { NextRequest, NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { Page, Text, View, Document as PdfDocument, StyleSheet } from "@react-pdf/renderer";
import { createSupabaseServerClient, getCurrentUser } from "@/lib/supabase/server";

const styles = StyleSheet.create({
  page: { padding: 48, fontSize: 11, lineHeight: 1.5 },
  title: { fontSize: 20, marginBottom: 16, fontWeight: 700 },
  body: { color: "#111111" }
});

function stripHtml(html: string) {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const documentId = request.nextUrl.searchParams.get("documentId");
  const format = request.nextUrl.searchParams.get("format");
  if (!documentId || (format !== "pdf" && format !== "docx")) {
    return NextResponse.json({ error: "Invalid export request" }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  const { data: document } = await supabase
    .from("documents")
    .select("id,title,html")
    .eq("id", documentId)
    .eq("user_id", user.id)
    .single();

  if (!document) {
    return NextResponse.json({ error: "Document not found" }, { status: 404 });
  }

  const text = stripHtml(document.html);

  if (format === "docx") {
    const file = await Packer.toBuffer(
      new Document({
        sections: [{ children: text.split(/\n+/).map((line) => new Paragraph(line)) }]
      })
    );
    return new NextResponse(new Uint8Array(file), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="${document.title}.docx"`
      }
    });
  }

  const file = await renderToBuffer(
    <PdfDocument>
      <Page size="A4" style={styles.page}>
        <View>
          <Text style={styles.title}>{document.title}</Text>
          <Text style={styles.body}>{text}</Text>
        </View>
      </Page>
    </PdfDocument>
  );

  return new NextResponse(new Uint8Array(file), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${document.title}.pdf"`
    }
  });
}
