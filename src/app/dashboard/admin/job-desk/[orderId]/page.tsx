import { notFound, redirect } from "next/navigation";
import { AppShell } from "@/components/dashboard/app-shell";
import { JobDeskOrderActions } from "@/components/job-desk/order-actions";
import { AutomationControls } from "@/components/job-desk/automation-controls";
import { ManualSubmissionForm } from "@/components/job-desk/manual-submission-form";
import { EmailHandoff } from "@/components/job-desk/email-handoff";
import { ClientEmailForm } from "@/components/job-desk/client-email-form";
import { QuestionnaireResponseForm } from "@/components/job-desk/questionnaire-response-form";
import { CopyCandidateDetails, CopyMatches } from "@/components/job-desk/copy-matches";
import { BatchAuthorizationControl } from "@/components/job-desk/batch-authorization-control";
import { scoreVacancy } from "@/lib/job-desk/matching";
import { createSupabaseServerClient, getCurrentUser } from "@/lib/supabase/server";
import { formatKes } from "@/lib/utils";
import { FileDown } from "lucide-react";

type Question = { id: string; category: string; question: string; reason: string; required?: boolean };

export default async function JobDeskOrderPage({ params }: { params: Promise<{ orderId: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const db = await createSupabaseServerClient();
  const { data: profile } = await db.from("users").select("role").eq("id", user.id).single();
  if (profile?.role !== "admin" && profile?.role !== "super_admin") redirect("/dashboard");
  const { orderId } = await params;

  const [{ data: order, error: orderError }, { data: files }, { data: document }, { data: questionnaire }, { data: aiRun }, { data: rawMatches }, { data: tasks }] = await Promise.all([
    db.from("job_desk_orders").select("*, client:job_desk_clients(*)").eq("id", orderId).single(),
    db.from("job_desk_intake_files").select("id,file_name,document_kind,extraction_status,extraction_warning,created_at").eq("order_id", orderId).order("created_at", { ascending: true }),
    db.from("job_desk_documents").select("id,title,html,status,version,structured_content,created_at").eq("order_id", orderId).eq("document_type", "revamped_cv").neq("status", "superseded").order("version", { ascending: false }).limit(1).maybeSingle(),
    db.from("job_desk_questionnaires").select("questions,status,responses").eq("order_id", orderId).maybeSingle(),
    db.from("job_desk_ai_runs").select("status,total_tokens,estimated_cost,error_message,output_payload,created_at").eq("order_id", orderId).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    db.from("job_desk_matches").select("id,score,reasons,gaps,status,cover_letter,authorized_at,vacancy:job_desk_vacancies(title,company_name,location,workplace_type,description,status,review_status,duplicate_of,last_seen_at,apply_url,application_method,application_email,email_verified),application:job_desk_applications(status,provider_message_id,error_message)").eq("order_id", orderId).order("score", { ascending: false }).limit(50),
    db.from("job_desk_tasks").select("id,task_type,status,last_error,created_at").eq("order_id", orderId).order("created_at", { ascending: false }).limit(12)
  ]);
  if (orderError && orderError.code !== "PGRST116") throw new Error(`Could not load Job Desk order: ${orderError.message}`);
  if (!order) notFound();
  const { data: candidate, error: candidateError } = await db.from("job_desk_candidate_profiles").select("*").eq("client_id", order.client_id).maybeSingle();
  if (candidateError) throw new Error(`Could not load candidate profile: ${candidateError.message}`);
  const client = Array.isArray(order.client) ? order.client[0] : order.client;
  const serviceDetails = (order.service_details ?? {}) as Record<string, string>;
  const isJobSearch = order.service_type === "job_search_full";
  const isCvService = isJobSearch || order.service_type === "cv_revamp" || order.service_type === "cv_build";
  const paymentNeedsReview = order.payment_status === "paid" && (Number(order.amount) <= 0 || !order.payment_reference);
  const file = files?.find((item) => item.document_kind === "cv");
  const questions = (questionnaire?.questions ?? []) as Question[];
  const matches = (rawMatches ?? []).filter((match) => {
    const vacancy = Array.isArray(match.vacancy) ? match.vacancy[0] : match.vacancy;
    return vacancy && vacancy.status === "open" && vacancy.review_status === "approved" && !vacancy.duplicate_of
      && Date.now() - new Date(vacancy.last_seen_at).getTime() <= 72 * 3600000
      && match.status !== "rejected" && (match.reasons as string[]).some((reason) => reason.startsWith("Suitability review:"))
      && scoreVacancy(vacancy, candidate ?? {}).score >= 25;
  });
  const copyableJobs = matches.map((match) => {
    const vacancy = Array.isArray(match.vacancy) ? match.vacancy[0] : match.vacancy;
    return { title: vacancy.title, company: vacancy.company_name, location: vacancy.location, url: vacancy.apply_url };
  });
  const extracted = (candidate?.structured_profile ?? {}) as Record<string, unknown>;
  const candidateDetails = [
    `Name: ${client?.full_name ?? ""}`, `Email: ${client?.email ?? ""}`, `Phone: ${client?.whatsapp_phone ?? ""}`,
    `Location: ${String(extracted.location ?? "")}`, `LinkedIn: ${String(extracted.linkedIn ?? "")}`,
    `Professional summary: ${String(extracted.professionalSummary ?? "")}`,
    `Skills: ${Array.isArray(extracted.skills) ? extracted.skills.join(", ") : ""}`,
    `Tools: ${Array.isArray(extracted.tools) ? extracted.tools.join(", ") : ""}`,
    `Experience: ${Array.isArray(extracted.experience) ? extracted.experience.map((item: { jobTitle?: string; employer?: string; startDate?: string; endDate?: string }) => `${item.jobTitle ?? ""} at ${item.employer ?? ""} (${item.startDate ?? ""} - ${item.endDate ?? ""})`).join("; ") : ""}`,
    `Education: ${Array.isArray(extracted.education) ? extracted.education.map((item: { qualification?: string; institution?: string }) => `${item.qualification ?? ""}, ${item.institution ?? ""}`).join("; ") : ""}`
  ].join("\n");

  return (
    <AppShell email={user.email} isAdmin>
      <div className="flex flex-col justify-between gap-5 border-b border-black/10 pb-6 dark:border-white/10 lg:flex-row lg:items-end">
        <div><a href="/dashboard/admin/job-desk" className="text-sm font-bold text-brand-blue">Job Desk / Orders</a><h1 className="mt-2 text-3xl font-black">{client?.full_name ?? "Client order"}</h1><p className="mt-2 text-sm text-black/55 dark:text-white/55">{order.service_type.replaceAll("_", " ")} · {client?.whatsapp_phone} · {order.status.replaceAll("_", " ")}</p></div>
        <JobDeskOrderActions key={order.status} orderId={orderId} canProcess={isCvService && file?.extraction_status === "succeeded" && order.status !== "cv_processing"} canApprove={isCvService && document?.status === "review"} currentStatus={order.status} paymentStatus={order.payment_status} paymentNeedsReview={paymentNeedsReview} showCvActions={isCvService} />
      </div>
      {paymentNeedsReview ? <p role="alert" className="mt-5 border-l-4 border-brand-blue bg-brand-blue/5 p-4 text-sm font-semibold">This order is marked paid without a positive amount and receipt reference. Verify the payment record before treating it as confirmed.</p> : null}

      <div className="grid gap-6 py-7 xl:grid-cols-[340px_minmax(0,1fr)]">
        <aside className="space-y-6">
          <Panel title="Order"><Detail label="Payment" value={`${order.payment_status} · ${formatKes(order.amount)}`} /><Detail label="Reference" value={order.payment_reference || "Not recorded"} /><Detail label="Channel" value={order.source_channel} /><Detail label="Created" value={new Date(order.created_at).toLocaleString()} /></Panel>
          {isJobSearch ? <Panel title="Client contact"><ClientEmailForm orderId={orderId} email={client?.email ?? ""} /></Panel> : null}
          {order.instructions ? <Panel title="Client instructions"><p className="whitespace-pre-wrap text-sm leading-6">{order.instructions}</p></Panel> : null}
          {order.service_type === "interview_coaching" ? <Panel title="Interview coaching"><Detail label="Position" value={serviceDetails.positionName || "Not provided"} /><Detail label="Organization" value={serviceDetails.organizationName || "Not provided"} /><Detail label="Phone" value={client?.whatsapp_phone || "Not provided"} /></Panel> : null}
          {order.service_type === "linkedin_revamp" ? <Panel title="LinkedIn revamp"><Detail label="Profile" value={serviceDetails.linkedInUrl || "Not provided"} /><Detail label="Contact email" value={serviceDetails.linkedInEmail || "Not provided"} /><p className="text-xs">Clients must not share account passwords. Send recommended profile changes for them to apply.</p></Panel> : null}
          <Panel title="Preferences"><Detail label="Target roles" value={(candidate?.target_job_titles ?? []).join(", ") || "Not provided"} /><Detail label="Industries" value={(candidate?.preferred_industries ?? []).join(", ") || "Not provided"} /><Detail label="Locations" value={(candidate?.preferred_locations ?? []).join(", ") || "Not provided"} /><Detail label="Work arrangement" value={candidate?.remote_preference || "Flexible"} /><Detail label="Profile completeness" value={`${candidate?.completeness_score ?? 0}%`} /></Panel>
          <Panel title="Intake files">{files?.length ? files.map((item) => <div key={item.id} className="border-b border-black/10 pb-3 dark:border-white/10"><a className="break-all text-sm font-bold text-brand-blue" href={`/api/admin/job-desk/orders/${orderId}/files/${item.id}`}>{item.file_name}</a><Detail label="Type" value={item.document_kind} />{item.document_kind === "cv" ? <Detail label="Extraction" value={item.extraction_status} /> : null}{item.extraction_warning ? <p className="mt-2 text-xs leading-5 text-black/55 dark:text-white/55">{item.extraction_warning}</p> : null}</div>) : <p className="text-sm">No files uploaded.</p>}</Panel>
          <Panel title="Processing cost"><Detail label="Last run" value={aiRun?.status ?? "Not started"} /><Detail label="Tokens" value={Number(aiRun?.total_tokens ?? 0).toLocaleString()} /><Detail label="Estimated cost" value={`$${Number(aiRun?.estimated_cost ?? 0).toFixed(4)}`} />{aiRun?.error_message ? <p className="mt-3 text-xs font-semibold text-black dark:text-white">{aiRun.error_message}</p> : null}{((aiRun?.output_payload as { processingNotes?: string[] } | null)?.processingNotes ?? []).map((note, index) => <p key={index} className="mt-2 text-xs leading-5">{note}</p>)}</Panel>
        </aside>

        <main className="min-w-0 space-y-7">
          {copyableJobs.length ? <CopyMatches jobs={copyableJobs} /> : null}
          {document?.status === "approved" ? <CopyCandidateDetails details={candidateDetails} /> : null}
          {isJobSearch ? <div>
          <section className="border-b border-black/10 pb-6 dark:border-white/10"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-xl font-black">Job search and applications</h2><p className="mt-1 text-sm text-black/50 dark:text-white/50">Only approved CVs and paid orders can be matched. Every vacancy needs client consent before submission.</p></div><div className="flex gap-3"><AutomationControls action="match" id={orderId} label="Find matching jobs" /><a href={`/dashboard/admin/job-desk/${orderId}/report`} className="rounded border border-brand-blue px-3 py-2 text-xs font-bold text-brand-blue">Client report</a></div></div><div className="mt-5 divide-y divide-black/10 dark:divide-white/10">{matches?.length ? matches.map((match) => { const vacancy = Array.isArray(match.vacancy) ? match.vacancy[0] : match.vacancy; const application = Array.isArray(match.application) ? match.application[0] : match.application; return <div key={match.id} className="py-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><a href={vacancy?.apply_url} target="_blank" rel="noopener noreferrer" className="font-bold text-brand-blue">{vacancy?.title}</a><p className="text-sm">{vacancy?.company_name} · {vacancy?.location} · {match.score}% match · {match.status.replaceAll("_", " ")}</p><p className="mt-1 text-xs text-black/50 dark:text-white/50">{(match.reasons as string[]).join(" · ")}</p>{application?.provider_message_id ? <p className="mt-1 text-xs">Submission confirmation: {application.provider_message_id}</p> : null}{application?.error_message ? <p className="mt-1 text-xs">Needs review: {application.error_message}</p> : null}</div><div>{match.status === "suggested" ? <AutomationControls action="prepare" id={match.id} label="Prepare letter" /> : match.status === "ready" ? <AutomationControls action="authorize_link" id={match.id} label="Create consent link" /> : null}</div></div>{match.authorized_at && match.status === "needs_human" && vacancy?.application_method === "email" && vacancy.email_verified && vacancy.application_email && match.cover_letter ? <EmailHandoff matchId={match.id} recipient={vacancy.application_email} subject={`Application: ${vacancy.title} - ${client?.full_name ?? "Candidate"}`} body={`${match.cover_letter}\n\nCandidate contact: ${client?.email ?? ""}; ${client?.whatsapp_phone ?? ""}`} /> : null}{match.status === "needs_human" ? <ManualSubmissionForm matchId={match.id} method={vacancy?.application_method === "email" ? "email" : "portal"} /> : null}{match.cover_letter ? <details className="mt-3 text-sm"><summary className="cursor-pointer font-bold">View tailored cover letter</summary><pre className="mt-2 whitespace-pre-wrap font-sans leading-6">{match.cover_letter}</pre></details> : null}</div>; }) : <p className="py-4 text-sm text-black/50 dark:text-white/50">No matches yet. Approve the CV, then find matching jobs.</p>}</div><div className="mt-5 text-xs text-black/55 dark:text-white/55">{tasks?.map((task) => <p key={task.id}>{task.task_type}: {task.status}{task.last_error ? ` · ${task.last_error}` : ""}</p>)}</div></section>
          <BatchAuthorizationControl orderId={orderId} readyCount={matches.filter((match) => match.status === "ready").length} />
          </div> : null}
          {isCvService ? <section><div className="flex items-end justify-between border-b border-black/10 pb-3 dark:border-white/10"><div><h2 className="text-xl font-black">Consolidated client questions</h2><p className="mt-1 text-sm text-black/50 dark:text-white/50">Ask once, then record all missing details together.</p></div><span className="text-sm font-bold text-brand-blue">{questions.length} questions</span></div>
            {questions.length ? <QuestionnaireResponseForm orderId={orderId} questions={questions} responses={(questionnaire?.responses ?? {}) as Record<string, string>} /> : <p className="py-8 text-sm text-black/50 dark:text-white/50">Process the CV to create one consolidated questionnaire.</p>}
          </section> : null}

          {isCvService ? <section><div className="flex flex-wrap items-end justify-between gap-3 border-b border-black/10 pb-3 dark:border-white/10"><div><h2 className="text-xl font-black">Approval-ready CV</h2><p className="mt-1 text-sm text-black/50 dark:text-white/50">Review every fact before approving or using it for applications.</p></div>{document ? <div className="flex flex-wrap items-center gap-2"><span className="mr-2 text-sm font-bold text-brand-blue">Version {document.version} · {document.status}</span><a href={`/api/admin/job-desk/orders/${orderId}/download?format=pdf`} className="inline-flex h-9 items-center gap-2 rounded border border-black/20 px-3 text-sm font-bold dark:border-white/20"><FileDown className="h-4 w-4" />PDF</a><a href={`/api/admin/job-desk/orders/${orderId}/download?format=docx`} className="inline-flex h-9 items-center gap-2 rounded border border-black/20 px-3 text-sm font-bold dark:border-white/20"><FileDown className="h-4 w-4" />Word</a></div> : null}</div>
            {document?.html ? <article className="job-desk-cv mt-5 bg-white p-8 text-black shadow-soft" dangerouslySetInnerHTML={{ __html: document.html }} /> : <div className="mt-5 border border-dashed border-black/20 px-5 py-16 text-center dark:border-white/20"><p className="font-bold">No processed CV yet</p><p className="mt-2 text-sm text-black/50 dark:text-white/50">Use “Prepare CV and profile” after confirming the intake text is readable.</p></div>}
          </section> : null}
        </main>
      </div>
    </AppShell>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) { return <section className="border-t-2 border-black pt-4 dark:border-white"><h2 className="text-sm font-black uppercase">{title}</h2><div className="mt-4 space-y-3">{children}</div></section>; }
function Detail({ label, value }: { label: string; value: string }) { return <div><div className="text-xs font-bold uppercase text-black/40 dark:text-white/40">{label}</div><div className="mt-1 break-words text-sm font-semibold capitalize">{value}</div></div>; }
