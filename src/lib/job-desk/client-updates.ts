import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { enqueueTask } from "./automation";

export type ClientUpdate = "cv_review" | "cv_approved" | "matches_ready" | "application_submitted" | "application_needs_action";
const clientUpdateEvents = new Set<ClientUpdate>(["cv_review", "cv_approved", "matches_ready", "application_submitted", "application_needs_action"]);

export async function queueClientUpdate(orderId: string, event: ClientUpdate, reference: string) {
  return enqueueTask("notify_client", `client-update:${event}:${reference}`, orderId, { event, reference });
}

export function clientUpdateContent(event: ClientUpdate, name: string, role?: string, company?: string) {
  const firstName = name.trim().split(/\s+/)[0] || "there";
  const position = [role, company].filter(Boolean).join(" at ");
  const updates: Record<ClientUpdate, { subject: string; body: string }> = {
    cv_review: { subject: "Your CV is being reviewed", body: "Your CV has been prepared and is awaiting a final review. We will update you when it is approved for job matching." },
    cv_approved: { subject: "Your CV is approved", body: "Your CV has been approved. We are checking suitable, currently open vacancies against your experience and preferences. We will request your authorization before any application is submitted." },
    matches_ready: { subject: "Your job matches are being prepared", body: "We have identified potential vacancies and are preparing the relevant application materials. We will share the suitable opportunities for your authorization. No application will be submitted without it." },
    application_submitted: { subject: `Application submitted${position ? `: ${position}` : ""}`, body: `Your application${position ? ` for ${position}` : ""} was submitted through the employer's supported application method. Keep an eye on your email for any reply or next steps from the employer.` },
    application_needs_action: { subject: `Application needs attention${position ? `: ${position}` : ""}`, body: `The application${position ? ` for ${position}` : ""} could not be completed automatically. An employer portal, assessment, identity check or another step needs human attention. We have paused this application and will not claim it was submitted.` }
  };
  const update = updates[event];
  return { subject: `SolvaOne Job Desk: ${update.subject}`, text: `Hello ${firstName},\n\n${update.body}\n\nQuestions? Reply to this email or WhatsApp 0721537597.\n\nSolvaOne Job Desk` };
}

export async function sendClientUpdate(orderId: string, event: ClientUpdate, reference: string) {
  if (!clientUpdateEvents.has(event)) throw new Error("Unknown Job Desk client update event.");
  const db = createSupabaseAdminClient();
  const { data: order, error } = await db.from("job_desk_orders").select("id,client:job_desk_clients(full_name,email)").eq("id", orderId).single();
  if (error || !order) throw new Error(error?.message ?? "Job Desk order not found.");
  const client = Array.isArray(order.client) ? order.client[0] : order.client;
  const email = client?.email?.trim();
  if (!email) throw new Error("Client email is missing. Add it to the Job Desk record before sending updates.");
  if (!process.env.RESEND_API_KEY) throw new Error("RESEND_API_KEY is not configured.");
  const from = process.env.JOB_DESK_FROM_EMAIL ?? process.env.FROM_EMAIL;
  if (!from) throw new Error("Job Desk sender email is not configured.");
  let role: string | undefined;
  let company: string | undefined;
  if (event.startsWith("application_")) {
    const { data: match } = await db.from("job_desk_matches").select("vacancy:job_desk_vacancies(title,company_name)").eq("id", reference).eq("order_id", orderId).maybeSingle();
    const vacancy = Array.isArray(match?.vacancy) ? match.vacancy[0] : match?.vacancy;
    role = vacancy?.title;
    company = vacancy?.company_name;
  }
  const content = clientUpdateContent(event, client.full_name, role, company);
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json", "Idempotency-Key": `job-desk-update-${event}-${reference}` },
    body: JSON.stringify({ from, to: [email], subject: content.subject, text: content.text }),
    signal: AbortSignal.timeout(20000)
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result.id) throw new Error(`Could not send client update (${response.status}).`);
  return { providerMessageId: result.id, recipient: email, event };
}
