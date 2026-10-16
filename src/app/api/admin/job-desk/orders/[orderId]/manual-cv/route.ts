import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin, logAdminAction } from "@/lib/security";
import { getCurrentUser } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { solvaOutputSchema } from "@/lib/solva-intelligence/types";
import { sectionsToHtml } from "@/lib/solva-intelligence/safety";
import { hasVerifiedJobDeskPayment } from "@/lib/job-desk/payment";
import { candidateProfileSchema } from "@/lib/job-desk/types";

const inputSchema = z.object({
  summary: z.string().trim().min(20).max(10000),
  skills: z.string().trim().min(20).max(10000),
  experience: z.string().trim().min(20).max(30000),
  education: z.string().trim().min(20).max(10000),
  checked: z.literal(true)
});

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export async function POST(request: Request, { params }: { params: Promise<{ orderId: string }> }) {
  const user = await getCurrentUser();
  if (!user || !(await requireAdmin(user)).allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = inputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Complete all four CV sections and confirm the facts were checked." }, { status: 400 });
  const { orderId } = await params;
  const db = createSupabaseAdminClient();
  try {
    const { data: order, error } = await db.from("job_desk_orders").select("*,client:job_desk_clients(*)").eq("id", orderId).single();
    if (error || !order) return NextResponse.json({ error: "Order not found." }, { status: 404 });
    const client = Array.isArray(order.client) ? order.client[0] : order.client;
    if (!["job_search_full", "cv_revamp", "cv_build"].includes(order.service_type) || !client?.consent_to_process || !hasVerifiedJobDeskPayment(order)) {
      return NextResponse.json({ error: "A paid CV service order and processing consent are required." }, { status: 409 });
    }
    const { data: latest, error: latestError } = await db.from("job_desk_documents").select("id,status,version").eq("order_id", orderId).eq("document_type", "revamped_cv").order("version", { ascending: false }).limit(1).maybeSingle();
    if (latestError) throw latestError;
    if (latest?.status === "approved") return NextResponse.json({ error: "This order already has an approved CV." }, { status: 409 });
    const { data: candidate, error: candidateError } = await db.from("job_desk_candidate_profiles").select("structured_profile").eq("client_id", order.client_id).maybeSingle();
    if (candidateError) throw candidateError;
    const profile = candidateProfileSchema.parse({
      ...(candidate?.structured_profile ?? {}), fullName: client.full_name, email: client.email ?? "", phone: client.whatsapp_phone ?? "",
      professionalSummary: parsed.data.summary, skills: parsed.data.skills.split(/\n+/).map(s => s.trim()).filter(Boolean),
      experience: [{ responsibilities: parsed.data.experience.split(/\n+/).filter(Boolean) }],
      education: [{ qualification: parsed.data.education }]
    });
    const { error: profileError } = await db.from("job_desk_candidate_profiles").upsert({ client_id: order.client_id, structured_profile: profile, last_extracted_at: new Date().toISOString() }, { onConflict: "client_id" });
    if (profileError) throw profileError;
    const sections = ([ ["summary", "Professional Summary"], ["skills", "Skills"], ["experience", "Experience"], ["education", "Education"] ] as const).map(([id, title]) => ({
      id, title, html: parsed.data[id].split(/\n+/).map(line => `<p>${escapeHtml(line)}</p>`).join(""), improvementNotes: []
    }));
    const document = solvaOutputSchema.parse({
      title: `${client.full_name} CV`, executiveSummary: parsed.data.summary, sections,
      qualityScores: { completeness: 0, professionalTone: 0, structure: 0, notes: ["Prepared manually; automated quality scoring was not run."] }
    });
    const { data: saved, error: saveError } = await db.from("job_desk_documents").insert({
      order_id: orderId, client_id: order.client_id, document_type: "revamped_cv", title: document.title,
      structured_content: document, html: sectionsToHtml(sections), status: "review", version: (latest?.version ?? 0) + 1
    }).select("id").single();
    if (saveError) throw saveError;
    const { error: statusError } = await db.from("job_desk_orders").update({ status: "cv_review" }).eq("id", orderId);
    if (statusError) throw statusError;
    await logAdminAction({ adminId: user.id, action: "job_desk.manual_cv", targetType: "job_desk_order", targetId: orderId, details: { documentId: saved.id, apiCalls: 0 } });
    return NextResponse.json({ ok: true, documentId: saved.id });
  } catch (cause) {
    console.error("[job-desk] Manual CV save failed", cause);
    return NextResponse.json({ error: "Could not save the CV. Please retry." }, { status: 500 });
  }
}
