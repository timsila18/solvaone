import { AlignmentType, Document, LineRuleType, Packer, Paragraph, TextRun } from "docx";
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/security";
import { getCurrentUser } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { hasVerifiedJobDeskPayment } from "@/lib/job-desk/payment";
import { createJobDeskCvDocx } from "@/lib/job-desk/cv-docx";

function filename(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80) || "candidate";
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ matchId: string }> }) {
  const user = await getCurrentUser();
  if (!user || !(await requireAdmin(user)).allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const kind = request.nextUrl.searchParams.get("kind");
  if (kind !== "cv" && kind !== "letter") return NextResponse.json({ error: "Invalid document type" }, { status: 400 });
  const { matchId } = await params;
  const db = createSupabaseAdminClient();
  const { data: match } = await db.from("job_desk_matches").select("id,order_id,authorized_at,status,cover_letter,vacancy:job_desk_vacancies(title,description),order:job_desk_orders(payment_status,amount,payment_reference,client_id,client:job_desk_clients(full_name,email,whatsapp_phone))").eq("id", matchId).single();
  const order = Array.isArray(match?.order) ? match.order[0] : match?.order;
  const client = Array.isArray(order?.client) ? order.client[0] : order?.client;
  if (!match || !match.authorized_at || !["authorized", "needs_human", "submitted"].includes(match.status) || !hasVerifiedJobDeskPayment(order)) return NextResponse.json({ error: "Authorized paid application required" }, { status: 403 });
  const name = client?.full_name ?? "Candidate";
  let paragraphs: Paragraph[];
  if (kind === "cv") {
    const { data: cv } = await db.from("job_desk_documents").select("structured_content").eq("order_id", match.order_id).eq("document_type", "revamped_cv").eq("status", "approved").order("version", { ascending: false }).limit(1).maybeSingle();
    if (!cv) return NextResponse.json({ error: "Approved CV not found" }, { status: 404 });
    const { data: profile } = await db.from("job_desk_candidate_profiles").select("structured_profile").eq("client_id", order!.client_id).maybeSingle();
    const candidate = (profile?.structured_profile ?? {}) as { targetHeadline?: string; location?: string };
    const vacancy = Array.isArray(match.vacancy) ? match.vacancy[0] : match.vacancy;
    const file = await createJobDeskCvDocx({ name, role: candidate.targetHeadline?.trim() ?? "", contact: [client?.email, client?.whatsapp_phone, candidate.location].filter(Boolean).join("  |  "), content: cv.structured_content, vacancy });
    return new NextResponse(new Uint8Array(file), { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "Content-Disposition": `attachment; filename="${filename(name)}-cv.docx"`, "Cache-Control": "private, no-store" } });
  } else {
    if (!match.cover_letter) return NextResponse.json({ error: "Cover letter not ready" }, { status: 404 });
    paragraphs = String(match.cover_letter).split(/\n+/).filter(Boolean).map((line) => new Paragraph({ children: [new TextRun({ text: line.trim(), size: 24 })], alignment: AlignmentType.JUSTIFIED, spacing: { line: 276, lineRule: LineRuleType.EXACT, after: 160 } }));
  }
  const file = await Packer.toBuffer(new Document({ creator: name, title: `${name} Cover Letter`, sections: [{ properties: { page: { margin: { top: 850, bottom: 850, left: 900, right: 900 } } }, children: paragraphs }] }));
  return new NextResponse(new Uint8Array(file), { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "Content-Disposition": `attachment; filename="${filename(name)}-letter.docx"`, "Cache-Control": "private, no-store" } });
}
