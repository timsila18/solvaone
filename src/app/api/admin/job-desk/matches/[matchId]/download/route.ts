import { AlignmentType, Document, HeadingLevel, LineRuleType, Packer, Paragraph, TextRun } from "docx";
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/security";
import { getCurrentUser } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { plainText } from "@/lib/job-desk/automation";

function filename(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80) || "candidate";
}

function cvParagraphs(html: string) {
  const chunks = html.replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<style[\s\S]*?<\/style>/gi, "").match(/<h2[^>]*>[\s\S]*?<\/h2>|<h3[^>]*>[\s\S]*?<\/h3>|<li[^>]*>[\s\S]*?<\/li>|<p[^>]*>[\s\S]*?<\/p>/gi) ?? [];
  return chunks.map((chunk) => {
    const text = plainText(chunk);
    if (!text) return null;
    const heading = /^<h[23]/i.test(chunk);
    const bullet = /^<li/i.test(chunk);
    return new Paragraph({ children: [new TextRun({ text, bold: heading, size: 24 })], heading: heading ? HeadingLevel.HEADING_2 : undefined, bullet: bullet ? { level: 0 } : undefined, alignment: heading ? AlignmentType.LEFT : AlignmentType.JUSTIFIED, spacing: { line: 276, lineRule: LineRuleType.EXACT, before: heading ? 220 : 0, after: heading ? 120 : 90 } });
  }).filter((paragraph): paragraph is Paragraph => paragraph !== null);
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ matchId: string }> }) {
  const user = await getCurrentUser();
  if (!user || !(await requireAdmin(user)).allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const kind = request.nextUrl.searchParams.get("kind");
  if (kind !== "cv" && kind !== "letter") return NextResponse.json({ error: "Invalid document type" }, { status: 400 });
  const { matchId } = await params;
  const db = createSupabaseAdminClient();
  const { data: match } = await db.from("job_desk_matches").select("id,order_id,authorized_at,status,cover_letter,order:job_desk_orders(payment_status,client:job_desk_clients(full_name))").eq("id", matchId).single();
  const order = Array.isArray(match?.order) ? match.order[0] : match?.order;
  const client = Array.isArray(order?.client) ? order.client[0] : order?.client;
  if (!match || !match.authorized_at || !["authorized", "needs_human", "submitted"].includes(match.status) || !order || !["paid", "waived"].includes(order.payment_status)) return NextResponse.json({ error: "Authorized paid application required" }, { status: 403 });
  const name = client?.full_name ?? "Candidate";
  let paragraphs: Paragraph[];
  if (kind === "cv") {
    const { data: cv } = await db.from("job_desk_documents").select("html").eq("order_id", match.order_id).eq("document_type", "revamped_cv").eq("status", "approved").order("version", { ascending: false }).limit(1).maybeSingle();
    if (!cv) return NextResponse.json({ error: "Approved CV not found" }, { status: 404 });
    paragraphs = [new Paragraph({ children: [new TextRun({ text: name, bold: true, size: 36 })], alignment: AlignmentType.LEFT, spacing: { after: 180 } }), ...cvParagraphs(String(cv.html))];
    if (paragraphs.length < 5) return NextResponse.json({ error: "CV requires review before download" }, { status: 409 });
  } else {
    if (!match.cover_letter) return NextResponse.json({ error: "Cover letter not ready" }, { status: 404 });
    paragraphs = String(match.cover_letter).split(/\n+/).filter(Boolean).map((line) => new Paragraph({ children: [new TextRun({ text: line.trim(), size: 24 })], alignment: AlignmentType.JUSTIFIED, spacing: { line: 276, lineRule: LineRuleType.EXACT, after: 160 } }));
  }
  const file = await Packer.toBuffer(new Document({ creator: name, title: kind === "cv" ? `${name} CV` : `${name} Cover Letter`, sections: [{ properties: { page: { margin: { top: 850, bottom: 850, left: 900, right: 900 } } }, children: paragraphs }] }));
  return new NextResponse(new Uint8Array(file), { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "Content-Disposition": `attachment; filename="${filename(name)}-${kind}.docx"`, "Cache-Control": "private, no-store" } });
}
