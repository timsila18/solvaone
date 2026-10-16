import { createHash, randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { Document, Packer, Paragraph } from "docx";
import { getCurrentUser } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireAdmin, checkRateLimit, rateLimitResponse } from "@/lib/security";
import { hasVerifiedJobDeskPayment } from "@/lib/job-desk/payment";
import { canRetrySubmission, submissionPreflight } from "@/lib/job-desk/submission-preflight";
import { canAutomatePortal, type PortalApplication } from "@/lib/job-desk/portal-browser";
import { applicationScopeHold, readApplicationScope } from "@/lib/job-desk/application-scope";
import { verifyVacancyStillOpen } from "@/lib/job-desk/automation";
import { readApplicantDetails } from "@/lib/job-desk/applicant-details";
import { localApplicationLetter } from "@/lib/job-desk/local-letter";
import { createJobDeskCvDocx } from "@/lib/job-desk/cv-docx";
import { prohibitsAnswerDrafting } from "@/lib/job-desk/answer-drafts";
import { buildApplicantKnown } from "@/lib/job-desk/applicant-known";
import { answersForMatch } from "@/lib/job-desk/assisted-answers";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(request: Request, context: { params: Promise<{ matchId: string }> }) {
  const user = await getCurrentUser();
  if (!user || !(await requireAdmin(user)).allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (request.headers.get("origin") !== new URL(request.url).origin) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  const limit = checkRateLimit(`start-handoff:${user.id}`, 6, 60000);
  if (!limit.allowed) return rateLimitResponse(limit.resetAt);
  const { matchId } = await context.params;
  if (!z.string().uuid().safeParse(matchId).success) return NextResponse.json({ error: "Invalid application." }, { status: 400 });
  try {
    const db = createSupabaseAdminClient();
    const { data: match, error: matchError } = await db.from("job_desk_matches").select("id,order_id,reasons,vacancy:job_desk_vacancies(*,source:job_desk_sources(provider,site_token,active))").eq("id", matchId).single();
    if (matchError || !match) return NextResponse.json({ error: "Application not found." }, { status: 404 });
    const { data: application, error: appError } = await db.from("job_desk_applications").select("status,method,provider_response,provider_message_id,error_message,updated_at").eq("match_id", matchId).eq("order_id", match.order_id).single();
    const evidence = (application?.provider_response ?? {}) as Record<string, unknown>;
    const unusedReservation = application?.status === "needs_human" && evidence.handoffPreparing === true && evidence.clicked === false && !evidence.human_handoff && z.string().uuid().safeParse(evidence.handoffAttemptId).success;
    if (appError || !application || application.method !== "portal" || (!canRetrySubmission(application) && !unusedReservation) || application.provider_message_id) return NextResponse.json({ error: "Submission may already have been attempted. Review the employer receipt before opening a new form." }, { status: 409 });
    const vacancy = Array.isArray(match.vacancy) ? match.vacancy[0] : match.vacancy;
    const source = Array.isArray(vacancy?.source) ? vacancy.source[0] : vacancy?.source;
    if (!vacancy || !source?.active || !canAutomatePortal(source.provider, source.site_token, vacancy.apply_url) || vacancy.status !== "open" || vacancy.review_status !== "approved" || vacancy.duplicate_of || !Array.isArray(match.reasons) || !match.reasons.some((reason: string) => reason.startsWith("Suitability review:"))) return NextResponse.json({ error: "The official vacancy and suitability review need administrator approval first." }, { status: 409 });
    if (prohibitsAnswerDrafting(`${vacancy.description}\n${application.error_message ?? ""}`)) return NextResponse.json({ error: "This employer requires candidate-authored application content. Use the candidate's own materials directly." }, { status: 409 });
    const { data: order, error: orderError } = await db.from("job_desk_orders").select("*,client:job_desk_clients(*)").eq("id", match.order_id).single();
    const { data: cv, error: cvError } = await db.from("job_desk_documents").select("id,status,html,structured_content").eq("order_id", match.order_id).eq("document_type", "revamped_cv").order("version", { ascending: false }).limit(1).maybeSingle();
    const client = Array.isArray(order?.client) ? order.client[0] : order?.client;
    const scope = order?.application_authorized ? readApplicationScope(order.service_details) : null;
    if (orderError || cvError || !order || !hasVerifiedJobDeskPayment(order) || !["approved", "active"].includes(order.status) || !scope || applicationScopeHold(scope, vacancy) || !client?.consent_to_process || cv?.status !== "approved") return NextResponse.json({ error: "Current payment, scope, consent and latest approved CV are required." }, { status: 409 });
    const base = new URL(process.env.APPLICATION_AGENT_URL ?? "");
    const token = process.env.APPLICATION_AGENT_TOKEN;
    if (base.protocol !== "https:" || base.username || base.password || !token) throw new Error("Agent unavailable");
    const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
    const previousId = typeof evidence.handoffAttemptId === "string" && z.string().uuid().safeParse(evidence.handoffAttemptId).success ? evidence.handoffAttemptId : matchId;
    const previousUrl = new URL(`/applications/${previousId}`, base);
    const prior = await fetch(previousUrl, { headers, redirect: "error", cache: "no-store", signal: AbortSignal.timeout(10000) });
    if (prior.ok) {
      const job = await prior.json();
      if (["queued", "running"].includes(job.status)) return NextResponse.json({ preparing: true });
      if (!["finished", "stopped"].includes(job.status) || job.result?.status !== "needs_human" || job.result?.clicked !== false) return NextResponse.json({ error: "The saved agent attempt requires receipt reconciliation, not a new application." }, { status: 409 });
      const retained = await fetch(new URL(`/applications/${previousId}/handoff`, base), { headers: { ...headers, "x-handoff-metadata": "1" }, redirect: "error", cache: "no-store", signal: AbortSignal.timeout(10000) });
      if (retained.ok) return NextResponse.json({ preparing: true });
      if (retained.status !== 410) throw new Error("Prior session unavailable");
    } else if (prior.status !== 404) throw new Error("Prior attempt unavailable");
    const capacityResponse = await fetch(new URL("/handoff/status", base), { headers, redirect: "error", cache: "no-store", signal: AbortSignal.timeout(10000) });
    if (!capacityResponse.ok || !(await capacityResponse.json()).available) return NextResponse.json({ error: "Another retained browser is awaiting admin attention. Close it or wait for its 15-minute expiry before preparing another." }, { status: 409 });
    if (!(await verifyVacancyStillOpen(vacancy))) return NextResponse.json({ error: "The official source no longer lists this vacancy." }, { status: 409 });
    const details = readApplicantDetails(order.service_details);
    let requirements;
    try {
      requirements = await submissionPreflight({ method: "portal", provider: source.provider, siteToken: source.site_token, url: vacancy.apply_url, answers: answersForMatch(order.service_details, matchId, details?.portalAnswers ?? "", cv.id), known: buildApplicantKnown(client, details, String(cv.html)) });
    } catch { return NextResponse.json({ error: "The employer's current requirements could not be verified. Review its official form directly before uploading materials." }, { status: 409 }); }
    if (prohibitsAnswerDrafting(requirements.blockers.join("\n"))) return NextResponse.json({ error: "This employer requires candidate-authored application content. Use the candidate's own materials directly." }, { status: 409 });
    const names = client.full_name.trim().split(/\s+/);
    if (!names[0] || !names.slice(1).length || !client.email || !client.whatsapp_phone) return NextResponse.json({ error: "Verified candidate name, email and phone are required." }, { status: 409 });
    const approvedCvFingerprint = createHash("sha256").update(JSON.stringify([cv.html, cv.structured_content])).digest("hex");
    const local = localApplicationLetter(client.full_name, vacancy.title, vacancy.company_name, cv.id, String(cv.html));
    const cvFile = await createJobDeskCvDocx({ name: client.full_name, role: "", contact: [client.email, client.whatsapp_phone].join("  |  "), content: cv.structured_content, vacancy });
    const letter = await Packer.toBuffer(new Document({ sections: [{ children: local.letter.split(/\n/).map(text => new Paragraph({ text })) }] }));
    const attemptId = randomUUID();
    const data: PortalApplication = { applicationId: attemptId, approvedCvId: cv.id, approvedCvFingerprint, handoffOnly: true, provider: source.provider, siteToken: source.site_token, url: vacancy.apply_url, firstName: names[0], lastName: names.slice(1).join(" "), email: client.email, phone: client.whatsapp_phone, linkedinUrl: details?.applicantLinkedinUrl, portfolioUrl: details?.portfolioUrl, city: details?.currentCity, country: details?.currentCountry, coverLetter: local.letter };
    const history = [...(Array.isArray(evidence.handoffAttemptHistory) ? evidence.handoffAttemptHistory : []), previousId].slice(-10);
    // Persist the stable attempt pointer before transmitting files. A lost response is reconciled, never blindly replayed.
    const { data: claimed, error: claimError } = await db.from("job_desk_applications").update({ provider_response: { ...evidence, clicked: false, handoffAttemptId: attemptId, handoffAttemptHistory: history, handoffStartedBy: user.id, handoffPreparing: true } }).eq("match_id", matchId).eq("status", "needs_human").eq("updated_at", application.updated_at).select("match_id").maybeSingle();
    if (claimError || !claimed) return NextResponse.json({ error: "Application changed. Refresh before preparing a form." }, { status: 409 });
    const response = await fetch(new URL(`/applications/${attemptId}`, base), { method: "POST", headers, body: JSON.stringify({ data, cv: cvFile.toString("base64"), letter: letter.toString("base64") }), redirect: "error", signal: AbortSignal.timeout(20000) });
    if (!response.ok) throw new Error("Agent did not accept form preparation");
    return NextResponse.json({ preparing: true }, { status: 202 });
  } catch { return NextResponse.json({ error: "Could not prepare the browser. Refresh to reconcile the saved attempt before trying again." }, { status: 503 }); }
}
