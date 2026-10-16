import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { z } from "zod";
import { getCurrentUser } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireAdmin, checkRateLimit, rateLimitResponse } from "@/lib/security";
import { hasVerifiedJobDeskPayment } from "@/lib/job-desk/payment";
import { canAutomatePortal } from "@/lib/job-desk/portal-browser";
import { queueClientUpdate } from "@/lib/job-desk/client-updates";
import { applicationScopeHold, readApplicationScope } from "@/lib/job-desk/application-scope";

export const runtime = "nodejs";
export const maxDuration = 60;
const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("click"), x: z.number().int().min(0).max(10000), y: z.number().int().min(0).max(10000) }),
  z.object({ action: z.literal("type"), text: z.string().min(1).max(2000) }),
  z.object({ action: z.literal("key"), key: z.enum(["Tab", "Enter", "Backspace", "Escape", "ArrowDown", "ArrowUp", "Control+a"]) }),
  z.object({ action: z.literal("scroll"), direction: z.enum(["up", "down"]) }),
  z.object({ action: z.literal("verify") }), z.object({ action: z.literal("close") }),
  z.object({ action: z.literal("attach_cv") }), z.object({ action: z.literal("attach_letter") }),
]);

async function handle(request: Request, context: { params: Promise<{ matchId: string }> }) {
  const user = await getCurrentUser();
  if (!user || !(await requireAdmin(user)).allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (request.method === "POST" && request.headers.get("origin") !== new URL(request.url).origin) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  const limit = checkRateLimit(`handoff:${user.id}`, 90, 60000);
  if (!limit.allowed) return rateLimitResponse(limit.resetAt);
  const { matchId } = await context.params;
  if (!z.string().uuid().safeParse(matchId).success) return NextResponse.json({ error: "Invalid application." }, { status: 400 });
  try {
    const action = request.method === "POST" ? actionSchema.parse(await request.json()) : null;
    const db = createSupabaseAdminClient();
    const { data: match, error } = await db.from("job_desk_matches").select("id,order_id,vacancy:job_desk_vacancies(*,source:job_desk_sources(provider,site_token,active))").eq("id", matchId).single();
    if (error || !match) return NextResponse.json({ error: "Application not found." }, { status: 404 });
    const { data: application, error: appError } = await db.from("job_desk_applications").select("status,method,provider_response,provider_message_id").eq("match_id", matchId).eq("order_id", match.order_id).single();
    if (appError || !application || application.method !== "portal") return NextResponse.json({ error: "No portal attempt available." }, { status: 409 });
    if (!["needs_human", "submitted"].includes(application.status)) return NextResponse.json({ error: "Application is still processing." }, { status: 409 });
    if (application.status === "submitted") return NextResponse.json({ submitted: true, confirmation: "This application is already recorded as submitted." });
    const vacancy = Array.isArray(match.vacancy) ? match.vacancy[0] : match.vacancy;
    const source = Array.isArray(vacancy?.source) ? vacancy.source[0] : vacancy?.source;
    if (!source?.active || !canAutomatePortal(source.provider, source.site_token, vacancy?.apply_url ?? "")) return NextResponse.json({ error: "This portal has no supported browser handoff." }, { status: 409 });
    const base = new URL(process.env.APPLICATION_AGENT_URL ?? "");
    const token = process.env.APPLICATION_AGENT_TOKEN;
    if (base.protocol !== "https:" || base.username || base.password || !token) throw new Error("Agent unavailable");
    const endpoint = new URL(`/applications/${matchId}/handoff`, base);
    const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
    const metadata = await fetch(endpoint, { headers: { ...headers, "x-handoff-metadata": "1" }, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(20000) });
    const initial = await metadata.json();
    if (!metadata.ok) return NextResponse.json({ error: initial.error ?? "Session unavailable." }, { status: metadata.status });
    let result = initial;
    if (!initial.receipt && action?.action !== "close") {
      const { data: cv, error: cvError } = await db.from("job_desk_documents").select("id,status,html,structured_content").eq("order_id", match.order_id).eq("document_type", "revamped_cv").order("version", { ascending: false }).limit(1).maybeSingle();
      const { data: order, error: orderError } = await db.from("job_desk_orders").select("status,payment_status,amount,payment_reference,application_authorized,service_details,client:job_desk_clients(consent_to_process)").eq("id", match.order_id).single();
      const client = Array.isArray(order?.client) ? order.client[0] : order?.client;
      const scope = order?.application_authorized ? readApplicationScope(order.service_details) : null;
      const fingerprint = cv ? createHash("sha256").update(JSON.stringify([cv.html, cv.structured_content])).digest("hex") : null;
      if (cvError || orderError || cv?.status !== "approved" || cv.id !== initial.approvedCvId || fingerprint !== initial.approvedCvFingerprint || !order || !hasVerifiedJobDeskPayment(order) || !scope || !vacancy || applicationScopeHold(scope, vacancy) || !["approved", "active"].includes(order.status) || !client?.consent_to_process) return NextResponse.json({ error: "The order, scope, consent or current approved CV changed. Review before continuing this saved session." }, { status: 409 });
    }
    if (action) {
      if (!["verify", "close"].includes(action.action)) {
        const { data: claimed, error: claimError } = await db.from("job_desk_applications").update({ provider_response: { ...(application.provider_response as object ?? {}), clicked: true, human_handoff: true } }).eq("match_id", matchId).eq("status", "needs_human").select("match_id").maybeSingle();
        if (claimError || !claimed) return NextResponse.json({ error: "Application state changed. Refresh before continuing." }, { status: 409 });
      }
      const response = await fetch(endpoint, { method: "POST", headers, body: JSON.stringify(action), redirect: "error", signal: AbortSignal.timeout(45000) });
      result = await response.json();
      if (!response.ok) return NextResponse.json({ error: result.error ?? "Browser action unavailable." }, { status: response.status });
    } else if (!initial.receipt) {
      const response = await fetch(endpoint, { headers, redirect: "error", cache: "no-store", signal: AbortSignal.timeout(20000) });
      result = await response.json();
      if (!response.ok) return NextResponse.json({ error: result.error ?? "Screenshot unavailable." }, { status: response.status });
    }
    if (action?.action === "verify" && result.receipt) {
      const receipt = result.receipt;
      if (receipt.status !== "submitted" || receipt.clicked !== true || typeof receipt.confirmation !== "string" || !receipt.confirmation.trim() || !canAutomatePortal(source.provider, source.site_token, receipt.finalUrl)) throw new Error("Receipt invalid");
      const submittedAt = new Date().toISOString();
      const { error: saveError } = await db.from("job_desk_applications").update({ status: "submitted", submitted_at: submittedAt, error_message: null, provider_response: { ...(application.provider_response as object ?? {}), ...receipt, verification_type: "portal_confirmation", recorded_by: user.id, human_handoff: true } }).eq("match_id", matchId).in("status", ["needs_human", "submitted"]);
      if (saveError) throw saveError;
      const { error: matchError } = await db.from("job_desk_matches").update({ status: "submitted", submitted_at: submittedAt }).eq("id", matchId);
      if (matchError) throw matchError;
      try { await queueClientUpdate(match.order_id, "application_submitted", matchId); } catch { /* Receipt remains recorded even if notification is delayed. */ }
      return NextResponse.json({ submitted: true, confirmation: receipt.confirmation }, { headers: { "Cache-Control": "no-store" } });
    }
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof z.ZodError ? "Invalid browser action." : "Handoff unavailable. Review the saved receipt before retrying." }, { status: error instanceof z.ZodError ? 400 : 503 });
  }
}
export const GET = handle;
export const POST = handle;
